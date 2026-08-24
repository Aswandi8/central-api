import { timingSafeEqual } from "crypto";

export type ShortLinkInternalAuthResult =
  | "OK"
  | "UNAUTHORIZED"
  | "MISCONFIGURED";

const INTERNAL_HEADER = "x-shortlink-internal-key";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyShortLinkInternalRequest(
  request: Request,
): ShortLinkInternalAuthResult {
  const expected = process.env.SHORTLINK_INTERNAL_KEY?.trim();

  if (!expected) return "MISCONFIGURED";

  const received = request.headers.get(INTERNAL_HEADER)?.trim();

  if (!received || !safeEqual(received, expected)) {
    return "UNAUTHORIZED";
  }

  return "OK";
}
