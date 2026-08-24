import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ============================================================
// AUTHENTICATE
// ============================================================

export async function authenticateAdminRequest(request: Request) {
  const authSession = await auth.api.getSession({
    headers: request.headers,
  });

  if (!authSession?.user || !authSession?.session) {
    return {
      success: false as const,
      status: 401,
      error: "Authentication required",
      code: "authentication-required",
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: authSession.user.id,
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
      code: "user-not-found",
    };
  }

  // ==========================================================
  // ACCOUNT STATE
  // ==========================================================

  if (user.banned || user.status === "BANNED") {
    return {
      success: false as const,
      status: 403,
      error: "User account is banned",
      code: "account-banned",
    };
  }

  if (user.status === "SUSPENDED") {
    return {
      success: false as const,
      status: 403,
      error: "User account is suspended",
      code: "account-suspended",
    };
  }

  if (user.status === "INACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "User account is inactive",
      code: "account-inactive",
    };
  }

  if (!user.emailVerified) {
    return {
      success: false as const,
      status: 403,
      error: "Email is not verified",
      code: "email-not-verified",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "User account is not active",
      code: "account-inactive",
    };
  }

  // ==========================================================
  // GLOBAL ROLES
  // ==========================================================

  const globalRoles = user.globalRoles.map((assignment) => assignment.role);

  const isSuperAdmin = globalRoles.some((role) => role.name === "SUPER_ADMIN");

  return {
    success: true as const,

    session: authSession.session,

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

  if (!result.isSuperAdmin) {
    return {
      success: false as const,
      status: 403,
      error: "Admin access required",
      code: "admin-access-required",
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
      code: "permission-required",
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
  const authSession = await auth.api.getSession({
    headers: request.headers,
  });

  if (!authSession?.user || !authSession?.session) {
    return {
      success: false as const,
      status: 401,
      error: "Authentication required",
      code: "authentication-required",
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: authSession.user.id,
    },

    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      status: true,
      banned: true,

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
      code: "user-not-found",
    };
  }

  if (user.banned || user.status === "BANNED") {
    return {
      success: false as const,
      status: 403,
      error: "User account is banned",
      code: "account-banned",
    };
  }

  if (user.status === "SUSPENDED") {
    return {
      success: false as const,
      status: 403,
      error: "User account is suspended",
      code: "account-suspended",
    };
  }

  if (user.status === "INACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "User account is inactive",
      code: "account-inactive",
    };
  }

  if (!user.emailVerified) {
    return {
      success: false as const,
      status: 403,
      error: "Email is not verified",
      code: "email-not-verified",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "User account is not active",
      code: "account-inactive",
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

  if (isSuperAdmin) {
    return {
      success: true as const,

      session: authSession.session,

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
      code: "website-access-required",
    };
  }

  if (websiteAssignment.role.scope !== "WEBSITE") {
    return {
      success: false as const,
      status: 403,
      error: "Invalid website role assignment",
      code: "invalid-website-role",
    };
  }

  const hasPermission = websiteAssignment.role.rolePermissions.some(
    (rolePermission) => rolePermission.permission.name === permissionName,
  );

  if (!hasPermission) {
    return {
      success: false as const,
      status: 403,
      error: `Website permission required: ${permissionName}`,
      code: "website-permission-required",
    };
  }

  return {
    success: true as const,

    session: authSession.session,

    user,

    roles: globalRoles,

    globalRoles,

    isSuperAdmin,

    websiteId,

    websiteAssignment,
  };
}
