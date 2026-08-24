import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { isProtectedUser } from "@/lib/admin/protected-user";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MEMBER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "BANNED"] as const;
const MEMBER_SORT_FIELDS = [
  "name",
  "email",
  "role",
  "status",
  "createdAt",
] as const;

type MemberStatus = (typeof MEMBER_STATUSES)[number];
type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];
type SortOrder = "asc" | "desc";

const memberSchema = z.object({
  userId: z.string().trim().min(1, "User is required"),
  roleId: z.string().trim().min(1, "Role is required"),
});

const removeMemberSchema = z.object({
  userId: z.string().trim().min(1, "User is required"),
});

const ROLE_PRIORITY: Record<string, number> = {
  WEBSITE_ADMIN: 100,
  TEAM_LEAD: 80,
  CONTENT_MANAGER: 60,
  EDITOR: 50,
  DESIGNER: 50,
  ANALYST: 40,
  AUDITOR: 40,
};

function isMemberStatus(value: string): value is MemberStatus {
  return MEMBER_STATUSES.includes(value as MemberStatus);
}

function isMemberSortField(value: string): value is MemberSortField {
  return MEMBER_SORT_FIELDS.includes(value as MemberSortField);
}

function getRolePriority(roleName: string): number {
  return ROLE_PRIORITY[roleName] ?? 10;
}

function canManageRole(
  isSuperAdmin: boolean,
  actorRoleName: string | undefined,
  targetRoleName: string,
): boolean {
  if (isSuperAdmin) return true;
  if (!actorRoleName) return false;
  if (actorRoleName === "WEBSITE_ADMIN") return true;

  return getRolePriority(targetRoleName) < getRolePriority(actorRoleName);
}

async function getTargetUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      status: true,
      banned: true,
      globalRoles: {
        select: {
          role: {
            select: { name: true },
          },
        },
      },
    },
  });
}

async function getWebsiteRole(roleId: string) {
  return prisma.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      description: true,
      scope: true,
    },
  });
}

// ============================================================
// GET
// ============================================================

