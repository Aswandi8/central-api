import { NextResponse } from "next/server";

import {
  normalizeWebsiteDomain,
  publicSocialShareQuerySchema,
} from "@/lib/public/social-shares";

import { generateSocialShareThumbnail } from "@/lib/public/social-share-thumbnail";

import { prisma } from "@/lib/prisma";

// ============================================================
// ROUTE CONTEXT
// ============================================================

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

// ============================================================
// GET
// ============================================================

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;

  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return NextResponse.json(
      {
        success: false,
        error: "slug is required",
      },
      {
        status: 400,
      },
    );
  }

  // ==========================================================
  // DOMAIN
  // ==========================================================

  const url = new URL(request.url);

  const parsed = publicSocialShareQuerySchema.safeParse({
    domain: url.searchParams.get("domain"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,

        error: parsed.error.issues[0]?.message ?? "Invalid query",
      },
      {
        status: 400,
      },
    );
  }

  const requestedDomain = normalizeWebsiteDomain(parsed.data.domain);

  if (!requestedDomain) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid domain",
      },
      {
        status: 400,
      },
    );
  }

  // ==========================================================
  // WEBSITE
  // ==========================================================

  const websites = await prisma.website.findMany({
    where: {
      status: "ACTIVE",

      domain: {
        not: null,
      },
    },

    select: {
      id: true,
      domain: true,
    },
  });

  const website = websites.find(
    (item) => normalizeWebsiteDomain(item.domain ?? "") === requestedDomain,
  );

  if (!website) {
    return NextResponse.json(
      {
        success: false,
        error: "Social share not found",
      },
      {
        status: 404,
      },
    );
  }

  // ==========================================================
  // SOCIAL SHARE
  // ==========================================================

  const socialShare = await prisma.socialShare.findFirst({
    where: {
      websiteId: website.id,

      slug: normalizedSlug,

      status: "ACTIVE",

      website: {
        status: "ACTIVE",
      },
    },

    select: {
      thumbnail: true,

      shareThumbnail: true,

      displayDuration: true,
    },
  });

  if (!socialShare) {
    return NextResponse.json(
      {
        success: false,
        error: "Social share not found",
      },
      {
        status: 404,
      },
    );
  }

  // ==========================================================
  // SOURCE
  // ==========================================================

  const sourceThumbnail = socialShare.shareThumbnail ?? socialShare.thumbnail;

  // ==========================================================
  // GENERATE
  // ==========================================================

  try {
    const image = await generateSocialShareThumbnail({
      thumbnailUrl: sourceThumbnail,

      displayDuration: socialShare.displayDuration,
    });

    /*
     * Web Response BodyInit accepts Uint8Array cleanly
     * in Next.js/TypeScript.
     */
    const body = new Uint8Array(image);

    return new Response(body, {
      status: 200,

      headers: {
        "Content-Type": "image/png",

        "Content-Length": String(body.byteLength),

        "Cache-Control":
          "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("[SOCIAL SHARE THUMBNAIL]", error);

    return NextResponse.json(
      {
        success: false,

        error: "Unable to generate social share thumbnail",
      },
      {
        status: 502,
      },
    );
  }
}
