import { NextResponse } from "next/server";

import {
  normalizeWebsiteDomain,
  publicSocialShareQuerySchema,
} from "@/lib/public/social-shares";

import { generateSocialShareThumbnail } from "@/lib/public/social-share-thumbnail";

import { prisma } from "@/lib/prisma";

// ============================================================
// RUNTIME
// ============================================================

/*
 * IMPORTANT:
 *
 * Endpoint ini menggunakan:
 *
 * - sharp
 * - fs
 * - Buffer
 * - opentype.js
 *
 * Jadi wajib Node.js runtime.
 */
export const runtime = "nodejs";

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
  // ==========================================================
  // PARAMS
  // ==========================================================

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

  // ==========================================================
  // DOMAIN
  // ==========================================================

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
   * Website.domain saat ini mungkin tersimpan sebagai:
   *
   * arvane.com
   * https://arvane.com
   * https://arvane.com/
   *
   * Maka kita normalize sebelum dibandingkan.
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
  // SOURCE THUMBNAIL
  // ==========================================================

  /*
   * Priority:
   *
   * 1. shareThumbnail
   * 2. thumbnail
   *
   * Generated overlay akan ditambahkan setelahnya.
   */
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
     * Response Web API lebih aman dengan Uint8Array
     * daripada Node Buffer.
     */
    const body = new Uint8Array(image);

    return new Response(body, {
      status: 200,

      headers: {
        "Content-Type": "image/png",

        "Content-Length": String(body.byteLength),

        /*
         * Jangan immutable karena:
         *
         * - thumbnail dapat berubah
         * - displayDuration dapat berubah
         *
         * selama Social Share masih editable.
         */
        "Cache-Control":
          "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    // ========================================================
    // ERROR LOG
    // ========================================================

    const message = error instanceof Error ? error.message : String(error);

    const stack = error instanceof Error ? error.stack : undefined;

    console.error("[SOCIAL SHARE THUMBNAIL]", {
      slug: normalizedSlug,

      domain: requestedDomain,

      sourceThumbnail,

      displayDuration: socialShare.displayDuration,

      message,

      stack,
    });

    // ========================================================
    // ERROR RESPONSE
    // ========================================================

    return NextResponse.json(
      {
        success: false,

        error: "Unable to generate social share thumbnail",

        /*
         * Development saja.
         *
         * Production detail tetap disembunyikan,
         * tetapi error lengkap tersedia di Vercel Logs.
         */
        ...(process.env.NODE_ENV === "development"
          ? {
              detail: message,
            }
          : {}),
      },
      {
        status: 502,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
