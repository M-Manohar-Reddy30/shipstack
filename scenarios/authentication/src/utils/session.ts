import { createHash, randomBytes } from "node:crypto";

export function generateSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
