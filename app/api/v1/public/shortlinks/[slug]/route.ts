import { NextResponse } from "next/server";

import { resolveActivePublicShortLink } from "@/lib/shortlinks/public";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  const result = await resolveActivePublicShortLink(slug);

  if (result.state === "NOT_FOUND" || !result.shortLink) {
    return NextResponse.json(
      {
        success: false,
        code: "SHORTLINK_NOT_FOUND",
        error: "Shortlink not found",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (result.state === "INACTIVE") {
    return NextResponse.json(
      {
        success: false,
        code: "SHORTLINK_INACTIVE",
        error: "Shortlink is inactive",
      },
      {
        status: 410,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: result.shortLink,
    },
    {
      status: 200,
      headers: {
        /*
         * Untuk foundation kita buat no-store dahulu.
         * Social caching strategy kita tentukan saat
         * /watch/[slug] dibuat.
         */
        "Cache-Control": "no-store",
      },
    },
  );
}
