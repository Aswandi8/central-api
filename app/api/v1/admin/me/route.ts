import { NextResponse } from "next/server";

import { authenticateAdminRequest } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

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

  const globalPermissions = [
    ...new Set(
      auth.globalRoles.flatMap((role) =>
        role.rolePermissions.map(
          (rolePermission) => rolePermission.permission.name,
        ),
      ),
    ),
  ];

  const websiteAssignments = auth.isSuperAdmin
    ? []
    : await prisma.userWebsiteRole.findMany({
        where: {
          userId: auth.user.id,
        },

        orderBy: {
          website: {
            name: "asc",
          },
        },

        select: {
          website: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },

          role: {
            select: {
              id: true,
              name: true,
              description: true,
              scope: true,

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
          },
        },
      });

  return NextResponse.json({
    success: true,

    user: {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      emailVerified: auth.user.emailVerified,
      image: auth.user.image,
      status: auth.user.status,
      banned: auth.user.banned ?? false,
    },

    superAdmin: auth.isSuperAdmin,

    globalRoles: auth.globalRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,
    })),

    globalPermissions,

    websites: websiteAssignments.map((assignment) => ({
      id: assignment.website.id,
      name: assignment.website.name,
      slug: assignment.website.slug,
      status: assignment.website.status,

      role: {
        id: assignment.role.id,
        name: assignment.role.name,
        description: assignment.role.description,
        scope: assignment.role.scope,
      },

      permissions: assignment.role.rolePermissions.map(
        (rolePermission) => rolePermission.permission.name,
      ),
    })),
  });
}
