import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/api-auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
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

  const { slug } = await context.params;

  const { searchParams } = new URL(request.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const limitParam = Number(searchParams.get("limit") ?? "20");

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

  const skip = (page - 1) * limit;

  const category = await prisma.category.findFirst({
    where: {
      websiteId: auth.website.id,
      slug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!category) {
    return NextResponse.json(
      {
        success: false,
        error: "Category not found",
      },
      {
        status: 404,
      },
    );
  }

  const videoWhere = {
    videoId: {
      not: undefined,
    },
    categoryId: category.id,
    video: {
      status: "PUBLISHED" as const,
      visibility: "PUBLIC" as const,
      websites: {
        some: {
          websiteId: auth.website.id,
          visibility: "PUBLIC" as const,
          publishedAt: {
            not: null,
          },
        },
      },
    },
  };

  const [videoCategories, total] = await prisma.$transaction([
    prisma.videoCategory.findMany({
      where: videoWhere,
      orderBy: {
        video: {
          publishedAt: "desc",
        },
      },
      skip,
      take: limit,
      select: {
        video: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            thumbnail: true,
            videoUrl: true,
            streamUrl: true,
            duration: true,
            status: true,
            visibility: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            publishedAt: true,

            websites: {
              where: {
                websiteId: auth.website.id,
                visibility: "PUBLIC",
                publishedAt: {
                  not: null,
                },
              },
              select: {
                title: true,
                slug: true,
                visibility: true,
                publishedAt: true,
              },
              take: 1,
            },
          },
        },
      },
    }),

    prisma.videoCategory.count({
      where: videoWhere,
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const videos = videoCategories.map(({ video }) => {
    const websiteVideo = video.websites[0];

    return {
      id: video.id,
      title: websiteVideo?.title ?? video.title,
      slug: websiteVideo?.slug ?? video.slug,
      description: video.description,
      thumbnail: video.thumbnail,
      videoUrl: video.videoUrl,
      streamUrl: video.streamUrl,
      duration: video.duration,
      status: video.status,
      visibility: websiteVideo?.visibility ?? video.visibility,
      metadata: video.metadata,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      publishedAt: websiteVideo?.publishedAt ?? video.publishedAt,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      category,
      videos,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
  });
}
