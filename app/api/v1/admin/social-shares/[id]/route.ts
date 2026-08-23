import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import {
  serializeSocialShare,
  socialShareSelect,
  updateSocialShareSchema,
} from "@/lib/admin/social-shares";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// ============================================================
// HELPERS
// ============================================================

function getWebsiteId(request: Request): string {
  return new URL(request.url).searchParams.get("websiteId")?.trim() ?? "";
}

async function getWebsite(websiteId: string) {
  return prisma.website.findUnique({
    where: {
      id: websiteId,
    },

    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      status: true,
    },
  });
}

async function getSocialShare(id: string, websiteId: string) {
  return prisma.socialShare.findFirst({
    where: {
      id,
      websiteId,
    },

    select: socialShareSelect,
  });
}

// ============================================================
// GET
// ============================================================

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const websiteId = getWebsiteId(request);

  if (!websiteId) {
    return NextResponse.json(
      {
        success: false,
        error: "websiteId is required",
      },
      {
        status: 400,
      },
    );
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "social_share.read",
  );

  if (!auth.success) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
      },
      {
        status: auth.status,
      },
    );
  }

  // ==========================================================
  // WEBSITE
  // ==========================================================

  const website = await getWebsite(websiteId);

  if (!website) {
    return NextResponse.json(
      {
        success: false,
        error: "Website not found",
      },
      {
        status: 404,
      },
    );
  }

  if (website.status !== "ACTIVE") {
    return NextResponse.json(
      {
        success: false,
        error: "Website is not active",
      },
      {
        status: 409,
      },
    );
  }

  // ==========================================================
  // SOCIAL SHARE
  // ==========================================================

  const socialShare = await getSocialShare(id, websiteId);

  if (!socialShare) {
    return NextResponse.json(
      {
        success: false,
        error: "Social share not found on this website",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,

    data: serializeSocialShare(socialShare),
  });
}

// ============================================================
// PUT
// ============================================================

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const websiteId = getWebsiteId(request);

  if (!websiteId) {
    return NextResponse.json(
      {
        success: false,
        error: "websiteId is required",
      },
      {
        status: 400,
      },
    );
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "social_share.update",
  );

  if (!auth.success) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
      },
      {
        status: auth.status,
      },
    );
  }

  // ==========================================================
  // WEBSITE
  // ==========================================================

  const website = await getWebsite(websiteId);

  if (!website) {
    return NextResponse.json(
      {
        success: false,
        error: "Website not found",
      },
      {
        status: 404,
      },
    );
  }

  if (website.status !== "ACTIVE") {
    return NextResponse.json(
      {
        success: false,
        error: "Social shares can only be updated for an active website",
      },
      {
        status: 409,
      },
    );
  }

  // ==========================================================
  // EXISTING
  // ==========================================================

  const existing = await getSocialShare(id, websiteId);

  if (!existing) {
    return NextResponse.json(
      {
        success: false,
        error: "Social share not found on this website",
      },
      {
        status: 404,
      },
    );
  }

  // ==========================================================
  // BODY
  // ==========================================================

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = updateSocialShareSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,

        error: parsed.error.issues[0]?.message ?? "Invalid social share data",
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  // ==========================================================
  // ACTIVE REQUIREMENTS
  // ==========================================================

  const nextStatus = data.status ?? existing.status;

  if (nextStatus === "ACTIVE" && !website.domain) {
    return NextResponse.json(
      {
        success: false,
        error: "Website domain is required before activating a social share",
      },
      {
        status: 409,
      },
    );
  }

  // ==========================================================
  // SLUG
  // ==========================================================

  if (data.slug !== undefined && data.slug !== existing.slug) {
    const duplicate = await prisma.socialShare.findUnique({
      where: {
        websiteId_slug: {
          websiteId,
          slug: data.slug,
        },
      },

      select: {
        id: true,
      },
    });

    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          error: "Social share slug already exists on this website",
        },
        {
          status: 409,
        },
      );
    }
  }

  // ==========================================================
  // UPDATE + AUDIT
  // ==========================================================

  const socialShare = await prisma.$transaction(async (tx) => {
    const updated = await tx.socialShare.update({
      where: {
        id,
      },

      data: {
        ...(data.title !== undefined
          ? {
              title: data.title,
            }
          : {}),

        ...(data.slug !== undefined
          ? {
              slug: data.slug,
            }
          : {}),

        ...(data.description !== undefined
          ? {
              description: data.description,
            }
          : {}),

        ...(data.videoUrl !== undefined
          ? {
              videoUrl: data.videoUrl,
            }
          : {}),

        ...(data.thumbnail !== undefined
          ? {
              thumbnail: data.thumbnail,
            }
          : {}),

        ...(data.shareThumbnail !== undefined
          ? {
              shareThumbnail: data.shareThumbnail,
            }
          : {}),

        ...(data.duration !== undefined
          ? {
              duration: data.duration,
            }
          : {}),

        ...(data.displayDuration !== undefined
          ? {
              displayDuration: data.displayDuration,
            }
          : {}),

        ...(data.targetUrl !== undefined
          ? {
              targetUrl: data.targetUrl,
            }
          : {}),

        ...(data.status !== undefined
          ? {
              status: data.status,
            }
          : {}),
      },

      select: socialShareSelect,
    });

    await tx.auditLog.create({
      data: {
        userId: auth.user.id,

        websiteId,

        action: "UPDATE",

        entity: "SOCIAL_SHARE",

        entityId: updated.id,

        metadata: {
          before: {
            title: existing.title,

            slug: existing.slug,

            status: existing.status,

            videoUrl: existing.videoUrl,

            thumbnail: existing.thumbnail,

            displayDuration: existing.displayDuration,

            targetUrl: existing.targetUrl,
          },

          after: {
            title: updated.title,

            slug: updated.slug,

            status: updated.status,

            videoUrl: updated.videoUrl,

            thumbnail: updated.thumbnail,

            displayDuration: updated.displayDuration,

            targetUrl: updated.targetUrl,
          },
        },

        userAgent: request.headers.get("user-agent"),
      },
    });

    return updated;
  });

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return NextResponse.json({
    success: true,

    message: "Social share updated successfully",

    data: serializeSocialShare(socialShare),
  });
}

