import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const skip = (page - 1) * limit;

  const [categories, total] = await prisma.$transaction([
    prisma.category.findMany({
      where: {
        websiteId: auth.website.id,
      },
      orderBy: {
        name: "asc",
      },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,

        _count: {
          select: {
            videos: {
              where: {
                video: {
                  status: "PUBLISHED",
                  visibility: "PUBLIC",
                },
              },
            },
          },
        },
      },
    }),

    prisma.category.count({
      where: {
        websiteId: auth.website.id,
      },
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return NextResponse.json({
    success: true,
    data: categories.map((category) => ({
      id: category.id,
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
      totalPages,
    },
  });
}
