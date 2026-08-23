import { createHash, randomBytes } from "node:crypto";

const API_KEY_PREFIX = "nxc_live_";

export function generateApiKey() {
  const secret = randomBytes(32).toString("hex");
  const key = `${API_KEY_PREFIX}${secret}`;

  return {
    key,
    hash: hashApiKey(key),
  };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
