export type ShortLinkVisitorType = "HUMAN" | "CRAWLER" | "BOT" | "UNKNOWN";

export interface ShortLinkVisitorInfo {
  visitorType: ShortLinkVisitorType;
  socialCrawler: boolean;
  crawlerName: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
}

const SOCIAL_CRAWLERS: ReadonlyArray<{
  name: string;
  patterns: readonly string[];
}> = [
  {
    name: "Facebook",
    patterns: [
      "facebookexternalhit",
      "facebookcatalog",
      "facebookbot",
      "meta-externalagent",
      "meta-externalfetcher",
    ],
  },
  {
    name: "X",
    patterns: ["twitterbot"],
  },
  {
    name: "WhatsApp",
    patterns: ["whatsapp"],
  },
  {
    name: "Telegram",
    patterns: ["telegrambot"],
  },
  {
    name: "LinkedIn",
    patterns: ["linkedinbot"],
  },
  {
    name: "Discord",
    patterns: ["discordbot"],
  },
  {
    name: "Slack",
    patterns: ["slackbot", "slack-imgproxy"],
  },
  {
    name: "Pinterest",
    patterns: ["pinterestbot"],
  },
  {
    name: "Skype",
    patterns: ["skypeuripreview"],
  },
  {
    name: "VK",
    patterns: ["vkshare"],
  },
];

const CRAWLER_PATTERNS = [
  "googlebot",
  "google-inspectiontool",
  "bingbot",
  "bingpreview",
  "yandexbot",
  "duckduckbot",
  "baiduspider",
  "applebot",
  "petalbot",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "bytespider",
] as const;

const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "scraper",
  "headlesschrome",
  "phantomjs",
  "selenium",
  "playwright",
  "puppeteer",
  "curl/",
  "wget/",
  "python-requests",
  "python/",
  "httpclient",
  "okhttp",
  "postmanruntime",
  "insomnia",
] as const;

function includesAny(userAgent: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => userAgent.includes(pattern));
}

function detectSocialCrawler(userAgent: string): {
  socialCrawler: boolean;
  crawlerName: string | null;
} {
  for (const crawler of SOCIAL_CRAWLERS) {
    if (includesAny(userAgent, crawler.patterns)) {
      return {
        socialCrawler: true,
        crawlerName: crawler.name,
      };
    }
  }

  return {
    socialCrawler: false,
    crawlerName: null,
  };
}

function detectBrowser(userAgent: string): string | null {
  if (userAgent.includes("edg/")) {
    return "Edge";
  }

  if (userAgent.includes("opr/") || userAgent.includes("opera")) {
    return "Opera";
  }

  if (userAgent.includes("firefox/") || userAgent.includes("fxios/")) {
    return "Firefox";
  }

  if (userAgent.includes("chrome/") || userAgent.includes("crios/")) {
    return "Chrome";
  }

  if (
    userAgent.includes("safari/") &&
    !userAgent.includes("chrome/") &&
    !userAgent.includes("crios/")
  ) {
    return "Safari";
  }

  return null;
}

function detectOs(userAgent: string): string | null {
  if (userAgent.includes("android")) {
    return "Android";
  }

  if (
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod")
  ) {
    return "iOS";
  }

  if (userAgent.includes("windows")) {
    return "Windows";
  }

  if (userAgent.includes("cros")) {
    return "Chrome OS";
  }

  if (userAgent.includes("mac os x") || userAgent.includes("macintosh")) {
    return "macOS";
  }

  if (userAgent.includes("linux")) {
    return "Linux";
  }

  return null;
}

function detectDevice(userAgent: string): string | null {
  if (userAgent.includes("ipad") || userAgent.includes("tablet")) {
    return "Tablet";
  }

  if (
    userAgent.includes("mobile") ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipod") ||
    userAgent.includes("android")
  ) {
    return "Mobile";
  }

  if (
    userAgent.includes("windows") ||
    userAgent.includes("macintosh") ||
    userAgent.includes("linux") ||
    userAgent.includes("cros")
  ) {
    return "Desktop";
  }

  return null;
}

export function classifyShortLinkVisitor(
  rawUserAgent: string | null,
): ShortLinkVisitorInfo {
  const userAgent = rawUserAgent?.trim().toLowerCase() ?? "";

  if (!userAgent) {
    return {
      visitorType: "UNKNOWN",
      socialCrawler: false,
      crawlerName: null,
      device: null,
      browser: null,
      os: null,
    };
  }

  const social = detectSocialCrawler(userAgent);

  if (social.socialCrawler) {
    return {
      visitorType: "CRAWLER",
      socialCrawler: true,
      crawlerName: social.crawlerName,
      device: null,
      browser: null,
      os: null,
    };
  }

  if (includesAny(userAgent, CRAWLER_PATTERNS)) {
    return {
      visitorType: "CRAWLER",
      socialCrawler: false,
      crawlerName: null,
      device: null,
      browser: null,
      os: null,
    };
  }

  if (includesAny(userAgent, BOT_PATTERNS)) {
    return {
      visitorType: "BOT",
      socialCrawler: false,
      crawlerName: null,
      device: null,
      browser: null,
      os: null,
    };
  }

  const browser = detectBrowser(userAgent);

  const os = detectOs(userAgent);

  const device = detectDevice(userAgent);

  if (browser || os || device) {
    return {
      visitorType: "HUMAN",
      socialCrawler: false,
      crawlerName: null,
      device,
      browser,
      os,
    };
  }

  return {
    visitorType: "UNKNOWN",
    socialCrawler: false,
    crawlerName: null,
    device: null,
    browser: null,
    os: null,
  };
}
