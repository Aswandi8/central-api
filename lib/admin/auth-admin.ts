import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ============================================================
// AUTHENTICATE
// ============================================================

export async function authenticateAdminRequest(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return {
      success: false as const,
      status: 401,
      error: "Authentication required",
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    include: {
      globalRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return {
      success: false as const,
      status: 401,
      error: "User not found",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "User account is not active",
    };
  }

  const globalRoles = user.globalRoles.map((assignment) => assignment.role);

  const isSuperAdmin = globalRoles.some((role) => role.name === "SUPER_ADMIN");

  return {
    success: true as const,
    user,
    roles: globalRoles,
    globalRoles,
    isSuperAdmin,
  };
}

// ============================================================
// ADMIN
// ============================================================

export async function requireAdmin(request: Request) {
  const result = await authenticateAdminRequest(request);

  if (!result.success) {
    return result;
  }

  /*
   * Saat ini SUPER_ADMIN adalah satu-satunya GLOBAL system role.
   *
   * ADMIN adalah WEBSITE role, sehingga tidak boleh dianggap
   * sebagai global administrator.
   */
  if (!result.isSuperAdmin) {
    return {
      success: false as const,
      status: 403,
      error: "Admin access required",
    };
  }

  return result;
}

// ============================================================
// GLOBAL PERMISSION
// ============================================================

export async function requirePermission(
  request: Request,
  permissionName: string,
) {
  const result = await authenticateAdminRequest(request);

  if (!result.success) {
    return result;
  }

  if (result.isSuperAdmin) {
    return result;
  }

  const hasPermission = result.globalRoles.some((role) =>
    role.rolePermissions.some(
      (rolePermission) => rolePermission.permission.name === permissionName,
    ),
  );

  if (!hasPermission) {
    return {
      success: false as const,
      status: 403,
      error: `Permission required: ${permissionName}`,
    };
  }

  return result;
}

// ============================================================
// WEBSITE PERMISSION
// ============================================================

export async function requireWebsitePermission(
  request: Request,
  websiteId: string,
  permissionName: string,
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return {
      success: false as const,
      status: 401,
      error: "Authentication required",
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,

      globalRoles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              scope: true,
              rolePermissions: {
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
      },

      websiteRoles: {
        where: {
          websiteId,
        },
        select: {
          userId: true,
          websiteId: true,
          roleId: true,
          createdAt: true,
          updatedAt: true,

          website: {
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
          },

          role: {
            select: {
              id: true,
              name: true,
              description: true,
              scope: true,
              rolePermissions: {
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
      },
    },
  });

  if (!user) {
    return {
      success: false as const,
      status: 401,
      error: "User not found",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "User account is not active",
    };
  }

  // ==========================================================
  // GLOBAL ACCESS
  // ==========================================================

  const globalRoles = user.globalRoles.map((assignment) => assignment.role);

  const isSuperAdmin = globalRoles.some((role) => role.name === "SUPER_ADMIN");

  // ==========================================================
  // WEBSITE ASSIGNMENT
  // ==========================================================

  const websiteAssignment = user.websiteRoles[0] ?? null;

  /*
   * SUPER_ADMIN tidak membutuhkan UserWebsiteRole.
   */
  if (isSuperAdmin) {
    return {
      success: true as const,
      user,
      roles: globalRoles,
      globalRoles,
      isSuperAdmin,
      websiteId,
      websiteAssignment,
    };
  }

  if (!websiteAssignment) {
    return {
      success: false as const,
      status: 403,
      error: "Website access required",
    };
  }

  /*
   * Defensive validation.
   *
   * UserWebsiteRole hanya boleh menggunakan WEBSITE role.
   */
  if (websiteAssignment.role.scope !== "WEBSITE") {
    return {
      success: false as const,
      status: 403,
      error: "Invalid website role assignment",
    };
  }

  // ==========================================================
  // WEBSITE PERMISSION
  // ==========================================================

  const hasPermission = websiteAssignment.role.rolePermissions.some(
    (rolePermission) => rolePermission.permission.name === permissionName,
  );

  if (!hasPermission) {
    return {
      success: false as const,
      status: 403,
      error: `Website permission required: ${permissionName}`,
    };
  }

  return {
    success: true as const,
    user,
    roles: globalRoles,
    globalRoles,
    isSuperAdmin,
    websiteId,
    websiteAssignment,
  };
}