// ============================================================
// DELETE
// ============================================================

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const websiteId = getWebsiteId(request);

  if (!websiteId) {
    return NextResponse.json(
      {
        success: false,
        error: "websiteId is required",
      },
      {
        status: 400,
      },
    );
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "social_share.delete",
  );

  if (!auth.success) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
      },
      {
        status: auth.status,
      },
    );
  }

  // ==========================================================
  // WEBSITE
  // ==========================================================

  const website = await getWebsite(websiteId);

  if (!website) {
    return NextResponse.json(
      {
        success: false,
        error: "Website not found",
      },
      {
        status: 404,
      },
    );
  }

  if (website.status !== "ACTIVE") {
    return NextResponse.json(
      {
        success: false,
        error: "Social shares can only be deleted from an active website",
      },
      {
        status: 409,
      },
    );
  }

  // ==========================================================
  // SOCIAL SHARE
  // ==========================================================

  const socialShare = await getSocialShare(id, websiteId);

  if (!socialShare) {
    return NextResponse.json(
      {
        success: false,
        error: "Social share not found on this website",
      },
      {
        status: 404,
      },
    );
  }

  // ==========================================================
  // DELETE + AUDIT
  // ==========================================================

  await prisma.$transaction(async (tx) => {
    /*
     * Only the database record is deleted.
     *
     * videoUrl / thumbnail / shareThumbnail point to
     * externally managed CDN assets.
     *
     * Central API MUST NOT delete those external assets.
     */
    await tx.socialShare.delete({
      where: {
        id: socialShare.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: auth.user.id,

        websiteId,

        action: "DELETE",

        entity: "SOCIAL_SHARE",

        entityId: socialShare.id,

        metadata: {
          title: socialShare.title,

          slug: socialShare.slug,

          status: socialShare.status,

          videoUrl: socialShare.videoUrl,

          thumbnail: socialShare.thumbnail,

          shareThumbnail: socialShare.shareThumbnail,

          displayDuration: socialShare.displayDuration,

          targetUrl: socialShare.targetUrl,
        },

        userAgent: request.headers.get("user-agent"),
      },
    });
  });

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return NextResponse.json({
    success: true,

    message: "Social share deleted successfully",

    data: {
      id: socialShare.id,

      websiteId: socialShare.websiteId,

      title: socialShare.title,

      slug: socialShare.slug,
    },
  });
}
