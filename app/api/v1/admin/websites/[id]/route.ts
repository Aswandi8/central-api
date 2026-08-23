import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requirePermission,
  requireWebsitePermission,
} from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const updateWebsiteSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),

    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug may only contain lowercase letters, numbers, and hyphens",
      )
      .optional(),

    description: z.string().trim().max(1000).nullable().optional(),

    domain: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional()
      .transform((value) => value || null),

    status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const auth = await requireWebsitePermission(request, id, "website.read");

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

  const website = await prisma.website.findUnique({
    where: {
      id,
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

  return NextResponse.json({
    success: true,

    data: {
      id: website.id,
      name: website.name,
      slug: website.slug,
      description: website.description,
      domain: website.domain,
      status: website.status,

      role:
        !auth.isSuperAdmin && auth.websiteAssignment
          ? {
              id: auth.websiteAssignment.role.id,
              name: auth.websiteAssignment.role.name,
              description: auth.websiteAssignment.role.description,
              scope: auth.websiteAssignment.role.scope,
            }
          : null,

      statistics: {
        members: website._count.userRoles,
        videos: website._count.videos,
        categories: website._count.categories,
        views: website._count.views,
        apiClients: website._count.apiClients,
      },

      createdAt: website.createdAt,
      updatedAt: website.updatedAt,
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const auth = await requireWebsitePermission(request, id, "website.update");

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

  const existingWebsite = await prisma.website.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
    },
  });

  if (!existingWebsite) {
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

  const parsed = updateWebsiteSchema.safeParse(body);

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

  if (data.slug !== undefined || data.domain !== undefined) {
    const duplicate = await prisma.website.findFirst({
      where: {
        id: {
          not: id,
        },

        OR: [
          ...(data.slug
            ? [
                {
                  slug: data.slug,
                },
              ]
            : []),

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
            data.slug && duplicate.slug === data.slug
              ? "Website slug already exists"
              : "Website domain already exists",
        },
        {
          status: 409,
        },
      );
    }
  }

  const website = await prisma.website.update({
    where: {
      id,
    },

    data: {
      ...(data.name !== undefined
        ? {
            name: data.name,
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

      ...(data.domain !== undefined
        ? {
            domain: data.domain,
          }
        : {}),

      ...(data.status !== undefined
        ? {
            status: data.status,
          }
        : {}),
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
    message: "Website updated successfully",

    data: {
      id: website.id,
      name: website.name,
      slug: website.slug,
      description: website.description,
      domain: website.domain,
      status: website.status,

      statistics: {
        members: website._count.userRoles,
        videos: website._count.videos,
        categories: website._count.categories,
        views: website._count.views,
        apiClients: website._count.apiClients,
      },

      createdAt: website.createdAt,
      updatedAt: website.updatedAt,
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "website.delete");

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

  const { id } = await context.params;

  const website = await prisma.website.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      name: true,

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

  const contentCount =
    website._count.videos +
    website._count.categories +
    website._count.views +
    website._count.apiClients;

  if (contentCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Website cannot be deleted while it still contains content, analytics, or API clients",

        statistics: {
          members: website._count.userRoles,
          videos: website._count.videos,
          categories: website._count.categories,
          views: website._count.views,
          apiClients: website._count.apiClients,
        },
      },
      {
        status: 409,
      },
    );
  }

  await prisma.website.delete({
    where: {
      id,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Website deleted successfully",

    data: {
      id: website.id,
      name: website.name,
    },
  });
}
