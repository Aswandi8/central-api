import { NextResponse } from "next/server";

import type { Prisma } from "@/app/generated/prisma/client";
import { requirePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";
import {
  createRandomShortLinkSlug,
  isShortLinkSortField,
  isValidShortLinkSlug,
  normalizeShortLinkMedia,
  normalizeShortLinkSlug,
  shortLinkCreateSchema,
  type ShortLinkPreviewType,
  type ShortLinkSortField,
  type ShortLinkState,
  type ShortLinkStatus,
  type SortOrder,
  validateShortLinkState,
} from "@/lib/shortlinks/validation";

// ============================================================
// GET
// ============================================================

export async function GET(request: Request) {
  const auth = await requirePermission(request, "shortlink.read");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const statusParam = searchParams.get("status")?.trim().toUpperCase() ?? "";
  const previewTypeParam =
    searchParams.get("previewType")?.trim().toUpperCase() ?? "";
  const sortParam = searchParams.get("sort")?.trim() ?? "createdAt";
  const orderParam = searchParams.get("order")?.trim().toLowerCase() ?? "desc";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const status: ShortLinkStatus | undefined =
    statusParam === "ACTIVE" || statusParam === "INACTIVE"
      ? statusParam
      : undefined;

  const previewType: ShortLinkPreviewType | undefined =
    previewTypeParam === "NONE" ||
    previewTypeParam === "IMAGE" ||
    previewTypeParam === "VIDEO"
      ? previewTypeParam
      : undefined;

  const sort: ShortLinkSortField = isShortLinkSortField(sortParam)
    ? sortParam
    : "createdAt";

  const order: SortOrder = orderParam === "asc" ? "asc" : "desc";

  const where: Prisma.ShortLinkWhereInput = {
    ...(status ? { status } : {}),
    ...(previewType ? { previewType } : {}),

    ...(q
      ? {
          OR: [
            {
              slug: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              title: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              destinationUrl: {
                contains: q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ShortLinkOrderByWithRelationInput =
    sort === "slug"
      ? { slug: order }
      : sort === "title"
        ? { title: order }
        : sort === "status"
          ? { status: order }
          : sort === "previewType"
            ? { previewType: order }
            : sort === "clickCount"
              ? { clickCount: order }
              : sort === "updatedAt"
                ? { updatedAt: order }
                : { createdAt: order };

  const [shortLinks, total] = await Promise.all([
    prisma.shortLink.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      select: {
        id: true,
        slug: true,
        destinationUrl: true,
        status: true,
        previewType: true,
        title: true,
        description: true,

        thumbnailUrl: true,
        thumbnailWidth: true,
        thumbnailHeight: true,
        thumbnailMimeType: true,
        thumbnailSizeBytes: true,

        previewVideoUrl: true,
        previewVideoWidth: true,
        previewVideoHeight: true,
        previewVideoDurationMs: true,
        previewVideoMimeType: true,
        previewVideoSizeBytes: true,

        showPlayButton: true,
        displayDuration: true,
        clickCount: true,

        createdAt: true,
        updatedAt: true,

        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),

    prisma.shortLink.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: shortLinks,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}

// ============================================================
// POST
// ============================================================

export async function POST(request: Request) {
  const auth = await requirePermission(request, "shortlink.create");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
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

  const parsed = shortLinkCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid shortlink data",
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const state: ShortLinkState = {
    destinationUrl: input.destinationUrl,
    status: input.status,
    previewType: input.previewType,

    title: input.title ?? null,
    description: input.description ?? null,

    thumbnailUrl: input.thumbnailUrl ?? null,
    thumbnailWidth: input.thumbnailWidth ?? null,
    thumbnailHeight: input.thumbnailHeight ?? null,
    thumbnailMimeType: input.thumbnailMimeType ?? null,
    thumbnailSizeBytes: input.thumbnailSizeBytes ?? null,

    previewVideoUrl: input.previewVideoUrl ?? null,
    previewVideoWidth: input.previewVideoWidth ?? null,
    previewVideoHeight: input.previewVideoHeight ?? null,
    previewVideoDurationMs: input.previewVideoDurationMs ?? null,
    previewVideoMimeType: input.previewVideoMimeType ?? null,
    previewVideoSizeBytes: input.previewVideoSizeBytes ?? null,

    showPlayButton: input.showPlayButton,
    displayDuration: input.displayDuration ?? null,
  };

  const validationError = validateShortLinkState(state);

  if (validationError) {
    return NextResponse.json(
      { success: false, error: validationError },
      { status: 400 },
    );
  }

  const normalizedState = normalizeShortLinkMedia(state);

  let slug = normalizeShortLinkSlug(input.slug);

  if (input.slug && !isValidShortLinkSlug(slug)) {
    return NextResponse.json(
      {
        success: false,
        error: "Slug may only contain lowercase letters, numbers, and hyphens",
      },
      { status: 400 },
    );
  }

  if (slug) {
    const duplicate = await prisma.shortLink.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          error: "Shortlink slug already exists",
        },
        { status: 409 },
      );
    }
  } else {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = createRandomShortLinkSlug();

      const duplicate = await prisma.shortLink.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!duplicate) {
        slug = candidate;
        break;
      }
    }

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to generate a unique shortlink slug",
        },
        { status: 500 },
      );
    }
  }

  const shortLink = await prisma.shortLink.create({
    data: {
      slug,
      destinationUrl: normalizedState.destinationUrl,
      status: normalizedState.status,
      previewType: normalizedState.previewType,

      title: normalizedState.title,
      description: normalizedState.description,

      thumbnailUrl: normalizedState.thumbnailUrl,
      thumbnailWidth: normalizedState.thumbnailWidth,
      thumbnailHeight: normalizedState.thumbnailHeight,
      thumbnailMimeType: normalizedState.thumbnailMimeType,
      thumbnailSizeBytes: normalizedState.thumbnailSizeBytes,

      previewVideoUrl: normalizedState.previewVideoUrl,
      previewVideoWidth: normalizedState.previewVideoWidth,
      previewVideoHeight: normalizedState.previewVideoHeight,
      previewVideoDurationMs: normalizedState.previewVideoDurationMs,
      previewVideoMimeType: normalizedState.previewVideoMimeType,
      previewVideoSizeBytes: normalizedState.previewVideoSizeBytes,

      showPlayButton: normalizedState.showPlayButton,
      displayDuration: normalizedState.displayDuration,

      createdById: auth.user.id,
    },
    select: {
      id: true,
      slug: true,
      destinationUrl: true,
      status: true,
      previewType: true,
      title: true,
      description: true,

      thumbnailUrl: true,
      thumbnailWidth: true,
      thumbnailHeight: true,
      thumbnailMimeType: true,
      thumbnailSizeBytes: true,

      previewVideoUrl: true,
      previewVideoWidth: true,
      previewVideoHeight: true,
      previewVideoDurationMs: true,
      previewVideoMimeType: true,
      previewVideoSizeBytes: true,

      showPlayButton: true,
      displayDuration: true,
      clickCount: true,

      createdAt: true,
      updatedAt: true,

      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Shortlink created successfully",
      data: shortLink,
    },
    { status: 201 },
  );
}
