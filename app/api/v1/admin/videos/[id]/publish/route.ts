import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const publishSchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),
});

async function getVideoWebsite(videoId: string, websiteId: string) {
  return prisma.videoWebsite.findUnique({
    where: {
      videoId_websiteId: {
        videoId,
        websiteId,
      },
    },
    select: {
      videoId: true,
      websiteId: true,
      visibility: true,
      publishedAt: true,
      video: {
        select: {
          id: true,
          status: true,
          videoUrl: true,
          streamUrl: true,
        },
      },
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = publishSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid publish data",
      },
      { status: 400 },
    );
  }

  const { websiteId } = parsed.data;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "video.publish",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const assignment = await getVideoWebsite(id, websiteId);

  if (!assignment) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  if (
    assignment.video.status !== "READY" &&
    assignment.video.status !== "PUBLISHED"
  ) {
    return NextResponse.json(
      { success: false, error: "Only READY videos can be published" },
      { status: 409 },
    );
  }

  if (!assignment.video.videoUrl && !assignment.video.streamUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "Video cannot be published without a video or stream URL",
      },
      { status: 409 },
    );
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.video.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
      },
    }),
    prisma.videoWebsite.update({
      where: {
        videoId_websiteId: {
          videoId: id,
          websiteId,
        },
      },
      data: {
        publishedAt: now,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: "Video published successfully",
    data: {
      id,
      websiteId,
      status: "PUBLISHED",
      publishedAt: now,
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = publishSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid publish data",
      },
      { status: 400 },
    );
  }

  const { websiteId } = parsed.data;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "video.publish",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const assignment = await getVideoWebsite(id, websiteId);

  if (!assignment) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  await prisma.videoWebsite.update({
    where: {
      videoId_websiteId: {
        videoId: id,
        websiteId,
      },
    },
    data: {
      publishedAt: null,
    },
  });

  const otherPublishedWebsites = await prisma.videoWebsite.count({
    where: {
      videoId: id,
      publishedAt: {
        not: null,
      },
    },
  });

  if (otherPublishedWebsites === 0) {
    await prisma.video.update({
      where: { id },
      data: {
        status: "READY",
        publishedAt: null,
      },
    });
  }

  return NextResponse.json({
    success: true,
    message: "Video unpublished successfully",
    data: {
      id,
      websiteId,
    },
  });
}
