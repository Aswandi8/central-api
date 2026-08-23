import crypto from "node:crypto";

const INVITATION_TOKEN_BYTES = 32;

export function generateInvitationToken(): string {
  return crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createInvitationToken() {
  const token = generateInvitationToken();

  return {
    token,
    tokenHash: hashInvitationToken(token),
  };
}
