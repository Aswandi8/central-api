import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { isProtectedUser } from "@/lib/admin/protected-user";
import { prisma } from "@/lib/prisma";

const BULK_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

type BulkStatus = (typeof BULK_STATUSES)[number];

function getIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = [
    ...new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  if (ids.length === 0 || ids.length > 100) {
    return null;
  }

  return ids;
}

async function getTargetUsers(ids: string[]) {
  return prisma.user.findMany({
    where: {
      id: {
        in: ids,
      },
    },

    select: {
      id: true,

      globalRoles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requirePermission(request, "user.update");

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
    ids?: unknown;
    status?: unknown;
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

  const ids = getIds(body.ids);

  const status =
    typeof body.status === "string" ? body.status.trim().toUpperCase() : "";

  if (!ids) {
    return NextResponse.json(
      {
        success: false,
        error: "Select between 1 and 100 users",
      },
      {
        status: 400,
      },
    );
  }

  if (!BULK_STATUSES.includes(status as BulkStatus)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid user status",
      },
      {
        status: 400,
      },
    );
  }

  const users = await getTargetUsers(ids);

  if (users.length !== ids.length) {
    return NextResponse.json(
      {
        success: false,
        error: "One or more users were not found",
      },
      {
        status: 404,
      },
    );
  }

  if (users.some((user) => isProtectedUser(user.globalRoles))) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN account cannot be modified",
      },
      {
        status: 403,
      },
    );
  }

  const result = await prisma.user.updateMany({
    where: {
      id: {
        in: ids,
      },
    },

    data: {
      status: status as BulkStatus,
      banned: false,
      banReason: null,
      banExpires: null,
    },
  });

  return NextResponse.json({
    success: true,
    message: `${result.count} users updated successfully`,

    data: {
      count: result.count,
      status,
    },
  });
}

export async function DELETE(request: Request) {
  const auth = await requirePermission(request, "user.delete");

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
    ids?: unknown;
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

  const ids = getIds(body.ids);

  if (!ids) {
    return NextResponse.json(
      {
        success: false,
        error: "Select between 1 and 100 users",
      },
      {
        status: 400,
      },
    );
  }

  const users = await getTargetUsers(ids);

  if (users.length !== ids.length) {
    return NextResponse.json(
      {
        success: false,
        error: "One or more users were not found",
      },
      {
        status: 404,
      },
    );
  }

  if (users.some((user) => isProtectedUser(user.globalRoles))) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN account cannot be deleted",
      },
      {
        status: 403,
      },
    );
  }

  const result = await prisma.user.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  return NextResponse.json({
    success: true,
    message: `${result.count} users deleted successfully`,

    data: {
      count: result.count,
    },
  });
}
