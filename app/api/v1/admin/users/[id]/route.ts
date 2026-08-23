import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { isProtectedUser } from "@/lib/admin/protected-user";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const VALID_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "BANNED"] as const;

type UserStatus = (typeof VALID_STATUSES)[number];

export async function GET(request: Request, context: RouteContext) {
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

  const { id } = await context.params;

  /* =========================================================
     USER
  ========================================================= */

  const user = await prisma.user.findUnique({
    where: {
      id,
    },
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
        orderBy: {
          website: {
            name: "asc",
          },
        },
        select: {
          createdAt: true,

          website: {
            select: {
              id: true,
              name: true,
              slug: true,
              domain: true,
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

      _count: {
        select: {
          accounts: true,
          globalRoles: true,
          websiteRoles: true,
          auditLogs: true,
          invitations: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "User not found",
      },
      {
        status: 404,
      },
    );
  }

  /* =========================================================
     ACTIVE SESSIONS
  ========================================================= */

  const activeSessions = await prisma.session.count({
    where: {
      userId: user.id,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  /* =========================================================
     ROLES
  ========================================================= */

  const allRoles = [
    ...user.globalRoles.map((assignment) => assignment.role),
    ...user.websiteRoles.map((assignment) => assignment.role),
  ];

  const uniqueRoles = [
    ...new Map(allRoles.map((role) => [role.id, role])).values(),
  ];

  /* =========================================================
     RESPONSE
  ========================================================= */

  return NextResponse.json({
    success: true,

    data: {
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

      protected: isProtectedUser(user.globalRoles),

      roles: uniqueRoles,

      globalRoles: user.globalRoles.map((assignment) => assignment.role),

      websites: user.websiteRoles.map((assignment) => ({
        ...assignment.website,
        role: assignment.role,
        assignedAt: assignment.createdAt,
      })),

      statistics: {
        sessions: activeSessions,
        accounts: user._count.accounts,
        globalRoles: user._count.globalRoles,
        websites: user._count.websiteRoles,
        auditLogs: user._count.auditLogs,
        invitations: user._count.invitations,
      },
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
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

  const { id } = await context.params;

  const existingUser = await prisma.user.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      status: true,
      banned: true,
      banReason: true,
      banExpires: true,

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

  if (!existingUser) {
    return NextResponse.json(
      {
        success: false,
        error: "User not found",
      },
      {
        status: 404,
      },
    );
  }

  let body: {
    name?: unknown;
    email?: unknown;
    image?: unknown;
    status?: unknown;
    banned?: unknown;
    banReason?: unknown;
    banExpires?: unknown;
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

  const name =
    body.name === undefined
      ? existingUser.name
      : typeof body.name === "string"
        ? body.name.trim()
        : "";

  const email =
    body.email === undefined
      ? existingUser.email
      : typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

  const image =
    body.image === undefined
      ? existingUser.image
      : body.image === null
        ? null
        : typeof body.image === "string"
          ? body.image.trim()
          : null;

  let status =
    body.status === undefined
      ? existingUser.status
      : typeof body.status === "string"
        ? body.status.trim().toUpperCase()
        : "";

  let banned =
    body.banned === undefined
      ? (existingUser.banned ?? false)
      : typeof body.banned === "boolean"
        ? body.banned
        : null;

  let banReason =
    body.banReason === undefined
      ? existingUser.banReason
      : body.banReason === null
        ? null
        : typeof body.banReason === "string"
          ? body.banReason.trim()
          : null;

  let banExpires: Date | null = existingUser.banExpires;

  if (body.banExpires !== undefined) {
    if (body.banExpires === null || body.banExpires === "") {
      banExpires = null;
    } else if (typeof body.banExpires === "string") {
      const parsedDate = new Date(body.banExpires);

      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid banExpires",
          },
          {
            status: 400,
          },
        );
      }

      banExpires = parsedDate;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid banExpires",
        },
        {
          status: 400,
        },
      );
    }
  }

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error: "User name is required",
      },
      {
        status: 400,
      },
    );
  }

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        error: "User email is required",
      },
      {
        status: 400,
      },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid email address",
      },
      {
        status: 400,
      },
    );
  }

  if (!VALID_STATUSES.includes(status as UserStatus)) {
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

  if (banned === null) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid banned value",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Keep status dan Better Auth banned
   * dalam kondisi konsisten.
   */
  if (banned) {
    status = "BANNED";
  } else if (status === "BANNED") {
    banned = true;
  }

  if (!banned) {
    banReason = null;
    banExpires = null;
  }

  const protectedUser = isProtectedUser(existingUser.globalRoles);

  if (protectedUser && (status !== "ACTIVE" || banned)) {
    return NextResponse.json(
      {
        success: false,
        error: "SUPER_ADMIN account cannot be disabled, suspended, or banned",
      },
      {
        status: 403,
      },
    );
  }

  const duplicateEmail = await prisma.user.findFirst({
    where: {
      email,

      NOT: {
        id,
      },
    },

    select: {
      id: true,
    },
  });

  if (duplicateEmail) {
    return NextResponse.json(
      {
        success: false,
        error: "User email already exists",
      },
      {
        status: 409,
      },
    );
  }

  const user = await prisma.user.update({
    where: {
      id,
    },

    data: {
      name,
      email,
      image,
      status: status as UserStatus,
      banned,
      banReason,
      banExpires,
    },

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
  });

  const roles = [
    ...user.globalRoles.map((assignment) => assignment.role),
    ...user.websiteRoles.map((assignment) => assignment.role),
  ];

  return NextResponse.json({
    success: true,
    message: "User updated successfully",

    data: {
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

      roles: [...new Map(roles.map((role) => [role.id, role])).values()],

      globalRoles: user.globalRoles.map((assignment) => assignment.role),

      websiteRoles: user.websiteRoles.map((assignment) => ({
        website: assignment.website,
        role: assignment.role,
      })),
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
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

  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      name: true,
      email: true,

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

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "User not found",
      },
      {
        status: 404,
      },
    );
  }

  if (isProtectedUser(user.globalRoles)) {
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

  await prisma.user.delete({
    where: {
      id,
    },
  });

  return NextResponse.json({
    success: true,
    message: "User deleted successfully",

    data: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}
