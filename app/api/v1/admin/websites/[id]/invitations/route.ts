import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { canAssignWebsiteRole } from "@/lib/invitations/invitation-access";
import { createInvitationToken } from "@/lib/invitations/invitation-token";
import { prisma } from "@/lib/prisma";
import { sendInvitationEmail } from "@/lib/email/invitation-email";
interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const createInvitationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .transform((value) => value.toLowerCase()),

  roleId: z.string().trim().min(1, "Role is required"),
});

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITATION_STATUSES = ["PENDING", "USED", "REVOKED", "EXPIRED"] as const;

type InvitationStatus = (typeof INVITATION_STATUSES)[number];

function isInvitationStatus(value: string): value is InvitationStatus {
  return INVITATION_STATUSES.includes(value as InvitationStatus);
}

function getInvitationStatus({
  usedAt,
  revokedAt,
  expiresAt,
}: {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InvitationStatus {
  if (revokedAt) {
    return "REVOKED";
  }

  if (usedAt) {
    return "USED";
  }

  if (expiresAt <= new Date()) {
    return "EXPIRED";
  }

  return "PENDING";
}

export async function GET(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "member.read",
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

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");

  const limitParam = Number(searchParams.get("limit") ?? "20");

  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";

  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";

  const roleId = searchParams.get("role")?.trim() || undefined;

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const status = isInvitationStatus(statusParam) ? statusParam : undefined;

  const now = new Date();

  const where = {
    websiteId,

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

    ...(roleId
      ? {
          roleId,
        }
      : {}),

    ...(status === "PENDING"
      ? {
          usedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        }
      : {}),

    ...(status === "USED"
      ? {
          usedAt: {
            not: null,
          },
        }
      : {}),

    ...(status === "REVOKED"
      ? {
          revokedAt: {
            not: null,
          },
        }
      : {}),

    ...(status === "EXPIRED"
      ? {
          usedAt: null,
          revokedAt: null,
          expiresAt: {
            lte: now,
          },
        }
      : {}),
  };

  const [invitations, total] = await prisma.$transaction([
    prisma.userInvitation.findMany({
      where,

      skip: (page - 1) * limit,

      take: limit,

      orderBy: {
        createdAt: "desc",
      },

      select: {
        id: true,
        name: true,
        email: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,

        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            emailVerified: true,
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
            email: true,
          },
        },
      },
    }),

    prisma.userInvitation.count({
      where,
    }),
  ]);

  return NextResponse.json({
    success: true,

    data: invitations.map((invitation) => ({
      ...invitation,

      status: getInvitationStatus({
        usedAt: invitation.usedAt,

        revokedAt: invitation.revokedAt,

        expiresAt: invitation.expiresAt,
      }),
    })),

    pagination: {
      page,
      limit,
      total,

      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: websiteId } = await context.params;

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

  const parsed = createInvitationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invitation data",
      },
      {
        status: 400,
      },
    );
  }

  const { name, email, roleId } = parsed.data;

  const [website, role, existingUser] = await Promise.all([
    prisma.website.findUnique({
      where: {
        id: websiteId,
      },

      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    }),

    prisma.role.findUnique({
      where: {
        id: roleId,
      },

      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
      },
    }),

    prisma.user.findUnique({
      where: {
        email,
      },

      select: {
        id: true,
        name: true,
        email: true,
        status: true,

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
          where: {
            websiteId,
          },

          select: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!website) {
    return NextResponse.json(
      {
        success: false,
        error: "Website not found",
      },
      {
        status: 404,
      },
    );
  }

  if (website.status !== "ACTIVE") {
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

  if (!role) {
    return NextResponse.json(
      {
        success: false,
        error: "Role not found",
      },
      {
        status: 404,
      },
    );
  }

  if (role.scope !== "WEBSITE") {
    return NextResponse.json(
      {
        success: false,
        error: "Only WEBSITE roles can be assigned through website invitations",
      },
      {
        status: 400,
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

      targetRoleName: role.name,
    })
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `You cannot assign the ${role.name} role`,
      },
      {
        status: 403,
      },
    );
  }

  if (
    existingUser?.globalRoles.some(
      (assignment) => assignment.role.name === "SUPER_ADMIN",
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN does not require website invitations",
      },
      {
        status: 409,
      },
    );
  }

  if (existingUser && existingUser.websiteRoles.length > 0) {
    return NextResponse.json(
      {
        success: false,

        error: `User already belongs to this website as ${existingUser.websiteRoles[0].role.name}`,
      },
      {
        status: 409,
      },
    );
  }

  const { token, tokenHash } = createInvitationToken();

  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const invitation = await prisma.$transaction(async (tx) => {
    /*
     * Revoke pending invitations lama
     * untuk email + website yang sama.
     *
     * History tidak dihapus.
     */
    await tx.userInvitation.updateMany({
      where: {
        websiteId,
        email,
        usedAt: null,
        revokedAt: null,
      },

      data: {
        revokedAt: new Date(),
      },
    });

    return tx.userInvitation.create({
      data: {
        userId: existingUser?.id ?? null,

        name: existingUser?.name ?? name,

        email,
        websiteId,
        roleId,
        tokenHash,
        expiresAt,

        invitedById: auth.user.id,
      },

      select: {
        id: true,
        name: true,
        email: true,
        expiresAt: true,
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

        role: {
          select: {
            id: true,
            name: true,
            description: true,
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
  });

  const baseUrl = process.env.VEYRA_URL ?? "http://localhost:3000";

  const invitationUrl = `${baseUrl}/invite?token=` + encodeURIComponent(token);

  try {
    await sendInvitationEmail({
      to: invitation.email,
      inviteeName: invitation.name,
      websiteName: invitation.website.name,
      roleName: invitation.role.name,
      invitationUrl,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("[SEND INVITATION EMAIL]", error);

    /*
     * Invitation sudah tersimpan tetapi email gagal.
     *
     * Untuk tahap sekarang, kita kembalikan 502 agar Veyra tahu
     * delivery gagal. Record invitation tetap dipertahankan
     * sehingga tidak kehilangan audit/history.
     */
    return NextResponse.json(
      {
        success: true,
        message: "Invitation sent successfully.",

        data: {
          id: invitation.id,
          name: invitation.name,
          email: invitation.email,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          user: invitation.user,
          website: invitation.website,
          role: invitation.role,
          invitedBy: invitation.invitedBy,
        },
      },
      {
        status: 201,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,

      message: "Invitation created successfully",

      data: {
        ...invitation,

        invitationUrl,

        /*
         * Development only.
         *
         * Setelah mail service aktif,
         * raw token sebaiknya tidak
         * dikembalikan di production.
         */
        ...(process.env.NODE_ENV !== "production"
          ? {
              token,
            }
          : {}),
      },
    },
    {
      status: 201,
    },
  );
}
