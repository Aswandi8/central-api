import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { isSuperAdminRole, isSystemRole } from "@/lib/admin/system-roles";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/* ============================================================
   GET
============================================================ */

export async function GET(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "role.read");

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

  const role = await prisma.role.findUnique({
    where: {
      id,
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
          globalUsers: true,
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

  if (!role) {
    return NextResponse.json(
      {
        success: false,
        error: "Role not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,

    data: {
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,

      system: isSystemRole(role.name),

      globalUserCount: role._count.globalUsers,

      websiteUserCount: role._count.websiteUsers,

      userCount: role._count.globalUsers + role._count.websiteUsers,

      invitationCount: role._count.invitations,

      permissionCount: role._count.rolePermissions,

      permissions: role.rolePermissions.map(
        (rolePermission) => rolePermission.permission,
      ),

      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    },
  });
}

/* ============================================================
   PUT
============================================================ */

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "role.update");

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

  const existingRole = await prisma.role.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      name: true,
      description: true,
      scope: true,
    },
  });

  if (!existingRole) {
    return NextResponse.json(
      {
        success: false,
        error: "Role not found",
      },
      {
        status: 404,
      },
    );
  }

  /* =========================================================
     SUPER ADMIN PROTECTION
  ========================================================= */

  if (isSuperAdminRole(existingRole.name)) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN role cannot be modified",
      },
      {
        status: 403,
      },
    );
  }

  let body: {
    name?: unknown;
    description?: unknown;
    permissions?: unknown;
  };

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

  const systemRole = isSystemRole(existingRole.name);

  /* =========================================================
     NAME
  ========================================================= */

  const requestedName =
    typeof body.name === "string"
      ? body.name.trim().toUpperCase()
      : existingRole.name;

  /*
   * System roles selain SUPER_ADMIN
   * boleh edit description/permission,
   * tetapi tidak boleh rename.
   */
  if (systemRole && requestedName !== existingRole.name) {
    return NextResponse.json(
      {
        success: false,
        error: "System role name cannot be changed",
      },
      {
        status: 403,
      },
    );
  }

  const name = systemRole ? existingRole.name : requestedName;

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error: "Role name is required",
      },
      {
        status: 400,
      },
    );
  }

  if (name.length > 50) {
    return NextResponse.json(
      {
        success: false,
        error: "Role name must not exceed 50 characters",
      },
      {
        status: 400,
      },
    );
  }

  if (!systemRole && isSystemRole(name)) {
    return NextResponse.json(
      {
        success: false,
        error: "System role names cannot be used",
      },
      {
        status: 409,
      },
    );
  }

  if (name !== existingRole.name) {
    const duplicateRole = await prisma.role.findUnique({
      where: {
        name,
      },
      select: {
        id: true,
      },
    });

    if (duplicateRole && duplicateRole.id !== id) {
      return NextResponse.json(
        {
          success: false,
          error: "Role already exists",
        },
        {
          status: 409,
        },
      );
    }
  }

  /* =========================================================
     DESCRIPTION
  ========================================================= */

  const description =
    body.description === undefined
      ? undefined
      : body.description === null
        ? null
        : typeof body.description === "string"
          ? body.description.trim() || null
          : undefined;

  if (
    body.description !== undefined &&
    body.description !== null &&
    typeof body.description !== "string"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Description must be a string or null",
      },
      {
        status: 400,
      },
    );
  }

  /* =========================================================
     PERMISSIONS
  ========================================================= */

  let permissionRecords:
    | {
        id: string;
        name: string;
      }[]
    | undefined;

  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions)) {
      return NextResponse.json(
        {
          success: false,
          error: "Permissions must be an array",
        },
        {
          status: 400,
        },
      );
    }

    const permissions = body.permissions.filter(
      (permission): permission is string =>
        typeof permission === "string" && permission.trim().length > 0,
    );

    const uniquePermissions = [
      ...new Set(permissions.map((permission) => permission.trim())),
    ];

    permissionRecords =
      uniquePermissions.length > 0
        ? await prisma.permission.findMany({
            where: {
              name: {
                in: uniquePermissions,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];

    const foundPermissionNames = new Set(
      permissionRecords.map((permission) => permission.name),
    );

    const invalidPermissions = uniquePermissions.filter(
      (permission) => !foundPermissionNames.has(permission),
    );

    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more permissions do not exist",
          invalidPermissions,
        },
        {
          status: 400,
        },
      );
    }
  }

  /* =========================================================
     UPDATE
  ========================================================= */

  const role = await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: {
        id,
      },

      data: {
        name,

        ...(description !== undefined
          ? {
              description,
            }
          : {}),
      },
    });

    if (permissionRecords !== undefined) {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: id,
        },
      });

      if (permissionRecords.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionRecords.map((permission) => ({
            roleId: id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return tx.role.findUnique({
      where: {
        id,
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
            globalUsers: true,
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
  });

  if (!role) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update role",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Role updated successfully",

    data: {
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,

      system: isSystemRole(role.name),

      globalUserCount: role._count.globalUsers,

      websiteUserCount: role._count.websiteUsers,

      userCount: role._count.globalUsers + role._count.websiteUsers,

      invitationCount: role._count.invitations,

      permissionCount: role._count.rolePermissions,

      permissions: role.rolePermissions.map(
        (rolePermission) => rolePermission.permission,
      ),

      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    },
  });
}

/* ============================================================
   DELETE
============================================================ */

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "role.delete");

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

  const role = await prisma.role.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      name: true,
      scope: true,

      _count: {
        select: {
          globalUsers: true,
          websiteUsers: true,
          invitations: true,
        },
      },
    },
  });

  if (!role) {
    return NextResponse.json(
      {
        success: false,
        error: "Role not found",
      },
      {
        status: 404,
      },
    );
  }

  /* =========================================================
     SYSTEM ROLE
  ========================================================= */

  if (isSystemRole(role.name)) {
    return NextResponse.json(
      {
        success: false,
        error: "System roles cannot be deleted",
      },
      {
        status: 403,
      },
    );
  }

  /* =========================================================
     ASSIGNMENTS
  ========================================================= */

  const userCount = role._count.globalUsers + role._count.websiteUsers;

  if (userCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Role cannot be deleted while it is assigned to users",

        globalUserCount: role._count.globalUsers,

        websiteUserCount: role._count.websiteUsers,

        userCount,
      },
      {
        status: 409,
      },
    );
  }

  /* =========================================================
     INVITATIONS
  ========================================================= */

  if (role._count.invitations > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Role cannot be deleted while it is referenced by invitations",

        invitationCount: role._count.invitations,
      },
      {
        status: 409,
      },
    );
  }

  /* =========================================================
     DELETE
  ========================================================= */

  await prisma.role.delete({
    where: {
      id,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Role deleted successfully",

    data: {
      id: role.id,
      name: role.name,
    },
  });
}
