import { NextResponse } from "next/server";
import { z } from "zod";

import { hashInvitationToken } from "@/lib/invitations/invitation-token";
import { prisma } from "@/lib/prisma";

const verifyInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
});

export async function POST(request: Request) {
  let body: unknown;

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

  const parsed = verifyInvitationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invitation token",
      },
      {
        status: 400,
      },
    );
  }

  const tokenHash = hashInvitationToken(parsed.data.token);

  const invitation = await prisma.userInvitation.findUnique({
    where: {
      tokenHash,
    },

    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      createdAt: true,

      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          emailVerified: true,
          banned: true,
        },
      },

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

      invitedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid invitation",
      },
      {
        status: 404,
      },
    );
  }

  if (invitation.revokedAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation has been revoked",
      },
      {
        status: 410,
      },
    );
  }

  if (invitation.usedAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation has already been used",
      },
      {
        status: 410,
      },
    );
  }

  if (invitation.expiresAt <= new Date()) {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation has expired",
      },
      {
        status: 410,
      },
    );
  }

  if (invitation.website.status !== "ACTIVE") {
    return NextResponse.json(
      {
        success: false,
        error: "Website is not active",
      },
      {
        status: 409,
      },
    );
  }

  if (invitation.role.scope !== "WEBSITE") {
    return NextResponse.json(
      {
        success: false,
        error: "Invitation role is no longer valid",
      },
      {
        status: 409,
      },
    );
  }

  if (invitation.user?.banned) {
    return NextResponse.json(
      {
        success: false,
        error: "User account is banned",
      },
      {
        status: 403,
      },
    );
  }

  const existingUser =
    invitation.user ??
    (await prisma.user.findUnique({
      where: {
        email: invitation.email,
      },

      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        emailVerified: true,
        banned: true,
      },
    }));

  if (existingUser) {
    const existingAssignment = await prisma.userWebsiteRole.findUnique({
      where: {
        userId_websiteId: {
          userId: existingUser.id,

          websiteId: invitation.website.id,
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
    });

    if (existingAssignment) {
      return NextResponse.json(
        {
          success: false,

          error: "User already belongs to this website",
        },
        {
          status: 409,
        },
      );
    }
  }

  return NextResponse.json({
    success: true,

    data: {
      invitationId: invitation.id,

      name: invitation.name,

      email: invitation.email,

      existingUser: Boolean(existingUser),

      /*
       * Existing account harus login.
       * Kita tidak pernah mengubah password
       * existing user dari invitation.
       */
      requiresLogin: Boolean(existingUser),

      requiresPassword: !existingUser,

      website: invitation.website,

      role: invitation.role,

      invitedBy: invitation.invitedBy,

      expiresAt: invitation.expiresAt,
    },
  });
}
