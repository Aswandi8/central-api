import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const MAX_ANALYTICS_DAYS = 365;
const DEFAULT_ANALYTICS_DAYS = 30;
const TOP_LIMIT = 10;

function getRange(days: number) {
  const end = new Date();
  const start = new Date(end);

  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return { start, end };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requirePermission(request, "shortlink.read");

  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status },
    );
  }

  const { searchParams } = new URL(request.url);

  const daysParam = Number(
    searchParams.get("days") ?? String(DEFAULT_ANALYTICS_DAYS),
  );

  const days =
    Number.isInteger(daysParam) && daysParam > 0
      ? Math.min(daysParam, MAX_ANALYTICS_DAYS)
      : DEFAULT_ANALYTICS_DAYS;

  const { start, end } = getRange(days);

  const humanWhere = {
    visitorType: "HUMAN" as const,
    clickedAt: {
      gte: start,
      lte: end,
    },
  };

  const [
    totalShortLinks,
    activeShortLinks,
    clickAggregate,
    rangeClicks,
    uniqueVisitors,
    humanEvents,
    topReferrers,
    topCountries,
    topDevices,
    topBrowsers,
    topOperatingSystems,
    topLinks,
  ] = await Promise.all([
    prisma.shortLink.count(),

    prisma.shortLink.count({
      where: { status: "ACTIVE" },
    }),

    prisma.shortLink.aggregate({
      _sum: {
        clickCount: true,
      },
    }),

    prisma.shortLinkClick.count({
      where: humanWhere,
    }),

    prisma.shortLinkClick.findMany({
      where: {
        ...humanWhere,
        ipHash: {
          not: null,
        },
      },
      distinct: ["ipHash"],
      select: {
        ipHash: true,
      },
    }),

    prisma.shortLinkClick.findMany({
      where: humanWhere,
      select: {
        clickedAt: true,
      },
      orderBy: {
        clickedAt: "asc",
      },
    }),

    prisma.shortLinkClick.groupBy({
      by: ["referrer"],
      where: {
        ...humanWhere,
        referrer: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          referrer: "desc",
        },
      },
      take: TOP_LIMIT,
    }),

    prisma.shortLinkClick.groupBy({
      by: ["country"],
      where: {
        ...humanWhere,
        country: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          country: "desc",
        },
      },
      take: TOP_LIMIT,
    }),

    prisma.shortLinkClick.groupBy({
      by: ["device"],
      where: {
        ...humanWhere,
        device: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          device: "desc",
        },
      },
      take: TOP_LIMIT,
    }),

    prisma.shortLinkClick.groupBy({
      by: ["browser"],
      where: {
        ...humanWhere,
        browser: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          browser: "desc",
        },
      },
      take: TOP_LIMIT,
    }),

    prisma.shortLinkClick.groupBy({
      by: ["os"],
      where: {
        ...humanWhere,
        os: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          os: "desc",
        },
      },
      take: TOP_LIMIT,
    }),

    prisma.shortLink.findMany({
      orderBy: {
        clickCount: "desc",
      },
      take: TOP_LIMIT,

      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        previewType: true,
        destinationUrl: true,
        clickCount: true,
      },
    }),
  ]);

  const dailyMap = new Map<string, number>();

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    dailyMap.set(toDateKey(date), 0);
  }

  for (const event of humanEvents) {
    const key = toDateKey(event.clickedAt);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
  }

  return NextResponse.json({
    success: true,

    data: {
      range: {
        days,
        start,
        end,
      },

      summary: {
        totalShortLinks,
        activeShortLinks,
        inactiveShortLinks: totalShortLinks - activeShortLinks,

        totalClicks: clickAggregate._sum.clickCount ?? 0,
        rangeClicks,
        uniqueVisitors: uniqueVisitors.length,
      },

      clicksByDay: [...dailyMap.entries()].map(([date, clicks]) => ({
        date,
        clicks,
      })),

      topLinks,

      topReferrers: topReferrers.map((item) => ({
        value: item.referrer,
        clicks: item._count._all,
      })),

      topCountries: topCountries.map((item) => ({
        value: item.country,
        clicks: item._count._all,
      })),

      topDevices: topDevices.map((item) => ({
        value: item.device,
        clicks: item._count._all,
      })),

      topBrowsers: topBrowsers.map((item) => ({
        value: item.browser,
        clicks: item._count._all,
      })),

      topOperatingSystems: topOperatingSystems.map((item) => ({
        value: item.os,
        clicks: item._count._all,
      })),
    },
  });
}
