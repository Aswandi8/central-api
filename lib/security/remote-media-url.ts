import { isIP } from "node:net";

import { lookup } from "node:dns/promises";

// ============================================================
// CONSTANTS
// ============================================================

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal"];

// ============================================================
// URL PARSE
// ============================================================

export function parseRemoteMediaUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    /*
     * Jangan menerima:
     *
     * https://user:password@example.com/file.jpg
     */
    if (url.username || url.password) {
      return null;
    }

    if (!url.hostname) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

// ============================================================
// PRIVATE IPV4
// ============================================================

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  /*
   * 0.0.0.0/8
   */
  if (a === 0) {
    return true;
  }

  /*
   * 10.0.0.0/8
   */
  if (a === 10) {
    return true;
  }

  /*
   * 100.64.0.0/10
   */
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  /*
   * 127.0.0.0/8
   */
  if (a === 127) {
    return true;
  }

  /*
   * 169.254.0.0/16
   */
  if (a === 169 && b === 254) {
    return true;
  }

  /*
   * 172.16.0.0/12
   */
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  /*
   * 192.168.0.0/16
   */
  if (a === 192 && b === 168) {
    return true;
  }

  /*
   * Documentation / benchmarking / reserved.
   */
  if (a === 192 && b === 0) {
    return true;
  }

  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }

  /*
   * Multicast + reserved.
   */
  if (a >= 224) {
    return true;
  }

  return false;
}

// ============================================================
// PRIVATE IPV6
// ============================================================

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  /*
   * Unique local:
   * fc00::/7
   */
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  /*
   * Link local:
   * fe80::/10
   */
  if (/^fe[89ab]/i.test(normalized)) {
    return true;
  }

  /*
   * IPv4-mapped IPv6.
   */
  const mappedMatch = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mappedMatch?.[1] && isPrivateIpv4(mappedMatch[1])) {
    return true;
  }

  return false;
}

// ============================================================
// PRIVATE ADDRESS
// ============================================================

export function isPrivateNetworkAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

// ============================================================
// BLOCKED HOST
// ============================================================

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");

  if (!normalized) {
    return true;
  }

  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }

  if (BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  const family = isIP(normalized);

  if (family) {
    return isPrivateNetworkAddress(normalized);
  }

  return false;
}

// ============================================================
// SYNCHRONOUS VALIDATION
// ============================================================

/*
 * Dipakai Zod.
 *
 * Tidak melakukan DNS query karena schema validation
 * harus tetap synchronous.
 */
export function isSafeRemoteMediaUrlSyntax(value: string): boolean {
  const url = parseRemoteMediaUrl(value);

  if (!url) {
    return false;
  }

  return !isBlockedHostname(url.hostname);
}

// ============================================================
// RUNTIME DNS VALIDATION
// ============================================================

export async function assertSafeRemoteMediaUrl(value: string): Promise<URL> {
  const url = parseRemoteMediaUrl(value);

  if (!url) {
    throw new Error("Remote media URL must use http or https");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (isBlockedHostname(hostname)) {
    throw new Error("Remote media URL points to a private or blocked host");
  }

  /*
   * Jika hostname sudah berupa IP literal,
   * pengecekan private/reserved sudah dilakukan
   * oleh isBlockedHostname().
   */
  if (isIP(hostname)) {
    return url;
  }

  /*
   * IMPORTANT:
   *
   * Jangan gunakan:
   *
   * Awaited<ReturnType<typeof lookup>>
   *
   * karena lookup() mempunyai beberapa overload.
   *
   * Dengan all: true, TypeScript akan menginfer:
   *
   * LookupAddress[]
   */
  let addresses;

  try {
    addresses = await lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error("Unable to resolve remote media host");
  }

  if (addresses.length === 0) {
    throw new Error("Remote media host did not resolve to an IP address");
  }

  for (const result of addresses) {
    if (isPrivateNetworkAddress(result.address)) {
      throw new Error(
        "Remote media host resolves to a private or reserved IP address",
      );
    }
  }

  return url;
}
