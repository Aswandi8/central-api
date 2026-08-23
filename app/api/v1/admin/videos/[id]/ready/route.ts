import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const readySchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),
});

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

  const parsed = readySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request data",
      },
      { status: 400 },
    );
  }

  const { websiteId } = parsed.data;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "video.update",
  );

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
      status: true,
      videoUrl: true,
      streamUrl: true,
    },
  });

  if (!video) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  if (!video.videoUrl && !video.streamUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "Video cannot be marked READY without a video or stream URL",
      },
      { status: 409 },
    );
  }

  if (video.status === "PUBLISHED") {
    return NextResponse.json(
      {
        success: false,
        error: "Published video cannot be moved back to READY directly",
      },
      { status: 409 },
    );
  }

  const updated = await prisma.video.update({
    where: { id },
    data: {
      status: "READY",
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Video marked as ready",
    data: updated,
  });
}
