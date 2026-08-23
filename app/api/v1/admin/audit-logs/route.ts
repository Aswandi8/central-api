import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "PUBLISH",
  "UNPUBLISH",
  "LOGIN",
  "LOGOUT",
  "FAILED_LOGIN",
  "PASSWORD_CHANGE",
  "ROLE_ASSIGN",
  "ROLE_REMOVE",
  "PERMISSION_GRANT",
  "PERMISSION_REVOKE",
] as const;

type AuditAction = (typeof AUDIT_ACTIONS)[number];

function isAuditAction(value: string): value is AuditAction {
  return AUDIT_ACTIONS.includes(value as AuditAction);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const websiteId = searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId) {
    return NextResponse.json(
      {
        success: false,
        error: "websiteId is required",
      },
      {
        status: 400,
      },
    );
  }

  const auth = await requireWebsitePermission(request, websiteId, "audit.read");

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

  const pageParam = Number(searchParams.get("page") ?? "1");

  const limitParam = Number(searchParams.get("limit") ?? "20");

  const actionParam = searchParams.get("action")?.trim().toUpperCase() ?? "";

  const entity = searchParams.get("entity")?.trim().slice(0, 100) || undefined;

  const userId = searchParams.get("userId")?.trim() || undefined;

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const action = isAuditAction(actionParam) ? actionParam : undefined;

  const where = {
    websiteId,
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(userId ? { userId } : {}),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },

      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,

        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
    }),

    prisma.auditLog.count({
      where,
    }),
  ]);

  return NextResponse.json({
    success: true,

    data: logs,

    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}
