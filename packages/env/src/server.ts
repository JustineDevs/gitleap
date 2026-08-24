import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    ARCJET_KEY: z.string().min(1),
    CORS_ORIGIN: z.url(),
    MODEL_API_URL: z.url().optional(),
    MODEL_API_KEY: z.string().min(1).optional(),
    MODEL_NAME: z.string().min(1).optional(),
    SUPABASE_URL: z
      .url()
      .superRefine((value, context) => {
        if (process.env.NODE_ENV === "production" && !value.startsWith("https://"))
          context.addIssue({
            code: "custom",
            message: "SUPABASE_URL must use HTTPS in production",
          });
      })
      .optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default("gitleap-artifacts"),
    REDIS_URL: z.url().optional(),
    PROCESSING_MAX_COST_USD: z.coerce.number().positive().default(2),
    PROCESSING_MAX_CALL_COST_USD: z.coerce.number().positive().default(0.25),
    ALLOW_BASELINE_COMPILER: z.enum(["true", "false"]).default("false"),
    WORKER_ID: z.string().min(1).optional(),
    OTEL_SERVICE_NAME: z.string().min(1).default("gitleap-server"),
    OTEL_SERVICE_VERSION: z.string().min(1).default("1.0.0"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default("http://localhost:4318"),
    OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
