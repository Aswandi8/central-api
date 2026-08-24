import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";
import {
  isValidShortLinkSlug,
  normalizeShortLinkMedia,
  normalizeShortLinkSlug,
  shortLinkUpdateSchema,
  type ShortLinkState,
  validateShortLinkState,
} from "@/lib/shortlinks/validation";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// ============================================================
// GET
// ============================================================

export async function GET(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "shortlink.read");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const { id } = await context.params;

  const shortLink = await prisma.shortLink.findUnique({
    where: { id },

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

      _count: {
        select: {
          clicks: true,
        },
      },
    },
  });

  if (!shortLink) {
    return NextResponse.json(
      { success: false, error: "Shortlink not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...shortLink,
      eventCount: shortLink._count.clicks,
      _count: undefined,
    },
  });
}

// ============================================================
// PUT
// ============================================================

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "shortlink.update");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const { id } = await context.params;

  const existing = await prisma.shortLink.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Shortlink not found" },
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

  const parsed = shortLinkUpdateSchema.safeParse(body);

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

  let slug = existing.slug;

  if (input.slug !== undefined) {
    slug = normalizeShortLinkSlug(input.slug);

    if (!isValidShortLinkSlug(slug)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Slug may only contain lowercase letters, numbers, and hyphens",
        },
        { status: 400 },
      );
    }

    if (slug !== existing.slug) {
      const duplicate = await prisma.shortLink.findFirst({
        where: {
          slug,
          NOT: { id },
        },
        select: { id: true },
      });

      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "Shortlink slug already exists" },
          { status: 409 },
        );
      }
    }
  }

  const state: ShortLinkState = {
    destinationUrl: input.destinationUrl ?? existing.destinationUrl,
    status: input.status ?? existing.status,
    previewType: input.previewType ?? existing.previewType,

    title: input.title !== undefined ? (input.title ?? null) : existing.title,

    description:
      input.description !== undefined
        ? (input.description ?? null)
        : existing.description,

    thumbnailUrl:
      input.thumbnailUrl !== undefined
        ? (input.thumbnailUrl ?? null)
        : existing.thumbnailUrl,

    thumbnailWidth:
      input.thumbnailWidth !== undefined
        ? (input.thumbnailWidth ?? null)
        : existing.thumbnailWidth,

    thumbnailHeight:
      input.thumbnailHeight !== undefined
        ? (input.thumbnailHeight ?? null)
        : existing.thumbnailHeight,

    thumbnailMimeType:
      input.thumbnailMimeType !== undefined
        ? (input.thumbnailMimeType ?? null)
        : existing.thumbnailMimeType,

    thumbnailSizeBytes:
      input.thumbnailSizeBytes !== undefined
        ? (input.thumbnailSizeBytes ?? null)
        : existing.thumbnailSizeBytes,

    previewVideoUrl:
      input.previewVideoUrl !== undefined
        ? (input.previewVideoUrl ?? null)
        : existing.previewVideoUrl,

    previewVideoWidth:
      input.previewVideoWidth !== undefined
        ? (input.previewVideoWidth ?? null)
        : existing.previewVideoWidth,

    previewVideoHeight:
      input.previewVideoHeight !== undefined
        ? (input.previewVideoHeight ?? null)
        : existing.previewVideoHeight,

    previewVideoDurationMs:
      input.previewVideoDurationMs !== undefined
        ? (input.previewVideoDurationMs ?? null)
        : existing.previewVideoDurationMs,

    previewVideoMimeType:
      input.previewVideoMimeType !== undefined
        ? (input.previewVideoMimeType ?? null)
        : existing.previewVideoMimeType,

    previewVideoSizeBytes:
      input.previewVideoSizeBytes !== undefined
        ? (input.previewVideoSizeBytes ?? null)
        : existing.previewVideoSizeBytes,

    showPlayButton: input.showPlayButton ?? existing.showPlayButton,

    displayDuration:
      input.displayDuration !== undefined
        ? (input.displayDuration ?? null)
        : existing.displayDuration,
  };

  const validationError = validateShortLinkState(state);

  if (validationError) {
    return NextResponse.json(
      { success: false, error: validationError },
      { status: 400 },
    );
  }

  const normalizedState = normalizeShortLinkMedia(state);

  const shortLink = await prisma.shortLink.update({
    where: { id },

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

  return NextResponse.json({
    success: true,
    message: "Shortlink updated successfully",
    data: shortLink,
  });
}

// ============================================================
// DELETE
// ============================================================

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "shortlink.delete");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const { id } = await context.params;

  const shortLink = await prisma.shortLink.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      clickCount: true,
    },
  });

  if (!shortLink) {
    return NextResponse.json(
      { success: false, error: "Shortlink not found" },
      { status: 404 },
    );
  }

  await prisma.shortLink.delete({
    where: { id },
  });

  return NextResponse.json({
    success: true,
    message: "Shortlink deleted successfully",
    data: shortLink,
  });
}
