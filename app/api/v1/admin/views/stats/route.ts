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

  const [totalViews, completedViews, watchAggregate] =
    await prisma.$transaction([
      prisma.view.count({
        where: {
          websiteId,
        },
      }),

      prisma.view.count({
        where: {
          websiteId,
          completed: true,
        },
      }),

      prisma.view.aggregate({
        where: {
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

  return NextResponse.json({
    success: true,

    data: {
      websiteId,
      totalViews,
      completedViews,

      completionRate: totalViews > 0 ? (completedViews / totalViews) * 100 : 0,

      totalWatchDuration: watchAggregate._sum.watchDuration ?? 0,

      averageWatchDuration: watchAggregate._avg.watchDuration ?? 0,
    },
  });
}
