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

  const videoWebsite = await prisma.videoWebsite.findFirst({
    where: {
      websiteId: auth.website.id,
      slug,
      visibility: "PUBLIC",
      publishedAt: {
        not: null,
      },
      video: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
    },
    select: {
      slug: true,
      title: true,
      visibility: true,
      publishedAt: true,

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
      },
    },
  });

  if (!videoWebsite) {
    return NextResponse.json(
      {
        success: false,
        error: "Video not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: videoWebsite.video.id,
      title: videoWebsite.title ?? videoWebsite.video.title,
      slug: videoWebsite.slug,
      description: videoWebsite.video.description,
      thumbnail: videoWebsite.video.thumbnail,
      videoUrl: videoWebsite.video.videoUrl,
      streamUrl: videoWebsite.video.streamUrl,
      duration: videoWebsite.video.duration,
      status: videoWebsite.video.status,
      visibility: videoWebsite.visibility,
      metadata: videoWebsite.video.metadata,
      createdAt: videoWebsite.video.createdAt,
      updatedAt: videoWebsite.video.updatedAt,
      publishedAt: videoWebsite.publishedAt ?? videoWebsite.video.publishedAt,

      categories: videoWebsite.video.categories.map(({ category }) => category),
    },
  });
}
