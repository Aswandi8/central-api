import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { canAssignWebsiteRole } from "@/lib/invitations/invitation-access";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
    invitationId: string;
  }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: websiteId, invitationId } = await context.params;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "member.invite",
  );

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

  const invitation = await prisma.userInvitation.findFirst({
    where: {
      id: invitationId,
      websiteId,
    },

    select: {
      id: true,
      email: true,
      usedAt: true,
      revokedAt: true,
      expiresAt: true,

      role: {
        select: {
          id: true,
          name: true,
          scope: true,
        },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation not found",
      },
      {
        status: 404,
      },
    );
  }

  if (invitation.usedAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Used invitation cannot be revoked",
      },
      {
        status: 409,
      },
    );
  }

  if (invitation.revokedAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation is already revoked",
      },
      {
        status: 409,
      },
    );
  }

  const actorRoleName = auth.isSuperAdmin
    ? undefined
    : auth.websiteAssignment?.role.name;

  if (
    !canAssignWebsiteRole({
      isSuperAdmin: auth.isSuperAdmin,

      actorRoleName,

      targetRoleName: invitation.role.name,
    })
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "You cannot revoke this invitation",
      },
      {
        status: 403,
      },
    );
  }

  const revokedAt = new Date();

  const result = await prisma.userInvitation.updateMany({
    where: {
      id: invitation.id,
      usedAt: null,
      revokedAt: null,
    },

    data: {
      revokedAt,
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation state changed before it could be revoked",
      },
      {
        status: 409,
      },
    );
  }

  return NextResponse.json({
    success: true,

    message: "Invitation revoked successfully",

    data: {
      id: invitation.id,
      email: invitation.email,
      revokedAt,
    },
  });
}
