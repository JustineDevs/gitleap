import arcjet, { shield, slidingWindow } from "@arcjet/node";

export const arcjetRateLimit = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    shield({
      mode: "DRY_RUN",
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
