import { NextResponse } from "next/server";

import {
  normalizeWebsiteDomain,
  publicSocialShareQuerySchema,
  publicSocialShareSelect,
  serializePublicSocialShare,
} from "@/lib/public/social-shares";

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

  // ==========================================================
  // SLUG
  // ==========================================================

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
  // QUERY
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

  /*
   * Website.domain may currently contain:
   *
   * web-a.com
   * https://web-a.com
   *
   * Prisma cannot apply our JS normalization inside a query,
   * so fetch candidate ACTIVE websites with a configured domain
   * and normalize before matching.
   */
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

    select: publicSocialShareSelect,
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
  // RESPONSE
  // ==========================================================

  return NextResponse.json(
    {
      success: true,

      data: serializePublicSocialShare(socialShare),
    },
    {
      status: 200,

      headers: {
        /*
         * Public route can be cached briefly,
         * but avoid very long stale results while editing.
         */
        "Cache-Control":
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
