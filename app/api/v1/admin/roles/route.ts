import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { isSystemRole } from "@/lib/admin/system-roles";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
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

  const roles = await prisma.role.findMany({
    orderBy: [
      {
        scope: "asc",
      },
      {
        name: "asc",
      },
    ],
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

  return NextResponse.json({
    success: true,

    data: roles.map((role) => ({
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
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, "role.create");

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

  /* =========================================================
     NAME
  ========================================================= */

  const name =
    typeof body.name === "string" ? body.name.trim().toUpperCase() : "";

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

  if (isSystemRole(name)) {
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

  /* =========================================================
     DESCRIPTION
  ========================================================= */

  const description =
    body.description === null
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : null;

  /* =========================================================
     DUPLICATE
  ========================================================= */

  const existingRole = await prisma.role.findUnique({
    where: {
      name,
    },
    select: {
      id: true,
    },
  });

  if (existingRole) {
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

  /* =========================================================
     PERMISSIONS
  ========================================================= */

  if (body.permissions !== undefined && !Array.isArray(body.permissions)) {
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

  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter(
        (permission): permission is string =>
          typeof permission === "string" && permission.trim().length > 0,
      )
    : [];

  const uniquePermissions = [
    ...new Set(permissions.map((permission) => permission.trim())),
  ];

  const permissionRecords =
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

  /* =========================================================
     CREATE
  ========================================================= */

  const role = await prisma.role.create({
    data: {
      name,
      description,

      /*
       * Semua custom role yang dibuat
       * melalui Admin API adalah WEBSITE role.
       *
       * GLOBAL role hanya berasal dari
       * system/seed.
       */
      scope: "WEBSITE",

      rolePermissions: {
        create: permissionRecords.map((permission) => ({
          permissionId: permission.id,
        })),
      },
    },

    select: {
      id: true,
      name: true,
      description: true,
      scope: true,
      createdAt: true,
      updatedAt: true,

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

  return NextResponse.json(
    {
      success: true,
      message: "Role created successfully",

      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        scope: role.scope,

        system: false,

        globalUserCount: 0,
        websiteUserCount: 0,
        userCount: 0,
        invitationCount: 0,

        permissionCount: role.rolePermissions.length,

        permissions: role.rolePermissions.map(
          (rolePermission) => rolePermission.permission,
        ),

        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    },
    {
      status: 201,
    },
  );
}
