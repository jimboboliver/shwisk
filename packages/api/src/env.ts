import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function apiEnv() {
  return createEnv({
    server: {
      AWS_REGION: z.string().min(1).optional().default("us-east-1"),
      OPENAI_API_KEY: z.string().min(1),
      NODE_ENV: z.enum(["development", "production"]).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
