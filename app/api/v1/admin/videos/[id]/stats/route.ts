import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  const websiteId = searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId) {
    return NextResponse.json(
      { success: false, error: "websiteId is required" },
      { status: 400 },
    );
  }

  const auth = await requireWebsitePermission(request, websiteId, "view.read");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const video = await prisma.video.findFirst({
    where: {
      id,
      websites: {
        some: { websiteId },
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!video) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  const [totalViews, completedViews, watchAggregate] =
    await prisma.$transaction([
      prisma.view.count({
        where: {
          videoId: id,
          websiteId,
        },
      }),

      prisma.view.count({
        where: {
          videoId: id,
          websiteId,
          completed: true,
        },
      }),

      prisma.view.aggregate({
        where: {
          videoId: id,
          websiteId,
        },
        _sum: {
          watchDuration: true,
        },
        _avg: {
          watchDuration: true,
        },
      }),
    ]);

  const completionRate =
    totalViews > 0 ? (completedViews / totalViews) * 100 : 0;

  return NextResponse.json({
    success: true,
    data: {
      video: {
        id: video.id,
        title: video.title,
      },
      websiteId,
      totalViews,
      completedViews,
      completionRate,
      totalWatchDuration: watchAggregate._sum.watchDuration ?? 0,
      averageWatchDuration: watchAggregate._avg.watchDuration ?? 0,
    },
  });
}
