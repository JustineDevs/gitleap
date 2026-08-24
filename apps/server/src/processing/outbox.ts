import { randomUUID } from "node:crypto";

import prisma from "@gitleap/db";
import { Queue } from "bullmq";

import { redisConnection } from "./redis";

const queue = new Queue("gitleap-processing", { connection: redisConnection() });

export function queueJobId(outboxId: string): string {
  return Buffer.from(outboxId).toString("base64url");
}

type QueuePayload = { jobId: string; eventId: string; version: number };

function assertQueuePayload(value: unknown, expected: QueuePayload): void {
  if (
    !value ||
    typeof value !== "object" ||
    (value as QueuePayload).jobId !== expected.jobId ||
    (value as QueuePayload).eventId !== expected.eventId ||
    (value as QueuePayload).version !== expected.version
  )
    throw new Error("QUEUE_IDENTITY_MISMATCH");
}

async function enqueueExactlyOnce(
  eventType: string,
  payload: QueuePayload,
  delayMs: number | undefined,
): Promise<void> {
  const jobId = queueJobId(payload.eventId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    assertQueuePayload(existing.data, payload);
    return;
  }
  try {
    await queue.add(eventType, payload, {
      jobId,
      attempts: 1,
      ...(delayMs === undefined ? {} : { delay: delayMs }),
      removeOnComplete: false,
    });
  } catch (error) {
    // Redis may have accepted the job while the publisher lost its response.
    // A second lookup distinguishes that crash window from a real publish failure.
    const recovered = await queue.getJob(jobId);
    if (!recovered) throw error;
    assertQueuePayload(recovered.data, payload);
  }
}

export async function publishOutboxBatch(limit = 50): Promise<number> {
  const token = randomUUID();
  const rows = await prisma.outboxEvent.findMany({
    where: {
      publishedAt: null,
      OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 30_000) } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let published = 0;
  for (const row of rows) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: {
        id: row.id,
        publishedAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 30_000) } }],
      },
      data: { claimToken: token, claimedAt: new Date(), publishAttempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    const payload = row.payload as { delayMs?: unknown };
    const delayMs = typeof payload.delayMs === "number" ? payload.delayMs : undefined;
    await enqueueExactlyOnce(
      row.eventType,
      { jobId: row.jobId, eventId: row.id, version: row.stateVersion },
      delayMs,
    );
    await prisma.outboxEvent.updateMany({
      where: { id: row.id, claimToken: token },
      data: { publishedAt: new Date() },
    });
    published++;
  }
  return published;
}

export async function closeProcessingQueue(): Promise<void> {
  await queue.close();
}
