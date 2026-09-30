import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  SESSION_COOKIE_NAME: z.string().min(1).default("session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(12).max(256).default(12),
  TRUSTED_ORIGINS: z.string().default("http://localhost:3000")
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  trustedOrigins: parsed.TRUSTED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
