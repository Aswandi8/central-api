import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const updateVideoSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    thumbnail: z.string().trim().max(2048).nullable().optional(),
    videoUrl: z.string().trim().max(2048).nullable().optional(),
    streamUrl: z.string().trim().max(2048).nullable().optional(),
    storageKey: z.string().trim().max(1000).nullable().optional(),
    duration: z.number().int().min(0).nullable().optional(),
    websiteTitle: z.string().trim().min(1).max(200).optional(),
    websiteSlug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug may only contain lowercase letters, numbers, and hyphens",
      )
      .optional(),
    websiteVisibility: z.enum(["PUBLIC", "PRIVATE", "UNLISTED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

async function getVideoContext(id: string, websiteId: string) {
  return prisma.video.findFirst({
    where: {
      id,
      websites: {
        some: { websiteId },
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      thumbnail: true,
      videoUrl: true,
      streamUrl: true,
      storageKey: true,
      duration: true,
      status: true,
      visibility: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      websites: {
        select: {
          websiteId: true,
          title: true,
          slug: true,
          visibility: true,
          publishedAt: true,
          website: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      categories: {
        where: {
          category: {
            websiteId,
          },
        },
        select: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      _count: {
        select: {
          websites: true,
          categories: true,
          views: true,
        },
      },
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const websiteId =
    new URL(request.url).searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId) {
    return NextResponse.json(
      { success: false, error: "websiteId is required" },
      { status: 400 },
    );
  }

  const auth = await requireWebsitePermission(request, websiteId, "video.read");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const video = await getVideoContext(id, websiteId);

  if (!video) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  const website =
    video.websites.find((assignment) => assignment.websiteId === websiteId) ??
    null;

  return NextResponse.json({
    success: true,
    data: {
      id: video.id,
      title: video.title,
      slug: video.slug,
      description: video.description,
      thumbnail: video.thumbnail,
      videoUrl: video.videoUrl,
      streamUrl: video.streamUrl,
      storageKey: video.storageKey,
      duration: video.duration,
      status: video.status,
      visibility: video.visibility,
      metadata: video.metadata,
      website,
      categories: video.categories.map((assignment) => assignment.category),
      statistics: {
        websites: video._count.websites,
        categories: video._count.categories,
        views: video._count.views,
      },
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      publishedAt: video.publishedAt,
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const websiteId =
    new URL(request.url).searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId) {
    return NextResponse.json(
      { success: false, error: "websiteId is required" },
      { status: 400 },
    );
  }

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

  const existing = await getVideoContext(id, websiteId);

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
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

  const parsed = updateVideoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid video data",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  if (data.websiteSlug) {
    const duplicate = await prisma.videoWebsite.findUnique({
      where: {
        websiteId_slug: {
          websiteId,
          slug: data.websiteSlug,
        },
      },
      select: { videoId: true },
    });

    if (duplicate && duplicate.videoId !== id) {
      return NextResponse.json(
        { success: false, error: "Video slug already exists on this website" },
        { status: 409 },
      );
    }
  }

  const hasGlobalChanges =
    data.title !== undefined ||
    data.description !== undefined ||
    data.thumbnail !== undefined ||
    data.videoUrl !== undefined ||
    data.streamUrl !== undefined ||
    data.storageKey !== undefined ||
    data.duration !== undefined;

  if (hasGlobalChanges && !auth.isSuperAdmin && existing._count.websites > 1) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Global video fields cannot be changed because this video is shared with multiple websites",
      },
      { status: 403 },
    );
  }

  await prisma.$transaction(async (tx) => {
    if (hasGlobalChanges) {
      await tx.video.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.thumbnail !== undefined
            ? { thumbnail: data.thumbnail }
            : {}),
          ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl } : {}),
          ...(data.streamUrl !== undefined
            ? { streamUrl: data.streamUrl }
            : {}),
          ...(data.storageKey !== undefined
            ? { storageKey: data.storageKey }
            : {}),
          ...(data.duration !== undefined ? { duration: data.duration } : {}),
        },
      });
    }

    if (
      data.websiteTitle !== undefined ||
      data.websiteSlug !== undefined ||
      data.websiteVisibility !== undefined
    ) {
      await tx.videoWebsite.update({
        where: {
          videoId_websiteId: {
            videoId: id,
            websiteId,
          },
        },
        data: {
          ...(data.websiteTitle !== undefined
            ? { title: data.websiteTitle }
            : {}),
          ...(data.websiteSlug !== undefined ? { slug: data.websiteSlug } : {}),
          ...(data.websiteVisibility !== undefined
            ? { visibility: data.websiteVisibility }
            : {}),
        },
      });
    }
  });

  const video = await getVideoContext(id, websiteId);

  return NextResponse.json({
    success: true,
    message: "Video updated successfully",
    data: video,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const websiteId =
    new URL(request.url).searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId) {
    return NextResponse.json(
      { success: false, error: "websiteId is required" },
      { status: 400 },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "video.delete",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const video = await getVideoContext(id, websiteId);

  if (!video) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  if (video._count.websites === 1) {
    await prisma.video.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully",
      data: { id },
    });
  }

  await prisma.$transaction([
    prisma.videoCategory.deleteMany({
      where: {
        videoId: id,
        category: {
          websiteId,
        },
      },
    }),
    prisma.videoWebsite.delete({
      where: {
        videoId_websiteId: {
          videoId: id,
          websiteId,
        },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: "Video removed from website successfully",
    data: {
      id,
      websiteId,
    },
  });
}
