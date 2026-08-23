import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug may only contain lowercase letters, numbers, and hyphens",
      )
      .optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

async function getCategory(id: string) {
  return prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      websiteId: true,
      name: true,
      slug: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      website: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
      _count: {
        select: {
          videos: true,
        },
      },
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const category = await getCategory(id);

  if (!category) {
    return NextResponse.json(
      { success: false, error: "Category not found" },
      { status: 404 },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    category.websiteId,
    "category.read",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...category,
      videoCount: category._count.videos,
      _count: undefined,
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const existing = await getCategory(id);

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Category not found" },
      { status: 404 },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    existing.websiteId,
    "category.update",
  );

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

  const parsed = updateCategorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid category data",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  if (data.slug && data.slug !== existing.slug) {
    const duplicate = await prisma.category.findUnique({
      where: {
        websiteId_slug: {
          websiteId: existing.websiteId,
          slug: data.slug,
        },
      },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== id) {
      return NextResponse.json(
        {
          success: false,
          error: "Category slug already exists on this website",
        },
        { status: 409 },
      );
    }
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.description !== undefined
        ? { description: data.description }
        : {}),
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

  return NextResponse.json({
    success: true,
    message: "Category updated successfully",
    data: category,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const category = await getCategory(id);

  if (!category) {
    return NextResponse.json(
      { success: false, error: "Category not found" },
      { status: 404 },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    category.websiteId,
    "category.delete",
  );

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  if (category._count.videos > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Category cannot be deleted while videos are assigned to it",
        videoCount: category._count.videos,
      },
      { status: 409 },
    );
  }

  await prisma.category.delete({
    where: { id },
  });

  return NextResponse.json({
    success: true,
    message: "Category deleted successfully",
    data: {
      id: category.id,
      name: category.name,
    },
  });
}
