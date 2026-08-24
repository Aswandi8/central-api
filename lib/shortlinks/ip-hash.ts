import { createHmac } from "crypto";

const HASH_ALGORITHM = "sha256";

function getIpHashSecret(): string {
  const secret = process.env.SHORTLINK_IP_HASH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "SHORTLINK_IP_HASH_SECRET is required for ShortLink IP hashing",
    );
  }

  return secret;
}

export function hashShortLinkIp(ipAddress: string | null): string | null {
  const normalizedIp = ipAddress?.trim();

  if (!normalizedIp) return null;

  return createHmac(HASH_ALGORITHM, getIpHashSecret())
    .update(normalizedIp)
    .digest("hex");
}
