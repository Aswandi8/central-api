import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { isSystemRole } from "@/lib/admin/system-roles";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

  /* =========================================================
     ACCESS
  ========================================================= */

  const auth = await requireWebsitePermission(request, websiteId, "role.read");

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

  /* =========================================================
     WEBSITE
  ========================================================= */

  const website = await prisma.website.findUnique({
    where: {
      id: websiteId,
    },

    select: {
      id: true,
      name: true,
      slug: true,
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

  /* =========================================================
     WEBSITE ROLES
  ========================================================= */

  const roles = await prisma.role.findMany({
    where: {
      scope: "WEBSITE",
    },

    orderBy: {
      name: "asc",
    },

    select: {
      id: true,
      name: true,
      description: true,
      scope: true,
      createdAt: true,
      updatedAt: true,

      _count: {
        select: {
          websiteUsers: true,
          rolePermissions: true,
          invitations: true,
        },
      },

      rolePermissions: {
        orderBy: {
          permission: {
            name: "asc",
          },
        },

        select: {
          permission: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      },
    },
  });

  /* =========================================================
     RESPONSE
  ========================================================= */

  return NextResponse.json({
    success: true,

    data: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,

      system: isSystemRole(role.name),

      websiteUserCount: role._count.websiteUsers,

      invitationCount: role._count.invitations,

      permissionCount: role._count.rolePermissions,

      permissions: role.rolePermissions.map(
        (rolePermission) => rolePermission.permission,
      ),

      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    })),

    website,
  });
}
