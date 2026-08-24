import "./lib/tracing";
import "dotenv/config";

import { Worker } from "bullmq";
import { cleanupExpiredArtifacts } from "./processing/cleanup";
import { closeProcessingQueue, publishOutboxBatch } from "./processing/outbox";
import { processJob } from "./processing/pipeline";
import { redisConnection } from "./processing/redis";
import { acceptQueueEvent, recoverExpiredLeases } from "./processing/repository";
import { SupabaseStorage } from "./processing/storage-supabase";

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
let stopped = false;
let shutdownPromise: Promise<void> | undefined;

const processingWorker = new Worker(
  "gitleap-processing",
  async (job) => {
    if (typeof job.data?.jobId !== "string") throw new Error("INVALID_QUEUE_PAYLOAD");
    if (typeof job.data?.eventId !== "string") throw new Error("INVALID_QUEUE_EVENT");
    const accepted = await acceptQueueEvent({
      eventId: job.data.eventId,
      jobId: job.data.jobId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    if (!accepted) return;
    await processJob(job.data.jobId, workerId);
  },
  // One bounded archive can retain up to the expanded input ceiling; keep a
  // single job in flight so the worker has headroom on the default VM.
  { connection: redisConnection(), concurrency: 1 },
);

async function run(): Promise<void> {
  while (!stopped) {
    await recoverExpiredLeases();
    await publishOutboxBatch();
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await cleanupExpiredArtifacts(
        new SupabaseStorage({
          url: process.env.SUPABASE_URL,
          serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "gitleap-artifacts",
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}

async function shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  stopped = true;
  shutdownPromise = processingWorker.close().then(closeProcessingQueue);
  return shutdownPromise;
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

if (process.env.NODE_ENV !== "test") {
  void run().catch(async (error) => {
    console.error("processing worker stopped", error);
    await shutdown();
    process.exitCode = 1;
  });
}
