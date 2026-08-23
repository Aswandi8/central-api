import { NextResponse } from "next/server";
import { APIError, isAPIError } from "better-auth/api";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { hashInvitationToken } from "@/lib/invitations/invitation-token";
import { prisma } from "@/lib/prisma";

const activateInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),

  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .optional(),
});

async function getInvitation(tokenHash: string) {
  return prisma.userInvitation.findUnique({
    where: {
      tokenHash,
    },

    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      websiteId: true,
      roleId: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,

      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          status: true,
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
          scope: true,
        },
      },
    },
  });
}

function invitationError(
  invitation: Awaited<ReturnType<typeof getInvitation>>,
): {
  error: string;
  status: number;
} | null {
  if (!invitation) {
    return {
      error: "Invalid invitation",
      status: 404,
    };
  }

  if (invitation.revokedAt) {
    return {
      error: "Invitation has been revoked",
      status: 410,
    };
  }

  if (invitation.usedAt) {
    return {
      error: "Invitation has already been used",
      status: 410,
    };
  }

  if (invitation.expiresAt <= new Date()) {
    return {
      error: "Invitation has expired",
      status: 410,
    };
  }

  if (invitation.website.status !== "ACTIVE") {
    return {
      error: "Website is not active",
      status: 409,
    };
  }

  if (invitation.role.scope !== "WEBSITE") {
    return {
      error: "Invitation role is no longer valid",
      status: 409,
    };
  }

  if (invitation.user?.banned) {
    return {
      error: "User account is banned",
      status: 403,
    };
  }

  return null;
}

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

  const parsed = activateInvitationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,

        error: parsed.error.issues[0]?.message ?? "Invalid activation data",
      },
      {
        status: 400,
      },
    );
  }

  const { token, password } = parsed.data;

  const tokenHash = hashInvitationToken(token);

  const invitation = await getInvitation(tokenHash);

  const validationError = invitationError(invitation);

  if (validationError) {
    return NextResponse.json(
      {
        success: false,
        error: validationError.error,
      },
      {
        status: validationError.status,
      },
    );
  }

  /*
   * Narrowing after validation.
   */
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

  /*
   * Cari user berdasarkan:
   *
   * 1. invitation.user
   * 2. email
   *
   * Ini menangani kemungkinan user dibuat
   * setelah invitation diterbitkan.
   */
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
        emailVerified: true,
        status: true,
        banned: true,
      },
    }));

  let userId: string;

  /*
   * =========================================================
   * EXISTING USER
   * =========================================================
   */
  if (existingUser) {
    if (existingUser.banned) {
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

    /*
     * Existing user harus membuktikan identity
     * dengan login/session Better Auth.
     */
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Please sign in with the invited account before accepting this invitation",

          code: "LOGIN_REQUIRED",
        },
        {
          status: 401,
        },
      );
    }

    if (
      session.user.id !== existingUser.id ||
      session.user.email.toLowerCase() !== invitation.email.toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,

          error: "This invitation belongs to a different account",

          code: "ACCOUNT_MISMATCH",
        },
        {
          status: 403,
        },
      );
    }

    userId = existingUser.id;
  } else {
    /*
     * =======================================================
     * NEW USER
     * =======================================================
     */

    if (!password) {
      return NextResponse.json(
        {
          success: false,

          error: "Password is required for a new account",

          code: "PASSWORD_REQUIRED",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Better Auth membuat:
     *
     * User
     * Account(providerId = credential)
     * password hash
     *
     * Kita tidak pernah menulis Account.password sendiri.
     */
    try {
      const signup = await auth.api.signUpEmail({
        body: {
          name: invitation.name,

          email: invitation.email,

          password,
        },
      });

      if (!signup?.user?.id) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create user account",
          },
          {
            status: 500,
          },
        );
      }

      userId = signup.user.id;
    } catch (error) {
      if (isAPIError(error)) {
        return NextResponse.json(
          {
            success: false,

            error: error.message || "Unable to create account",
          },
          {
            status:
              error.statusCode >= 400 && error.statusCode < 600
                ? error.statusCode
                : 400,
          },
        );
      }

      if (error instanceof APIError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
          },
          {
            status: 400,
          },
        );
      }

      console.error("Invitation signup failed:", error);

      return NextResponse.json(
        {
          success: false,

          error: "Unable to create account",
        },
        {
          status: 500,
        },
      );
    }
  }

  /*
   * User mungkin mendapat assignment melalui
   * proses lain setelah invitation dibuat.
   */
  const existingAssignment = await prisma.userWebsiteRole.findUnique({
    where: {
      userId_websiteId: {
        userId,

        websiteId: invitation.websiteId,
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

        error: `User already belongs to this website as ${existingAssignment.role.name}`,
      },
      {
        status: 409,
      },
    );
  }

  const activatedAt = new Date();

  /*
   * =========================================================
   * APPLICATION TRANSACTION
   * =========================================================
   *
   * Conditional update terhadap invitation digunakan
   * sebagai race-condition guard.
   */
  try {
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await tx.userInvitation.updateMany({
        where: {
          id: invitation.id,

          tokenHash,

          usedAt: null,
          revokedAt: null,

          expiresAt: {
            gt: activatedAt,
          },
        },

        data: {
          userId,
          usedAt: activatedAt,
        },
      });

      if (consumed.count !== 1) {
        throw new Error("INVITATION_ALREADY_CONSUMED");
      }

      await tx.userWebsiteRole.create({
        data: {
          userId,

          websiteId: invitation.websiteId,

          roleId: invitation.roleId,
        },
      });

      const user = await tx.user.update({
        where: {
          id: userId,
        },

        data: {
          /*
           * Possession of the invitation token
           * verifies control over invited email.
           */
          emailVerified: true,

          status: "ACTIVE",

          banned: false,

          banReason: null,

          banExpires: null,
        },

        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          status: true,
        },
      });

      return {
        user,
      };
    });

    return NextResponse.json({
      success: true,

      message: "Invitation accepted successfully",

      data: {
        user: result.user,

        website: {
          id: invitation.website.id,

          name: invitation.website.name,

          slug: invitation.website.slug,
        },

        role: {
          id: invitation.role.id,

          name: invitation.role.name,
        },

        activatedAt,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVITATION_ALREADY_CONSUMED"
    ) {
      return NextResponse.json(
        {
          success: false,

          error: "Invitation has already been used or is no longer valid",
        },
        {
          status: 409,
        },
      );
    }

    console.error("Invitation activation failed:", error);

    return NextResponse.json(
      {
        success: false,

        error: "Failed to activate invitation",
      },
      {
        status: 500,
      },
    );
  }
}
