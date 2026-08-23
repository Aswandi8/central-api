import { NextResponse } from "next/server";

import {
  authenticateAdminRequest,
  requireWebsitePermission,
} from "@/lib/admin/auth-admin";

import {
  createSocialShareSchema,
  getSocialShareOrderBy,
  serializeSocialShare,
  socialShareSelect,
  socialSharesQuerySchema,
} from "@/lib/admin/social-shares";

import { prisma } from "@/lib/prisma";

// ============================================================
// GET
// ============================================================

export async function GET(request: Request) {
  const url = new URL(request.url);

  // ==========================================================
  // QUERY
  // ==========================================================

  const parsed = socialSharesQuerySchema.safeParse({
    websiteId: url.searchParams.get("websiteId") ?? undefined,

    q: url.searchParams.get("q") ?? "",

    status: url.searchParams.get("status") ?? undefined,

    page: url.searchParams.get("page") ?? 1,

    limit: url.searchParams.get("limit") ?? 20,

    sort: url.searchParams.get("sort") ?? "createdAt",

    order: url.searchParams.get("order") ?? "desc",
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,

        error: parsed.error.issues[0]?.message ?? "Invalid query",
      },
      {
        status: 400,
      },
    );
  }

  const query = parsed.data;

  // ==========================================================
  // AUTHENTICATION
  // ==========================================================

  const auth = await authenticateAdminRequest(request);

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
  // WEBSITE SCOPE
  // ==========================================================

  /*
   * selectedWebsite:
   *
   * null
   * → All Websites mode
   *
   * Website object
   * → Specific Website mode
   */
  let selectedWebsite: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;

    status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
  } | null = null;

  let accessibleWebsiteIds: string[] = [];

  // ==========================================================
  // SPECIFIC WEBSITE
  // ==========================================================

  if (query.websiteId) {
    /*
     * Specific website still uses the normal
     * website permission guard.
     */
    const websiteAccess = await requireWebsitePermission(
      request,
      query.websiteId,
      "social_share.read",
    );

    if (!websiteAccess.success) {
      return NextResponse.json(
        {
          success: false,
          error: websiteAccess.error,
        },
        {
          status: websiteAccess.status,
        },
      );
    }

    const website = await prisma.website.findUnique({
      where: {
        id: query.websiteId,
      },

      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        status: true,
      },
    });

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

    selectedWebsite = website;

    accessibleWebsiteIds = [website.id];
  }

  // ==========================================================
  // ALL WEBSITES
  // ==========================================================
  else {
    /*
     * SUPER_ADMIN:
     *
     * Every ACTIVE website is readable.
     */
    if (auth.isSuperAdmin) {
      const websites = await prisma.website.findMany({
        where: {
          status: "ACTIVE",
        },

        select: {
          id: true,
        },
      });

      accessibleWebsiteIds = websites.map((website) => website.id);
    } else {

    /*
     * Website-scoped user:
     *
     * Only websites where:
     *
     * - UserWebsiteRole belongs to current user
     * - Website is ACTIVE
     * - assigned role contains social_share.read
     */
      const websites = await prisma.website.findMany({
        where: {
          status: "ACTIVE",

          userRoles: {
            some: {
              userId: auth.user.id,

              role: {
                scope: "WEBSITE",

                rolePermissions: {
                  some: {
                    permission: {
                      name: "social_share.read",
                    },
                  },
                },
              },
            },
          },
        },

        select: {
          id: true,
        },
      });

      accessibleWebsiteIds = websites.map((website) => website.id);
    }
  }

  // ==========================================================
  // WHERE
  // ==========================================================

  const where = {
    websiteId: {
      in: accessibleWebsiteIds,
    },

    ...(query.status
      ? {
          status: query.status,
        }
      : {}),

    ...(query.q
      ? {
          OR: [
            {
              title: {
                contains: query.q,

                mode: "insensitive" as const,
              },
            },

            {
              slug: {
                contains: query.q,

                mode: "insensitive" as const,
              },
            },

            {
              targetUrl: {
                contains: query.q,

                mode: "insensitive" as const,
              },
            },

            {
              website: {
                name: {
                  contains: query.q,

                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  // ==========================================================
  // DATA
  // ==========================================================

  const [total, socialShares] = await prisma.$transaction([
    prisma.socialShare.count({
      where,
    }),

    prisma.socialShare.findMany({
      where,

      skip,

      take: query.limit,

      orderBy: getSocialShareOrderBy(query.sort, query.order),

      select: socialShareSelect,
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return NextResponse.json({
    success: true,

    data: socialShares.map(serializeSocialShare),

    pagination: {
      page: query.page,

      limit: query.limit,

      total,

      totalPages,
    },

    /*
     * Specific website:
     * website object
     *
     * All Websites:
     * null
     */
    website: selectedWebsite,

    scope: {
      mode: selectedWebsite ? "WEBSITE" : "ALL",

      websiteId: selectedWebsite?.id ?? null,

      websiteCount: accessibleWebsiteIds.length,
    },
  });
}

// ============================================================
// POST
// ============================================================

export async function POST(request: Request) {
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

  const parsed = createSocialShareSchema.safeParse(body);

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
  // ACCESS
  // ==========================================================

  /*
   * POST always requires one concrete website.
   */
  const auth = await requireWebsitePermission(
    request,
    data.websiteId,
    "social_share.create",
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

  const website = await prisma.website.findUnique({
    where: {
      id: data.websiteId,
    },

    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      status: true,
    },
  });

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

        error: "Social shares can only be created for an active website",
      },
      {
        status: 409,
      },
    );
  }

  // ==========================================================
  // ACTIVE REQUIREMENTS
  // ==========================================================

  /*
   * ACTIVE Social Share needs a domain,
   * because the public URL will be:
   *
   * https://website.com/watch/[slug]
   */
  if (data.status === "ACTIVE" && !website.domain) {
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

  const duplicate = await prisma.socialShare.findUnique({
    where: {
      websiteId_slug: {
        websiteId: data.websiteId,

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

  // ==========================================================
  // CREATE + AUDIT
  // ==========================================================

  const socialShare = await prisma.$transaction(async (tx) => {
    const created = await tx.socialShare.create({
      data: {
        websiteId: data.websiteId,

        title: data.title,

        slug: data.slug,

        description: data.description ?? null,

        videoUrl: data.videoUrl,

        thumbnail: data.thumbnail,

        shareThumbnail: data.shareThumbnail ?? null,

        duration: data.duration ?? null,

        displayDuration: data.displayDuration ?? null,

        targetUrl: data.targetUrl,

        status: data.status,
      },

      select: socialShareSelect,
    });

    await tx.auditLog.create({
      data: {
        userId: auth.user.id,

        websiteId: data.websiteId,

        action: "CREATE",

        entity: "SOCIAL_SHARE",

        entityId: created.id,

        metadata: {
          title: created.title,

          slug: created.slug,

          status: created.status,

          targetUrl: created.targetUrl,
        },

        userAgent: request.headers.get("user-agent"),
      },
    });

    return created;
  });

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return NextResponse.json(
    {
      success: true,

      message: "Social share created successfully",

      data: serializeSocialShare(socialShare),
    },
    {
      status: 201,
    },
  );
}
