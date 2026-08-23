import { prisma } from "@/lib/prisma";

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "PUBLISH"
  | "UNPUBLISH"
  | "LOGIN"
  | "LOGOUT"
  | "FAILED_LOGIN"
  | "PASSWORD_CHANGE"
  | "ROLE_ASSIGN"
  | "ROLE_REMOVE"
  | "PERMISSION_GRANT"
  | "PERMISSION_REVOKE";

type CreateAuditLogInput = {
  userId?: string | null;
  websiteId?: string | null;

  action: AuditAction;

  entity: string;
  entityId?: string | null;

  metadata?: unknown;

  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function createAuditLog(input: CreateAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      websiteId: input.websiteId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata as object | undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export function getRequestAuditInfo(request: Request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),

    userAgent: request.headers.get("user-agent"),
  };
}
