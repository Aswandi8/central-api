import { NextResponse } from "next/server";

import { verifyShortLinkInternalRequest } from "@/lib/shortlinks/internal-auth";
import {
  resolveActivePublicShortLink,
  trackPublicShortLink,
} from "@/lib/shortlinks/public";
import { getShortLinkRequestInfo } from "@/lib/shortlinks/request";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

export async function POST(request: Request, context: RouteContext) {
  const internalAuth = verifyShortLinkInternalRequest(request);

  if (internalAuth === "MISCONFIGURED") {
    console.error(
      "[PUBLIC SHORTLINK TRACK] SHORTLINK_INTERNAL_KEY is not configured",
    );

    return NextResponse.json(
      {
        success: false,
        code: "SHORTLINK_TRACKING_MISCONFIGURED",
        error: "Shortlink tracking is unavailable",
      },
      {
        status: 503,
        headers: noStoreHeaders(),
      },
    );
  }

  if (internalAuth === "UNAUTHORIZED") {
    return NextResponse.json(
      {
        success: false,
        code: "UNAUTHORIZED",
        error: "Unauthorized",
      },
      {
        status: 401,
        headers: noStoreHeaders(),
      },
    );
  }

  const { slug } = await context.params;

  const resolved = await resolveActivePublicShortLink(slug);

  if (resolved.state === "NOT_FOUND" || !resolved.shortLink) {
    return NextResponse.json(
      {
        success: false,
        code: "SHORTLINK_NOT_FOUND",
        error: "Shortlink not found",
      },
      {
        status: 404,
        headers: noStoreHeaders(),
      },
    );
  }

  if (resolved.state === "INACTIVE") {
    return NextResponse.json(
      {
        success: false,
        code: "SHORTLINK_INACTIVE",
        error: "Shortlink is inactive",
      },
      {
        status: 410,
        headers: noStoreHeaders(),
      },
    );
  }

  const requestInfo = getShortLinkRequestInfo(request, {
    trustShortLinkForwardedHeaders: true,
  });

  try {
    const tracking = await trackPublicShortLink({
      shortLinkId: resolved.shortLink.id,
      requestInfo,
    });

    return NextResponse.json(
      {
        success: true,

        data: {
          destinationUrl: resolved.shortLink.destinationUrl,

          visitorType: requestInfo.visitor.visitorType,

          socialCrawler: requestInfo.visitor.socialCrawler,

          crawlerName: requestInfo.visitor.crawlerName,

          tracked: tracking.tracked,

          duplicate: tracking.duplicate,

          counted: tracking.counted,

          clickCount: tracking.clickCount,
        },
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      },
    );
  } catch (error) {
    /*
     * Analytics failure tidak boleh
     * mematikan redirect.
     */
    console.error("[PUBLIC SHORTLINK TRACK]", error);

    return NextResponse.json(
      {
        success: true,

        data: {
          destinationUrl: resolved.shortLink.destinationUrl,

          visitorType: requestInfo.visitor.visitorType,

          socialCrawler: requestInfo.visitor.socialCrawler,

          crawlerName: requestInfo.visitor.crawlerName,

          tracked: false,
          duplicate: false,
          counted: false,
          clickCount: null,
        },
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      },
    );
  }
}
