import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { sendInvitationEmail } from "@/lib/email/invitation-email";
import { canAssignWebsiteRole } from "@/lib/invitations/invitation-access";
import { createInvitationToken } from "@/lib/invitations/invitation-token";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITATION_STATUSES = ["PENDING", "USED", "REVOKED", "EXPIRED"] as const;

const INVITATION_SORT_FIELDS = [
  "name",
  "email",
  "role",
  "status",
  "createdAt",
  "expiresAt",
] as const;

type InvitationStatus = (typeof INVITATION_STATUSES)[number];
type InvitationSortField = (typeof INVITATION_SORT_FIELDS)[number];
type SortOrder = "asc" | "desc";

const createInvitationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .transform((value) => value.toLowerCase()),
  roleId: z.string().trim().min(1, "Role is required"),
});

function isInvitationStatus(value: string): value is InvitationStatus {
  return INVITATION_STATUSES.includes(value as InvitationStatus);
}

function isInvitationSortField(value: string): value is InvitationSortField {
  return INVITATION_SORT_FIELDS.includes(value as InvitationSortField);
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
  if (revokedAt) return "REVOKED";
  if (usedAt) return "USED";
  if (expiresAt <= new Date()) return "EXPIRED";

  return "PENDING";
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

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";
  const roleId = searchParams.get("role")?.trim() || undefined;
  const sortParam = searchParams.get("sort")?.trim() ?? "createdAt";
  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "desc";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const status = isInvitationStatus(statusParam) ? statusParam : undefined;

  const sort: InvitationSortField = isInvitationSortField(sortParam)
    ? sortParam
    : "createdAt";

  const order: SortOrder = orderParam === "asc" ? "asc" : "desc";

  const now = new Date();

  const where = {
    AND: [
      { websiteId },

      ...(roleId ? [{ roleId }] : []),

      ...(q
        ? [
            {
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

      ...(status === "PENDING"
        ? [
            {
              usedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
          ]
        : []),

      ...(status === "USED"
        ? [
            {
              usedAt: { not: null },
            },
          ]
        : []),

      ...(status === "REVOKED"
        ? [
            {
              revokedAt: { not: null },
            },
          ]
        : []),

      ...(status === "EXPIRED"
        ? [
            {
              usedAt: null,
              revokedAt: null,
              expiresAt: { lte: now },
            },
          ]
        : []),
    ],
  };

  const select = {
    id: true,
    userId: true,
    websiteId: true,
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
  } as const;

  /*
   * Status adalah nilai computed dari usedAt/revokedAt/expiresAt,
   * jadi khusus sort=status kita sort di Central API.
   * Untuk sort lain pagination dilakukan langsung di PostgreSQL.
   */
  if (sort === "status") {
    const invitations = await prisma.userInvitation.findMany({
      where,
      select,
    });

    const normalized = invitations
      .map((invitation) => ({
        ...invitation,
        status: getInvitationStatus({
          usedAt: invitation.usedAt,
          revokedAt: invitation.revokedAt,
          expiresAt: invitation.expiresAt,
        }),
      }))
      .sort((a, b) => {
        const comparison = a.status.localeCompare(b.status);
        return order === "asc" ? comparison : -comparison;
      });

    const total = normalized.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = (safePage - 1) * limit;

    return NextResponse.json({
      success: true,
      data: normalized.slice(start, start + limit),
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
      },
    });
  }

  const orderBy =
    sort === "name"
      ? { name: order }
      : sort === "email"
        ? { email: order }
        : sort === "role"
          ? { role: { name: order } }
          : sort === "expiresAt"
            ? { expiresAt: order }
            : { createdAt: order };

  const [invitations, total] = await Promise.all([
    prisma.userInvitation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      select,
    }),

    prisma.userInvitation.count({ where }),
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

  const parsed = createInvitationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invitation data",
      },
      { status: 400 },
    );
  }

  const { name, email, roleId } = parsed.data;

  const [website, role, existingUser] = await Promise.all([
    prisma.website.findUnique({
      where: { id: websiteId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    }),

    prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
      },
    }),

    prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        status: true,

        globalRoles: {
          select: {
            role: {
              select: { name: true },
            },
          },
        },

        websiteRoles: {
          where: { websiteId },
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
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  if (website.status !== "ACTIVE") {
    return NextResponse.json(
      { success: false, error: "Website is not active" },
      { status: 409 },
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
        error: "Only WEBSITE roles can be assigned through website invitations",
      },
      { status: 400 },
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
      { status: 403 },
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
      { status: 409 },
    );
  }

  /*
   * PENTING:
   * User yang sudah memiliki email terverifikasi tidak boleh
   * mendapatkan invitation registration baru.
   *
   * Validasi dilakukan sebelum:
   * - membuat token
   * - revoke invitation lama
   * - membuat record invitation baru
   * - mengirim email
   */
  if (existingUser?.emailVerified) {
    return NextResponse.json(
      {
        success: false,
        code: "email-already-verified",
        error:
          "This email is already registered and verified. Add the user as an existing member instead.",
      },
      { status: 409 },
    );
  }

  if (existingUser && existingUser.websiteRoles.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `User already belongs to this website as ${existingUser.websiteRoles[0].role.name}`,
      },
      { status: 409 },
    );
  }

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const invitation = await prisma.$transaction(async (tx) => {
    /*
     * Setiap invitation baru untuk website + email yang sama
     * merevoke invitation pending sebelumnya.
     *
     * History tetap disimpan.
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
  const invitationUrl = `${baseUrl}/invite?token=${encodeURIComponent(token)}`;

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

    return NextResponse.json(
      {
        success: true,
        message: "Invitation created, but email delivery failed.",
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
      { status: 201 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Invitation created successfully",
      data: {
        ...invitation,
        invitationUrl,
        ...(process.env.NODE_ENV !== "production" ? { token } : {}),
      },
    },
    { status: 201 },
  );
}
