import type { RedisOptions } from "bullmq";

export function redisConnection(value = process.env.REDIS_URL): RedisOptions {
  if (!value) return { host: "localhost", port: 6379, maxRetriesPerRequest: null };
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
