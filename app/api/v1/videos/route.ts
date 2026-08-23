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

  const page = Math.max(
    Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
    1,
  );

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
    100,
  );

  const search = searchParams.get("search")?.trim() || undefined;
  const categorySlug = searchParams.get("category")?.trim() || undefined;

  const skip = (page - 1) * limit;

  const where = {
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

    ...(search
      ? {
          title: {
            contains: search,
            mode: "insensitive" as const,
          },
        }
      : {}),

    ...(categorySlug
      ? {
          categories: {
            some: {
              category: {
                websiteId: auth.website.id,
                slug: categorySlug,
              },
            },
          },
        }
      : {}),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: {
        publishedAt: "desc",
      },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        thumbnail: true,
        duration: true,
        status: true,
        visibility: true,
        publishedAt: true,

        websites: {
          where: {
            websiteId: auth.website.id,
          },
          select: {
            title: true,
            slug: true,
            visibility: true,
            publishedAt: true,
          },
        },

        categories: {
          where: {
            category: {
              websiteId: auth.website.id,
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
        },
      },
    }),

    prisma.video.count({
      where,
    }),
  ]);

  const data = videos.map((video) => {
    const websiteVideo = video.websites[0] ?? null;

    return {
      id: video.id,
      title: websiteVideo?.title ?? video.title,
      slug: websiteVideo?.slug ?? video.slug,
      description: video.description,
      thumbnail: video.thumbnail,
      duration: video.duration,
      status: video.status,
      visibility: websiteVideo?.visibility ?? video.visibility,
      publishedAt: websiteVideo?.publishedAt ?? video.publishedAt,

      categories: video.categories.map(({ category }) => category),
    };
  });

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
