import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authenticateAdminRequest,
  requirePermission,
} from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const WEBSITE_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"] as const;

const WEBSITE_SORT_FIELDS = [
  "name",
  "domain",
  "status",
  "members",
  "videos",
  "createdAt",
] as const;

type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];
type WebsiteSortField = (typeof WEBSITE_SORT_FIELDS)[number];
type SortOrder = "asc" | "desc";

const createWebsiteSchema = z.object({
  name: z.string().trim().min(1, "Website name is required").max(100),

  slug: z
    .string()
    .trim()
    .min(1, "Website slug is required")
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug may only contain lowercase letters, numbers, and hyphens",
    ),

  description: z.string().trim().max(1000).nullable().optional(),

  domain: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    .transform((value) => value || null),

  status: z.enum(WEBSITE_STATUSES).default("ACTIVE"),
});

function isWebsiteStatus(value: string): value is WebsiteStatus {
  return WEBSITE_STATUSES.includes(value as WebsiteStatus);
}

function isWebsiteSortField(value: string): value is WebsiteSortField {
  return WEBSITE_SORT_FIELDS.includes(value as WebsiteSortField);
}

export async function GET(request: Request) {
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
  // QUERY PARAMS
  // ==========================================================

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";
  const sortParam = searchParams.get("sort")?.trim() ?? "createdAt";
  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "desc";
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;
  const status = isWebsiteStatus(statusParam) ? statusParam : undefined;
  const sort: WebsiteSortField = isWebsiteSortField(sortParam)
    ? sortParam
    : "createdAt";
  const order: SortOrder = orderParam === "asc" ? "asc" : "desc";
  const skip = (page - 1) * limit;

  // ==========================================================
  // ACCESS FILTER
  // ==========================================================

  const accessWhere = auth.isSuperAdmin
    ? {}
    : {
        userRoles: {
          some: {
            userId: auth.user.id,

            role: {
              rolePermissions: {
                some: {
                  permission: {
                    name: "website.read",
                  },
                },
              },
            },
          },
        },
      };

  // ==========================================================
  // SEARCH
  // ==========================================================

  const searchWhere = q
    ? {
        OR: [
          {
            name: {
              contains: q,
              mode: "insensitive" as const,
            },
          },

          {
            slug: {
              contains: q,
              mode: "insensitive" as const,
            },
          },

          {
            domain: {
              contains: q,
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : {};

  // ==========================================================
  // STATUS
  // ==========================================================

  const statusWhere = status
    ? {
        status,
      }
    : {};

  // ==========================================================
  // FINAL WHERE
  // ==========================================================

  const where = {
    AND: [accessWhere, searchWhere, statusWhere],
  };

  // ==========================================================
  // SORT
  // ==========================================================

  const orderBy =
    sort === "name"
      ? {
          name: order,
        }
      : sort === "domain"
        ? {
            domain: order,
          }
        : sort === "status"
          ? {
              status: order,
            }
          : sort === "members"
            ? {
                userRoles: {
                  _count: order,
                },
              }
            : sort === "videos"
              ? {
                  videos: {
                    _count: order,
                  },
                }
              : {
                  createdAt: order,
                };

  // ==========================================================
  // DATABASE
  // ==========================================================

  const [websites, total] = await Promise.all([
    prisma.website.findMany({
      where,
      orderBy,
      skip,
      take: limit,

      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        domain: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        userRoles: {
          where: {
            userId: auth.user.id,
          },

          select: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                scope: true,
              },
            },
          },
        },

        _count: {
          select: {
            userRoles: true,
            videos: true,
            categories: true,
            views: true,
            apiClients: true,
          },
        },
      },
    }),

    prisma.website.count({
      where,
    }),
  ]);

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return NextResponse.json({
    success: true,

    data: websites.map((website) => ({
      id: website.id,
      name: website.name,
      slug: website.slug,
      description: website.description,
      domain: website.domain,
      status: website.status,

      role: auth.isSuperAdmin ? null : (website.userRoles[0]?.role ?? null),

      statistics: {
        members: website._count.userRoles,
        videos: website._count.videos,
        categories: website._count.categories,
        views: website._count.views,
        apiClients: website._count.apiClients,
      },

      createdAt: website.createdAt,
      updatedAt: website.updatedAt,
    })),

    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, "website.create");

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

  const parsed = createWebsiteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid website data",
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  // ==========================================================
  // DUPLICATE CHECK
  // ==========================================================

  const duplicate = await prisma.website.findFirst({
    where: {
      OR: [
        {
          slug: data.slug,
        },

        ...(data.domain
          ? [
              {
                domain: data.domain,
              },
            ]
          : []),
      ],
    },

    select: {
      slug: true,
      domain: true,
    },
  });

  if (duplicate) {
    return NextResponse.json(
      {
        success: false,

        error:
          duplicate.slug === data.slug
            ? "Website slug already exists"
            : "Website domain already exists",
      },
      {
        status: 409,
      },
    );
  }

  // ==========================================================
  // CREATE
  // ==========================================================

  const website = await prisma.website.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      domain: data.domain,
      status: data.status,
    },

    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      domain: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Website created successfully",
      data: website,
    },
    {
      status: 201,
    },
  );
}
