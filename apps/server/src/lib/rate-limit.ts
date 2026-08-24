import arcjet, { shield, slidingWindow } from "@arcjet/node";
import { env } from "@gitleap/env/server";

export const arcjetRateLimit = arcjet({
  key: env.ARCJET_KEY,
  rules: [
    shield({
      mode: env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
    }),
    slidingWindow({
      mode: "LIVE",
      interval: "1m",
      max: 60,
    }),
  ],
});

export async function checkRateLimit(request: Parameters<typeof arcjetRateLimit.protect>[0]) {
  const decision = await arcjetRateLimit.protect(request);

  return {
    allowed: decision.isAllowed(),
    denied: decision.isDenied(),
    decision,
  };
}
