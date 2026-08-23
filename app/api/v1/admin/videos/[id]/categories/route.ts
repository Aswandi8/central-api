import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const categoryAssignmentSchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),
  categoryIds: z.array(z.string().trim().min(1)).max(100),
});

async function videoExistsOnWebsite(videoId: string, websiteId: string) {
  return prisma.videoWebsite.findUnique({
    where: {
      videoId_websiteId: {
        videoId,
        websiteId,
      },
    },
    select: {
      videoId: true,
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

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "category.read",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const exists = await videoExistsOnWebsite(id, websiteId);

  if (!exists) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  const assignments = await prisma.videoCategory.findMany({
    where: {
      videoId: id,
      category: {
        websiteId,
      },
    },
    orderBy: {
      category: {
        name: "asc",
      },
    },
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: assignments.map((assignment) => assignment.category),
  });
}

export async function PUT(request: Request, context: RouteContext) {
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

  const parsed = categoryAssignmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid category data",
      },
      { status: 400 },
    );
  }

  const { websiteId } = parsed.data;
  const categoryIds = [...new Set(parsed.data.categoryIds)];

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

  const exists = await videoExistsOnWebsite(id, websiteId);

  if (!exists) {
    return NextResponse.json(
      { success: false, error: "Video not found on this website" },
      { status: 404 },
    );
  }

  const categories =
    categoryIds.length > 0
      ? await prisma.category.findMany({
          where: {
            id: { in: categoryIds },
            websiteId,
          },
          select: {
            id: true,
          },
        })
      : [];

  if (categories.length !== categoryIds.length) {
    return NextResponse.json(
      {
        success: false,
        error: "One or more categories do not belong to this website",
      },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.videoCategory.deleteMany({
      where: {
        videoId: id,
        category: {
          websiteId,
        },
      },
    });

    if (categoryIds.length > 0) {
      await tx.videoCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          videoId: id,
          categoryId,
        })),
        skipDuplicates: true,
      });
    }
  });

  return NextResponse.json({
    success: true,
    message: "Video categories updated successfully",
    data: {
      videoId: id,
      websiteId,
      categoryIds,
    },
  });
}