export async function GET(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "member.read",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const website = await prisma.website.findUnique({
    where: { id: websiteId },
    select: { id: true, name: true },
  });

  if (!website) {
    return NextResponse.json(
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";
  const verifiedParam =
    searchParams.get("verified")?.trim().toUpperCase() ?? "";
  const roleId = searchParams.get("role")?.trim() || undefined;
  const sortParam = searchParams.get("sort")?.trim() ?? "name";
  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "asc";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const status = isMemberStatus(statusParam) ? statusParam : undefined;
  const verified =
    verifiedParam === "VERIFIED"
      ? true
      : verifiedParam === "UNVERIFIED"
        ? false
        : undefined;

  const sort: MemberSortField = isMemberSortField(sortParam)
    ? sortParam
    : "name";

  const order: SortOrder = orderParam === "desc" ? "desc" : "asc";

  const where = {
    AND: [
      { websiteId },

      ...(roleId ? [{ roleId }] : []),

      ...(status
        ? [
            {
              user: {
                status,
              },
            },
          ]
        : []),

      ...(verified !== undefined
        ? [
            {
              user: {
                emailVerified: verified,
              },
            },
          ]
        : []),

      ...(q
        ? [
            {
              OR: [
                {
                  user: {
                    name: {
                      contains: q,
                      mode: "insensitive" as const,
                    },
                  },
                },
                {
                  user: {
                    email: {
                      contains: q,
                      mode: "insensitive" as const,
                    },
                  },
                },
                {
                  role: {
                    name: {
                      contains: q,
                      mode: "insensitive" as const,
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  const orderBy =
    sort === "email"
      ? { user: { email: order } }
      : sort === "role"
        ? { role: { name: order } }
        : sort === "status"
          ? { user: { status: order } }
          : sort === "createdAt"
            ? { createdAt: order }
            : { user: { name: order } };

  const [assignments, total] = await Promise.all([
    prisma.userWebsiteRole.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      select: {
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            image: true,
            status: true,
            banned: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            scope: true,
          },
        },
      },
    }),

    prisma.userWebsiteRole.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: assignments.map((assignment) => ({
      user: {
        ...assignment.user,
        banned: assignment.user.banned ?? false,
      },
      role: assignment.role,
      assignedAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}

// ============================================================
// POST
// ============================================================

export async function POST(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "member.invite",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = memberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid member data",
      },
      { status: 400 },
    );
  }

  const { userId, roleId } = parsed.data;

  const [user, role, website] = await Promise.all([
    getTargetUser(userId),
    getWebsiteRole(roleId),
    prisma.website.findUnique({
      where: { id: websiteId },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  if (!website) {
    return NextResponse.json(
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 },
    );
  }

  if (isProtectedUser(user.globalRoles)) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN does not require website role assignments",
      },
      { status: 403 },
    );
  }

  if (!role) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 404 },
    );
  }

  if (role.scope !== "WEBSITE") {
    return NextResponse.json(
      {
        success: false,
        error: "Only WEBSITE roles may be assigned to a website",
      },
      { status: 400 },
    );
  }

  const actorRoleName = auth.isSuperAdmin
    ? undefined
    : auth.websiteAssignment?.role.name;

  if (!canManageRole(auth.isSuperAdmin, actorRoleName, role.name)) {
    return NextResponse.json(
      {
        success: false,
        error: `You cannot assign the ${role.name} role`,
      },
      { status: 403 },
    );
  }

  const existing = await prisma.userWebsiteRole.findUnique({
    where: {
      userId_websiteId: {
        userId,
        websiteId,
      },
    },
    select: {
      role: {
        select: { name: true },
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error: `User is already assigned to this website as ${existing.role.name}`,
      },
      { status: 409 },
    );
  }

  const assignment = await prisma.userWebsiteRole.create({
    data: {
      userId,
      websiteId,
      roleId,
    },
    select: {
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          status: true,
          banned: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
        },
      },
      website: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Member assigned successfully",
      data: {
        user: {
          ...assignment.user,
          banned: assignment.user.banned ?? false,
        },
        role: assignment.role,
        website: assignment.website,
        assignedAt: assignment.createdAt,
      },
    },
    { status: 201 },
  );
}

// ============================================================
// PUT
// ============================================================

export async function PUT(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "member.update",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = memberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid member data",
      },
      { status: 400 },
    );
  }

  const { userId, roleId } = parsed.data;

  const [assignment, user, targetRole] = await Promise.all([
    prisma.userWebsiteRole.findUnique({
      where: {
        userId_websiteId: {
          userId,
          websiteId,
        },
      },
      select: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),

    getTargetUser(userId),

    getWebsiteRole(roleId),
  ]);

  if (!assignment) {
    return NextResponse.json(
      { success: false, error: "Website member not found" },
      { status: 404 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 },
    );
  }

  if (isProtectedUser(user.globalRoles)) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN website membership cannot be modified",
      },
      { status: 403 },
    );
  }

  if (!targetRole) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 404 },
    );
  }

  if (targetRole.scope !== "WEBSITE") {
    return NextResponse.json(
      {
        success: false,
        error: "Only WEBSITE roles may be assigned to a website",
      },
      { status: 400 },
    );
  }

  const actorRoleName = auth.isSuperAdmin
    ? undefined
    : auth.websiteAssignment?.role.name;

  if (
    !canManageRole(auth.isSuperAdmin, actorRoleName, assignment.role.name) ||
    !canManageRole(auth.isSuperAdmin, actorRoleName, targetRole.name)
  ) {
    return NextResponse.json(
      { success: false, error: "You cannot modify this member role" },
      { status: 403 },
    );
  }

  const updated = await prisma.userWebsiteRole.update({
    where: {
      userId_websiteId: {
        userId,
        websiteId,
      },
    },
    data: { roleId },
    select: {
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          status: true,
          banned: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    message: "Member role updated successfully",
    data: {
      user: {
        ...updated.user,
        banned: updated.user.banned ?? false,
      },
      role: updated.role,
      updatedAt: updated.updatedAt,
    },
  });
}

// ============================================================
// DELETE
// ============================================================

export async function DELETE(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "member.remove",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = removeMemberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid member data",
      },
      { status: 400 },
    );
  }

  const { userId } = parsed.data;

  const [assignment, user] = await Promise.all([
    prisma.userWebsiteRole.findUnique({
      where: {
        userId_websiteId: {
          userId,
          websiteId,
        },
      },
      select: {
        role: {
          select: { name: true },
        },
      },
    }),

    getTargetUser(userId),
  ]);

  if (!assignment) {
    return NextResponse.json(
      { success: false, error: "Website member not found" },
      { status: 404 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 },
    );
  }

  if (isProtectedUser(user.globalRoles)) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN cannot be removed from a website",
      },
      { status: 403 },
    );
  }

  const actorRoleName = auth.isSuperAdmin
    ? undefined
    : auth.websiteAssignment?.role.name;

  if (!canManageRole(auth.isSuperAdmin, actorRoleName, assignment.role.name)) {
    return NextResponse.json(
      { success: false, error: "You cannot remove this website member" },
      { status: 403 },
    );
  }

  await prisma.userWebsiteRole.delete({
    where: {
      userId_websiteId: {
        userId,
        websiteId,
      },
    },
  });

  return NextResponse.json({
    success: true,
    message: "Member removed from website successfully",
    data: {
      userId,
      websiteId,
    },
  });
}
