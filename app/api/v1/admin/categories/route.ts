import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const createCategorySchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),
  name: z.string().trim().min(1, "Category name is required").max(100),
  slug: z
    .string()
    .trim()
    .min(1, "Category slug is required")
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug may only contain lowercase letters, numbers, and hyphens",
    ),
  description: z.string().trim().max(1000).nullable().optional(),
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

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const where = {
    websiteId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [categories, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: "asc" },
      select: {
        id: true,
        websiteId: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            videos: true,
          },
        },
      },
    }),
    prisma.category.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: categories.map((category) => ({
      id: category.id,
      websiteId: category.websiteId,
      name: category.name,
      slug: category.slug,
      description: category.description,
      videoCount: category._count.videos,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
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

  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid category data",
      },
      { status: 400 },
    );
  }

  const { websiteId, name, slug, description } = parsed.data;

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "category.create",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const website = await prisma.website.findUnique({
    where: { id: websiteId },
    select: { id: true },
  });

  if (!website) {
    return NextResponse.json(
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  const duplicate = await prisma.category.findUnique({
    where: {
      websiteId_slug: {
        websiteId,
        slug,
      },
    },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      { success: false, error: "Category slug already exists on this website" },
      { status: 409 },
    );
  }

  const category = await prisma.category.create({
    data: {
      websiteId,
      name,
      slug,
      description: description ?? null,
    },
    select: {
      id: true,
      websiteId: true,
      name: true,
      slug: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Category created successfully",
      data: category,
    },
    { status: 201 },
  );
}
