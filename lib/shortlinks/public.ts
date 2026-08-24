import { prisma } from "@/lib/prisma";
import { hashShortLinkIp } from "@/lib/shortlinks/ip-hash";
import type { ShortLinkRequestInfo } from "@/lib/shortlinks/request";

const HUMAN_DUPLICATE_WINDOW_MS = 3_000;
const NON_HUMAN_DUPLICATE_WINDOW_MS = 30_000;

export const PUBLIC_SHORTLINK_SELECT = {
  id: true,
  slug: true,
  destinationUrl: true,
  status: true,
  previewType: true,

  title: true,
  description: true,

  thumbnailUrl: true,
  thumbnailWidth: true,
  thumbnailHeight: true,
  thumbnailMimeType: true,
  thumbnailSizeBytes: true,

  previewVideoUrl: true,
  previewVideoWidth: true,
  previewVideoHeight: true,
  previewVideoDurationMs: true,
  previewVideoMimeType: true,
  previewVideoSizeBytes: true,

  showPlayButton: true,
  displayDuration: true,

  createdAt: true,
  updatedAt: true,
} as const;

export async function resolvePublicShortLink(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  return prisma.shortLink.findUnique({
    where: {
      slug: normalizedSlug,
    },
    select: PUBLIC_SHORTLINK_SELECT,
  });
}

export async function resolveActivePublicShortLink(slug: string) {
  const shortLink = await resolvePublicShortLink(slug);

  if (!shortLink) {
    return {
      state: "NOT_FOUND" as const,
      shortLink: null,
    };
  }

  if (shortLink.status !== "ACTIVE") {
    return {
      state: "INACTIVE" as const,
      shortLink,
    };
  }

  return {
    state: "ACTIVE" as const,
    shortLink,
  };
}

interface TrackShortLinkOptions {
  shortLinkId: string;
  requestInfo: ShortLinkRequestInfo;
}

function createShortLinkEventData(
  shortLinkId: string,
  requestInfo: ShortLinkRequestInfo,
  ipHash: string | null,
) {
  return {
    shortLinkId,

    visitorType: requestInfo.visitor.visitorType,

    ipHash,

    referrer: requestInfo.referrer,

    userAgent: requestInfo.userAgent,

    country: requestInfo.country,

    device: requestInfo.visitor.device,

    browser: requestInfo.visitor.browser,

    os: requestInfo.visitor.os,
  };
}

async function hasRecentDuplicate(
  shortLinkId: string,
  requestInfo: ShortLinkRequestInfo,
  ipHash: string | null,
): Promise<boolean> {
  /*
   * Tanpa IP hash kita tidak melakukan
   * dedup berbasis UA saja karena terlalu
   * mudah menggabungkan visitor berbeda.
   */
  if (!ipHash) {
    return false;
  }

  const isHuman = requestInfo.visitor.visitorType === "HUMAN";

  const windowMs = isHuman
    ? HUMAN_DUPLICATE_WINDOW_MS
    : NON_HUMAN_DUPLICATE_WINDOW_MS;

  const since = new Date(Date.now() - windowMs);

  const duplicate = await prisma.shortLinkClick.findFirst({
    where: {
      shortLinkId,
      ipHash,

      visitorType: requestInfo.visitor.visitorType,

      userAgent: requestInfo.userAgent,

      clickedAt: {
        gte: since,
      },
    },

    select: {
      id: true,
    },

    orderBy: {
      clickedAt: "desc",
    },
  });

  return Boolean(duplicate);
}

export async function trackPublicShortLink({
  shortLinkId,
  requestInfo,
}: TrackShortLinkOptions) {
  const ipHash = hashShortLinkIp(requestInfo.ipAddress);

  const duplicate = await hasRecentDuplicate(shortLinkId, requestInfo, ipHash);

  if (duplicate) {
    return {
      tracked: false,
      duplicate: true,
      counted: false,
      clickCount: null,
    };
  }

  const eventData = createShortLinkEventData(shortLinkId, requestInfo, ipHash);

  if (requestInfo.visitor.visitorType === "HUMAN") {
    const [, shortLink] = await prisma.$transaction([
      prisma.shortLinkClick.create({
        data: eventData,
      }),

      prisma.shortLink.update({
        where: {
          id: shortLinkId,
        },

        data: {
          clickCount: {
            increment: 1,
          },
        },

        select: {
          clickCount: true,
        },
      }),
    ]);

    return {
      tracked: true,
      duplicate: false,
      counted: true,
      clickCount: shortLink.clickCount,
    };
  }

  await prisma.shortLinkClick.create({
    data: eventData,
  });

  return {
    tracked: true,
    duplicate: false,
    counted: false,
    clickCount: null,
  };
}
