import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const VIDEO_STATUSES = [
  "DRAFT",
  "PROCESSING",
  "READY",
  "PUBLISHED",
  "ARCHIVED",
] as const;
const VISIBILITIES = ["PUBLIC", "PRIVATE", "UNLISTED"] as const;

const createVideoSchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),
  title: z.string().trim().min(1, "Title is required").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(200)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug may only contain lowercase letters, numbers, and hyphens",
    ),
  description: z.string().trim().max(10000).nullable().optional(),
  thumbnail: z.string().trim().max(2048).nullable().optional(),
  videoUrl: z.string().trim().max(2048).nullable().optional(),
  streamUrl: z.string().trim().max(2048).nullable().optional(),
  storageKey: z.string().trim().max(1000).nullable().optional(),
  duration: z.number().int().min(0).nullable().optional(),
  visibility: z.enum(VISIBILITIES).default("PUBLIC"),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const websiteId = searchParams.get("websiteId")?.trim() ?? "";

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

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";
  const visibilityParam =
    searchParams.get("visibility")?.trim().toUpperCase() ?? "";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const status = VIDEO_STATUSES.includes(
    statusParam as (typeof VIDEO_STATUSES)[number],
  )
    ? (statusParam as (typeof VIDEO_STATUSES)[number])
    : undefined;

  const visibility = VISIBILITIES.includes(
    visibilityParam as (typeof VISIBILITIES)[number],
  )
    ? (visibilityParam as (typeof VISIBILITIES)[number])
    : undefined;

  const where = {
    websites: {
      some: {
        websiteId,
        ...(visibility ? { visibility } : {}),
      },
    },
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            {
              websites: {
                some: {
                  websiteId,
                  OR: [
                    { title: { contains: q, mode: "insensitive" as const } },
                    { slug: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [videos, total] = await prisma.$transaction([
    prisma.video.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
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
          where: { websiteId },
          select: {
            websiteId: true,
            title: true,
            slug: true,
            visibility: true,
            publishedAt: true,
          },
        },
        _count: {
          select: {
            categories: true,
            views: true,
          },
        },
      },
    }),
    prisma.video.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: videos.map((video) => ({
      ...video,
      website: video.websites[0] ?? null,
      websites: undefined,
      statistics: {
        categories: video._count.categories,
        views: video._count.views,
      },
      _count: undefined,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createVideoSchema.safeParse(body);

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

  const auth = await requireWebsitePermission(
    request,
    data.websiteId,
    "video.create",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const website = await prisma.website.findUnique({
    where: { id: data.websiteId },
    select: { id: true },
  });

  if (!website) {
    return NextResponse.json(
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  const duplicateWebsiteSlug = await prisma.videoWebsite.findUnique({
    where: {
      websiteId_slug: {
        websiteId: data.websiteId,
        slug: data.slug,
      },
    },
    select: { videoId: true },
  });

  if (duplicateWebsiteSlug) {
    return NextResponse.json(
      { success: false, error: "Video slug already exists on this website" },
      { status: 409 },
    );
  }

  const baseSlugExists = await prisma.video.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });

  const globalSlug = baseSlugExists
    ? `${data.slug}-${crypto.randomUUID().slice(0, 8)}`
    : data.slug;

  const video = await prisma.video.create({
    data: {
      title: data.title,
      slug: globalSlug,
      description: data.description ?? null,
      thumbnail: data.thumbnail ?? null,
      videoUrl: data.videoUrl ?? null,
      streamUrl: data.streamUrl ?? null,
      storageKey: data.storageKey ?? null,
      duration: data.duration ?? null,
      status: "DRAFT",
      visibility: data.visibility,
      websites: {
        create: {
          websiteId: data.websiteId,
          title: data.title,
          slug: data.slug,
          visibility: data.visibility,
        },
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
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      websites: {
        where: { websiteId: data.websiteId },
        select: {
          websiteId: true,
          title: true,
          slug: true,
          visibility: true,
          publishedAt: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Video created successfully",
      data: {
        ...video,
        website: video.websites[0] ?? null,
        websites: undefined,
      },
    },
    { status: 201 },
  );
}
