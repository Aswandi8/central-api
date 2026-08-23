import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "BANNED"] as const;

const SORT_FIELDS = [
  "name",
  "email",
  "status",
  "createdAt",
  "updatedAt",
] as const;

type UserStatusFilter = (typeof USER_STATUSES)[number];
type SortField = (typeof SORT_FIELDS)[number];
type SortOrder = "asc" | "desc";

function isUserStatus(value: string): value is UserStatusFilter {
  return USER_STATUSES.includes(value as UserStatusFilter);
}

function isSortField(value: string): value is SortField {
  return SORT_FIELDS.includes(value as SortField);
}

export async function GET(request: Request) {
  const auth = await requirePermission(request, "user.read");

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

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");

  const limitParam = Number(searchParams.get("limit") ?? "20");

  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";

  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";

  const verifiedParam = searchParams.get("verified")?.trim() ?? "";

  const bannedParam = searchParams.get("banned")?.trim() ?? "";

  const roleId = searchParams.get("role")?.trim() || undefined;

  const sortParam = searchParams.get("sort")?.trim() ?? "createdAt";

  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "desc";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const status = isUserStatus(statusParam) ? statusParam : undefined;

  const verified =
    verifiedParam === "true"
      ? true
      : verifiedParam === "false"
        ? false
        : undefined;

  const banned =
    bannedParam === "true" ? true : bannedParam === "false" ? false : undefined;

  const sort: SortField = isSortField(sortParam) ? sortParam : "createdAt";

  const order: SortOrder = orderParam === "asc" ? "asc" : "desc";

  const skip = (page - 1) * limit;

  const where = {
    ...(q
      ? {
          OR: [
            {
              name: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),

    ...(status
      ? {
          status,
        }
      : {}),

    ...(verified !== undefined
      ? {
          emailVerified: verified,
        }
      : {}),

    ...(banned !== undefined
      ? {
          banned,
        }
      : {}),

    ...(roleId
      ? {
          OR: [
            {
              globalRoles: {
                some: {
                  roleId,
                },
              },
            },
            {
              websiteRoles: {
                some: {
                  roleId,
                },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "name"
      ? { name: order }
      : sort === "email"
        ? { email: order }
        : sort === "status"
          ? { status: order }
          : sort === "updatedAt"
            ? { updatedAt: order }
            : { createdAt: order };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take: limit,

      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        status: true,
        role: true,
        banned: true,
        banReason: true,
        banExpires: true,
        createdAt: true,
        updatedAt: true,

        globalRoles: {
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

        websiteRoles: {
          select: {
            websiteId: true,

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
              },
            },
          },
        },
      },
    }),

    prisma.user.count({
      where,
    }),
  ]);

  return NextResponse.json({
    success: true,

    data: users.map((user) => {
      const allRoles = [
        ...user.globalRoles.map((assignment) => assignment.role),

        ...user.websiteRoles.map((assignment) => assignment.role),
      ];

      const uniqueRoles = [
        ...new Map(allRoles.map((role) => [role.id, role])).values(),
      ];

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        status: user.status,
        role: user.role,
        banned: user.banned ?? false,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,

        // Compatibility untuk Veyra.
        roles: uniqueRoles,

        globalRoles: user.globalRoles.map((assignment) => assignment.role),

        websiteRoles: user.websiteRoles.map((assignment) => ({
          website: assignment.website,
          role: assignment.role,
        })),
      };
    }),

    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}
