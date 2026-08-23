import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);

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

  let body: {
    videoId?: unknown;
    visitorId?: unknown;
    watchDuration?: unknown;
    completed?: unknown;
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

  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";

  const visitorId =
    typeof body.visitorId === "string" ? body.visitorId.trim() : null;

  if (!videoId) {
    return NextResponse.json(
      {
        success: false,
        error: "Video ID is required",
      },
      {
        status: 400,
      },
    );
  }

  if (visitorId && visitorId.length > 255) {
    return NextResponse.json(
      {
        success: false,
        error: "Visitor ID must not exceed 255 characters",
      },
      {
        status: 400,
      },
    );
  }

  let watchDuration: number | null = null;

  if (body.watchDuration !== undefined && body.watchDuration !== null) {
    if (
      typeof body.watchDuration !== "number" ||
      !Number.isFinite(body.watchDuration) ||
      body.watchDuration < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid watchDuration",
        },
        {
          status: 400,
        },
      );
    }

    watchDuration = Math.floor(body.watchDuration);
  }

  let completed = false;

  if (body.completed !== undefined) {
    if (typeof body.completed !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid completed value",
        },
        {
          status: 400,
        },
      );
    }

    completed = body.completed;
  }

  const video = await prisma.video.findFirst({
    where: {
      id: videoId,
      status: "PUBLISHED",
      visibility: "PUBLIC",

      websites: {
        some: {
          websiteId: auth.website.id,
          visibility: "PUBLIC",
          publishedAt: {
            not: null,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!video) {
    return NextResponse.json(
      {
        success: false,
        error: "Video not found",
      },
      {
        status: 404,
      },
    );
  }

  const userAgent = request.headers.get("user-agent");

  const view = await prisma.view.create({
    data: {
      videoId: video.id,
      websiteId: auth.website.id,
      visitorId,
      watchDuration,
      completed,
      userAgent,
    },
    select: {
      id: true,
      videoId: true,
      websiteId: true,
      visitorId: true,
      watchDuration: true,
      completed: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "View recorded successfully",
      data: view,
    },
    {
      status: 201,
    },
  );
}
