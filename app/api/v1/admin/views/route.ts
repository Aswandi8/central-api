import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

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

  const auth = await requireWebsitePermission(request, websiteId, "view.read");

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
  const videoId = searchParams.get("videoId")?.trim() || undefined;
  const completedParam = searchParams.get("completed")?.trim() ?? "";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const completed =
    completedParam === "true"
      ? true
      : completedParam === "false"
        ? false
        : undefined;

  const where = {
    websiteId,
    ...(videoId ? { videoId } : {}),
    ...(completed !== undefined ? { completed } : {}),
  };

  const [views, total] = await prisma.$transaction([
    prisma.view.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        videoId: true,
        websiteId: true,
        visitorId: true,
        watchDuration: true,
        completed: true,
        userAgent: true,
        createdAt: true,
        video: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
          },
        },
      },
    }),

    prisma.view.count({
      where,
    }),
  ]);

  return NextResponse.json({
    success: true,

    data: views,

    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}
