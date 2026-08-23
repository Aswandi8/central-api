import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authenticateAdminRequest,
  requirePermission,
} from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

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
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).default("ACTIVE"),
});

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

  const websites = await prisma.website.findMany({
    where: auth.isSuperAdmin
      ? undefined
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
        },

    orderBy: {
      name: "asc",
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
  });

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
