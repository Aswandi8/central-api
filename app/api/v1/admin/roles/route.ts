import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/auth-admin";
import { isSystemRole, SYSTEM_ROLE_NAMES } from "@/lib/admin/system-roles";
import { prisma } from "@/lib/prisma";

const ROLE_SCOPES = ["GLOBAL", "WEBSITE"] as const;
const ROLE_TYPES = ["SYSTEM", "CUSTOM"] as const;
const ROLE_SORT_FIELDS = [
  "name",
  "scope",
  "type",
  "permissions",
  "users",
  "updatedAt",
] as const;

type RoleScope = (typeof ROLE_SCOPES)[number];
type RoleType = (typeof ROLE_TYPES)[number];
type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];
type SortOrder = "asc" | "desc";

function isRoleScope(value: string): value is RoleScope {
  return ROLE_SCOPES.includes(value as RoleScope);
}

function isRoleType(value: string): value is RoleType {
  return ROLE_TYPES.includes(value as RoleType);
}

function isRoleSortField(value: string): value is RoleSortField {
  return ROLE_SORT_FIELDS.includes(value as RoleSortField);
}

export async function GET(request: Request) {
  const auth = await requirePermission(request, "role.read");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const scopeParam = searchParams.get("scope")?.trim().toUpperCase() ?? "";
  const typeParam = searchParams.get("type")?.trim().toUpperCase() ?? "";
  const sortParam = searchParams.get("sort")?.trim() ?? "name";
  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "asc";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;
  const scope = isRoleScope(scopeParam) ? scopeParam : undefined;
  const type = isRoleType(typeParam) ? typeParam : undefined;
  const sort: RoleSortField = isRoleSortField(sortParam) ? sortParam : "name";
  const order: SortOrder = orderParam === "desc" ? "desc" : "asc";

  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(scope ? { scope } : {}),
    ...(type === "SYSTEM" ? { name: { in: [...SYSTEM_ROLE_NAMES] } } : {}),
    ...(type === "CUSTOM" ? { name: { notIn: [...SYSTEM_ROLE_NAMES] } } : {}),
  };

  const roles = await prisma.role.findMany({
    where,
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
        orderBy: { permission: { name: "asc" } },
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

  const normalized = roles.map((role) => ({
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
    permissions: role.rolePermissions.map((item) => item.permission),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }));

  normalized.sort((a, b) => {
    let comparison = 0;

    switch (sort) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "scope":
        comparison = a.scope.localeCompare(b.scope);
        break;
      case "type":
        comparison = Number(a.system) - Number(b.system);
        break;
      case "permissions":
        comparison = a.permissionCount - b.permissionCount;
        break;
      case "users":
        comparison = a.userCount - b.userCount;
        break;
      case "updatedAt":
        comparison =
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }

    return order === "asc" ? comparison : -comparison;
  });

  const total = normalized.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return NextResponse.json({
    success: true,
    data: normalized.slice(start, start + limit),
    pagination: { page: safePage, limit, total, totalPages },
  });
}

export async function POST(request: Request) {
  const auth = await requirePermission(request, "role.create");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  let body: { name?: unknown; description?: unknown; permissions?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const name =
    typeof body.name === "string" ? body.name.trim().toUpperCase() : "";

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Role name is required" },
      { status: 400 },
    );
  }

  if (name.length > 50) {
    return NextResponse.json(
      { success: false, error: "Role name must not exceed 50 characters" },
      { status: 400 },
    );
  }

  if (isSystemRole(name)) {
    return NextResponse.json(
      { success: false, error: "System role names cannot be used" },
      { status: 409 },
    );
  }

  const description =
    body.description === null
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : null;

  const existingRole = await prisma.role.findUnique({
    where: { name },
    select: { id: true },
  });

  if (existingRole) {
    return NextResponse.json(
      { success: false, error: "Role already exists" },
      { status: 409 },
    );
  }

  if (body.permissions !== undefined && !Array.isArray(body.permissions)) {
    return NextResponse.json(
      { success: false, error: "Permissions must be an array" },
      { status: 400 },
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
          where: { name: { in: uniquePermissions } },
          select: { id: true, name: true },
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
      { status: 400 },
    );
  }

  const role = await prisma.role.create({
    data: {
      name,
      description,
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
        orderBy: { permission: { name: "asc" } },
        select: {
          permission: {
            select: { id: true, name: true, description: true },
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
        permissions: role.rolePermissions.map((item) => item.permission),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    },
    { status: 201 },
  );
}
