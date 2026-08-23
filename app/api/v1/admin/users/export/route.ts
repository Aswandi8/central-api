import ExcelJS from "exceljs";
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

const BATCH_SIZE = 500;

function isUserStatus(value: string): value is UserStatusFilter {
  return USER_STATUSES.includes(value as UserStatusFilter);
}

function isSortField(value: string): value is SortField {
  return SORT_FIELDS.includes(value as SortField);
}

function sanitizeExcelText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
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

  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";

  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";

  const verifiedParam = searchParams.get("verified")?.trim() ?? "";

  const bannedParam = searchParams.get("banned")?.trim() ?? "";

  const roleId = searchParams.get("role")?.trim() || undefined;

  const sortParam = searchParams.get("sort")?.trim() ?? "createdAt";

  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "desc";

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

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Veyra";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Users", {
    views: [
      {
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  worksheet.columns = [
    {
      header: "Name",
      key: "name",
      width: 28,
    },
    {
      header: "Email",
      key: "email",
      width: 36,
    },
    {
      header: "Status",
      key: "status",
      width: 16,
    },
    {
      header: "Email Verified",
      key: "emailVerified",
      width: 18,
    },
    {
      header: "Banned",
      key: "banned",
      width: 12,
    },
    {
      header: "Roles",
      key: "roles",
      width: 30,
    },
    {
      header: "Websites",
      key: "websites",
      width: 36,
    },
    {
      header: "Created At",
      key: "createdAt",
      width: 22,
    },
    {
      header: "Updated At",
      key: "updatedAt",
      width: 22,
    },
  ];

  const headerRow = worksheet.getRow(1);

  headerRow.font = {
    bold: true,
  };

  headerRow.alignment = {
    vertical: "middle",
  };

  headerRow.height = 22;

  worksheet.autoFilter = {
    from: {
      row: 1,
      column: 1,
    },
    to: {
      row: 1,
      column: worksheet.columns.length,
    },
  };

  let offset = 0;

  while (true) {
    const users = await prisma.user.findMany({
      where,
      orderBy,
      skip: offset,
      take: BATCH_SIZE,

      select: {
        name: true,
        email: true,
        status: true,
        emailVerified: true,
        banned: true,
        createdAt: true,
        updatedAt: true,

        globalRoles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },

        websiteRoles: {
          select: {
            website: {
              select: {
                name: true,
              },
            },

            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (users.length === 0) {
      break;
    }

    for (const user of users) {
      const roleNames = [
        ...user.globalRoles.map((assignment) => assignment.role.name),

        ...user.websiteRoles.map((assignment) => assignment.role.name),
      ];

      const uniqueRoleNames = [...new Set(roleNames)];

      const websiteAssignments = user.websiteRoles.map(
        (assignment) => `${assignment.website.name} (${assignment.role.name})`,
      );

      worksheet.addRow({
        name: sanitizeExcelText(user.name ?? ""),

        email: sanitizeExcelText(user.email),

        status: user.status,

        emailVerified: user.emailVerified ? "Yes" : "No",

        banned: user.banned ? "Yes" : "No",

        roles: sanitizeExcelText(uniqueRoleNames.join(", ")),

        websites: sanitizeExcelText(websiteAssignments.join(", ")),

        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }

    offset += users.length;

    if (users.length < BATCH_SIZE) {
      break;
    }
  }

  worksheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm:ss";

  worksheet.getColumn("updatedAt").numFmt = "yyyy-mm-dd hh:mm:ss";

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    row.alignment = {
      vertical: "middle",
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const date = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    status: 200,

    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      "Content-Disposition": `attachment; filename="veyra-users-${date}.xlsx"`,

      "Cache-Control": "no-store",
    },
  });
}
