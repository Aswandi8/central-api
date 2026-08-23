import { z } from "zod";

// ============================================================
// QUERY
// ============================================================

export const publicSocialShareQuerySchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, "domain is required")
    .max(255, "domain is too long"),
});

// ============================================================
// DOMAIN NORMALIZATION
// ============================================================

export function normalizeWebsiteDomain(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);

    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return (
      trimmed
        .toLowerCase()
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        ?.split(":")[0]
        ?.replace(/\.$/, "") ?? ""
    );
  }
}

// ============================================================
// PUBLIC API BASE URL
// ============================================================

function getPublicApiBaseUrl(): string | null {
  const value = process.env.PUBLIC_API_URL?.trim();

  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

// ============================================================
// WEBSITE BASE URL
// ============================================================

function getWebsiteBaseUrl(domain: string | null): string | null {
  const value = domain?.trim();

  if (!value) {
    return null;
  }

  const baseUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  return baseUrl.replace(/\/+$/, "");
}

// ============================================================
// PUBLIC SHARE URL
// ============================================================

export function getPublicSocialShareUrl(
  domain: string | null,
  slug: string,
): string | null {
  const baseUrl = getWebsiteBaseUrl(domain);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/watch/${encodeURIComponent(slug)}`;
}

// ============================================================
// GENERATED SOCIAL THUMBNAIL URL
// ============================================================

export function getGeneratedSocialThumbnailUrl(
  domain: string | null,
  slug: string,
): string | null {
  const publicApiBaseUrl = getPublicApiBaseUrl();

  if (!publicApiBaseUrl) {
    return null;
  }

  const normalizedDomain = domain ? normalizeWebsiteDomain(domain) : "";

  if (!normalizedDomain) {
    return null;
  }

  const url = new URL(
    `/api/v1/public/social-shares/${encodeURIComponent(slug)}/thumbnail`,
    publicApiBaseUrl,
  );

  url.searchParams.set("domain", normalizedDomain);

  return url.toString();
}

// ============================================================
// SELECT
// ============================================================

export const publicSocialShareSelect = {
  id: true,

  title: true,
  slug: true,
  description: true,

  videoUrl: true,

  thumbnail: true,

  shareThumbnail: true,

  duration: true,

  displayDuration: true,

  targetUrl: true,

  status: true,

  createdAt: true,
  updatedAt: true,

  website: {
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      status: true,
    },
  },
} as const;

// ============================================================
// RECORD
// ============================================================

interface PublicSocialShareRecord {
  id: string;

  title: string;
  slug: string;

  description: string | null;

  videoUrl: string;

  thumbnail: string;

  shareThumbnail: string | null;

  duration: number | null;

  displayDuration: string | null;

  targetUrl: string;

  status: "DRAFT" | "ACTIVE" | "ARCHIVED";

  createdAt: Date;
  updatedAt: Date;

  website: {
    id: string;
    name: string;
    slug: string;

    domain: string | null;

    status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
  };
}

// ============================================================
// SERIALIZER
// ============================================================

export function serializePublicSocialShare(
  socialShare: PublicSocialShareRecord,
) {
  /*
   * Original/fallback image.
   *
   * Kalau user mengisi shareThumbnail,
   * itu dipakai sebagai SOURCE oleh thumbnail generator.
   *
   * Kalau kosong, generator memakai thumbnail biasa.
   */
  const fallbackThumbnail = socialShare.shareThumbnail ?? socialShare.thumbnail;

  /*
   * Generated thumbnail:
   *
   * original/share thumbnail
   * +
   * play button
   * +
   * displayDuration
   */
  const generatedThumbnail = getGeneratedSocialThumbnailUrl(
    socialShare.website.domain,
    socialShare.slug,
  );

  return {
    id: socialShare.id,

    title: socialShare.title,

    slug: socialShare.slug,

    description: socialShare.description,

    videoUrl: socialShare.videoUrl,

    /*
     * Tetap expose original fields.
     */
    thumbnail: socialShare.thumbnail,

    shareThumbnail: socialShare.shareThumbnail,

    /*
     * Ini field yang digunakan Arvane untuk og:image.
     *
     * Normal:
     * → generated thumbnail endpoint
     *
     * Kalau PUBLIC_API_URL belum dikonfigurasi:
     * → fallback ke shareThumbnail / thumbnail asli
     */
    socialThumbnail: generatedThumbnail ?? fallbackThumbnail,

    duration: socialShare.duration,

    displayDuration: socialShare.displayDuration,

    targetUrl: socialShare.targetUrl,

    shareUrl: getPublicSocialShareUrl(
      socialShare.website.domain,
      socialShare.slug,
    ),

    website: {
      id: socialShare.website.id,

      name: socialShare.website.name,

      slug: socialShare.website.slug,

      domain: socialShare.website.domain,
    },

    createdAt: socialShare.createdAt,

    updatedAt: socialShare.updatedAt,
  };
}
