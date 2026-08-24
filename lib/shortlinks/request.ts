import { isIP } from "node:net";

import {
  classifyShortLinkVisitor,
  type ShortLinkVisitorInfo,
} from "@/lib/shortlinks/visitor";

export interface ShortLinkRequestInfo {
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  country: string | null;
  visitor: ShortLinkVisitorInfo;
}

interface ShortLinkRequestOptions {
  trustShortLinkForwardedHeaders?: boolean;
}

function cleanHeaderValue(
  value: string | null,
  maxLength: number,
): string | null {
  const normalized = value?.trim();

  if (!normalized) return null;

  return normalized
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

function normalizeIp(value: string | null): string | null {
  if (!value) return null;

  const candidate = value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);

  if (!candidate) return null;

  let normalized = candidate.replace(/^"|"$/g, "");

  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.slice(7);
  }

  /*
   * IPv4 dengan port.
   * Contoh: 192.168.1.2:50000
   */
  const ipv4WithPort = normalized.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);

  if (ipv4WithPort) {
    normalized = ipv4WithPort[1];
  }

  /*
   * IPv6 dengan port.
   * Contoh: [2001:db8::1]:443
   */
  const ipv6WithPort = normalized.match(/^\[([^\]]+)\]:\d+$/);

  if (ipv6WithPort) {
    normalized = ipv6WithPort[1];
  }

  return isIP(normalized) ? normalized : null;
}

function normalizeCountry(value: string | null): string | null {
  const country = value?.trim().toUpperCase();

  if (!country || country === "XX") {
    return null;
  }

  if (!/^[A-Z]{2}$/.test(country)) {
    return null;
  }

  return country;
}

function getDirectRequestIp(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for"),
  ];

  for (const candidate of candidates) {
    const ip = normalizeIp(candidate);

    if (ip) return ip;
  }

  return null;
}

function getDirectCountry(headers: Headers): string | null {
  return (
    normalizeCountry(headers.get("cf-ipcountry")) ??
    normalizeCountry(headers.get("x-vercel-ip-country")) ??
    normalizeCountry(headers.get("x-country-code"))
  );
}

export function getShortLinkRequestInfo(
  request: Request,
  options: ShortLinkRequestOptions = {},
): ShortLinkRequestInfo {
  const trustForwarded = options.trustShortLinkForwardedHeaders === true;

  const userAgent = cleanHeaderValue(
    trustForwarded
      ? request.headers.get("x-shortlink-user-agent")
      : request.headers.get("user-agent"),
    1000,
  );

  const referrer = cleanHeaderValue(
    trustForwarded
      ? request.headers.get("x-shortlink-referrer")
      : request.headers.get("referer"),
    2000,
  );

  const ipAddress = trustForwarded
    ? normalizeIp(request.headers.get("x-shortlink-client-ip"))
    : getDirectRequestIp(request.headers);

  const country = trustForwarded
    ? normalizeCountry(request.headers.get("x-shortlink-country"))
    : getDirectCountry(request.headers);

  return {
    ipAddress,
    userAgent,
    referrer,
    country,
    visitor: classifyShortLinkVisitor(userAgent),
  };
}
