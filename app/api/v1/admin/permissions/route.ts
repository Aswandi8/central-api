import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requirePermission(request, "role.read");

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

  const permissions = await prisma.permission.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: permissions,
  });
}
