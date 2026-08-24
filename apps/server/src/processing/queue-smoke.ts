import "dotenv/config";

import { spawn } from "node:child_process";

import prisma from "@gitleap/db";
import { Queue } from "bullmq";

import { closeProcessingQueue, publishOutboxBatch, queueJobId } from "./outbox";
import { redisConnection } from "./redis";
import {
  acceptQueueEvent,
  claimJob,
  failAndScheduleRetry,
  recoverExpiredLeases,
  transition,
  upsertOwnedStage,
} from "./repository";

const suffix = crypto.randomUUID().replaceAll("-", "");
const source = await prisma.sourceIdentity.create({
  data: {
    provider: "github",
    owner: `queue-${suffix}`,
    repository: "fixture",
    commitSha: "b".repeat(40),
    pipelineVersion: "queue-test",
    configurationHash: suffix,
  },
});
const job = await prisma.processingJob.create({ data: { sourceIdentityId: source.id } });
const crashSource = await prisma.sourceIdentity.create({
  data: {
    provider: "github",
    owner: `crash-${suffix}`,
    repository: "fixture",
    commitSha: "d".repeat(40),
    pipelineVersion: "queue-test",
    configurationHash: `${suffix}-crash`,
  },
});
const crashJob = await prisma.processingJob.create({ data: { sourceIdentityId: crashSource.id } });
const eventId = `${job.id}:SUBMIT:${job.stateVersion}`;
await prisma.outboxEvent.create({
  data: {
    id: eventId,
    jobId: job.id,
    eventType: "SUBMIT",
    stateVersion: job.stateVersion,
    payload: { jobId: job.id },
  },
});
const queue = new Queue("gitleap-processing", { connection: redisConnection() });

try {
  const published = await publishOutboxBatch();
  const queued = await queue.getJob(queueJobId(eventId));
  if (published < 1 || !queued) throw new Error("outbox publication failed");
  const accepted = await acceptQueueEvent({
    eventId,
    jobId: job.id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const duplicate = await acceptQueueEvent({
    eventId,
    jobId: job.id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const inboxCount = await prisma.consumerInbox.count({ where: { eventId } });
  const stageCount = await prisma.jobStage.count({ where: { jobId: job.id, name: "queue" } });
  if (!accepted || duplicate || inboxCount !== 1 || stageCount !== 1)
    throw new Error("duplicate delivery invariant failed");

  const lease = await claimJob({ jobId: job.id, workerId: "queue-smoke", leaseMs: 60_000 });
  if (!lease) throw new Error("queue job was not claimable");
  if (
    !(await transition({
      jobId: job.id,
      fromVersion: lease.stateVersion,
      to: "processing",
      leaseToken: lease.leaseToken,
    }))
  )
    throw new Error("queue job did not enter processing");
  const retried = await failAndScheduleRetry({
    jobId: job.id,
    fromVersion: lease.stateVersion + 1,
    leaseToken: lease.leaseToken,
  });
  const retryEvent = await prisma.outboxEvent.findFirst({
    where: { jobId: job.id, eventType: "RETRY" },
    select: { publishedAt: true, stateVersion: true },
  });
  const retryJob = await prisma.processingJob.findUniqueOrThrow({
    where: { id: job.id },
    select: { leaseToken: true, workerId: true, leaseExpiresAt: true },
  });
  if (
    !retried ||
    !retryEvent ||
    retryEvent.publishedAt !== null ||
    retryJob.leaseToken !== null ||
    retryJob.workerId !== null ||
    retryJob.leaseExpiresAt !== null
  )
    throw new Error("transactional retry invariant failed");

  await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      state: "PROCESSING",
      stateVersion: { increment: 1 },
      leaseToken: "crashed-lease",
      leaseExpiresAt: new Date(Date.now() - 1_000),
      workerId: "crashed-worker",
    },
  });
  await prisma.usageRecord.create({
    data: {
      jobId: job.id,
      stage: "synthesis",
      leaseToken: "crashed-lease",
      reservedCostUsd: 0.1,
      actualCostUsd: 0.1,
    },
  });
  await prisma.processingJob.update({
    where: { id: job.id },
    data: { reservedCostUsd: 0.1 },
  });
  const recovered = await recoverExpiredLeases();
  const current = await prisma.processingJob.findUniqueOrThrow({
    where: { id: job.id },
    select: { state: true, leaseToken: true, workerId: true, reservedCostUsd: true },
  });
  const releasedUsage = await prisma.usageRecord.findFirstOrThrow({
    where: { jobId: job.id, stage: "synthesis" },
    select: { actualCostUsd: true, reconciledAt: true },
  });
  if (
    recovered !== 1 ||
    current.state !== "QUEUED" ||
    current.leaseToken !== null ||
    current.workerId !== null ||
    Number(current.reservedCostUsd) !== 0 ||
    Number(releasedUsage.actualCostUsd) !== 0 ||
    releasedUsage.reconciledAt === null
  )
    throw new Error("crash recovery invariant failed");

  const child = spawn(
    process.execPath,
    [
      "--cwd",
      "apps/server",
      "-e",
      `const { claimJob } = await import("./src/processing/repository.ts"); const lease = await claimJob({ jobId: "${crashJob.id}", workerId: "killed-child", leaseMs: 60000 }); process.exit(lease ? 137 : 2);`,
    ],
    { cwd: new URL("../../../../", import.meta.url).pathname, env: process.env },
  );
  let childOutput = "";
  child.stdout?.on("data", (chunk) => {
    childOutput += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    childOutput += String(chunk);
  });
  const childCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (childCode === 0) throw new Error("crash child unexpectedly exited cleanly");
  await prisma.processingJob.update({
    where: { id: crashJob.id },
    data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
  });
  const processRecovered = await recoverExpiredLeases();
  const processCurrent = await prisma.processingJob.findUniqueOrThrow({
    where: { id: crashJob.id },
    select: { state: true, leaseToken: true, workerId: true },
  });
  if (
    processRecovered !== 1 ||
    processCurrent.state !== "QUEUED" ||
    processCurrent.leaseToken !== null ||
    processCurrent.workerId !== null
  )
    throw new Error(
      `child process recovery invariant failed: ${JSON.stringify({ childCode, processRecovered, processCurrent, childOutput })}`,
    );
  try {
    await upsertOwnedStage({
      jobId: crashJob.id,
      leaseToken: "crashed-lease",
      stateVersion: 1,
      name: "stale",
      inputDigest: "stale",
      state: "SUCCEEDED",
    });
    throw new Error("stale stage write was accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "STALE_WORKER") throw error;
  }
  await prisma.processingJob.update({
    where: { id: crashJob.id },
    data: {
      state: "CANCEL_REQUESTED",
      stateVersion: { increment: 1 },
      leaseToken: "cancelled-crash-lease",
      leaseExpiresAt: new Date(Date.now() - 1_000),
      cancelRequestedAt: new Date(),
    },
  });
  const cancelledRecovery = await recoverExpiredLeases();
  const cancelledCurrent = await prisma.processingJob.findUniqueOrThrow({
    where: { id: crashJob.id },
    select: { state: true, leaseToken: true, workerId: true },
  });
  if (
    cancelledRecovery !== 1 ||
    cancelledCurrent.state !== "CANCELLED" ||
    cancelledCurrent.leaseToken !== null ||
    cancelledCurrent.workerId !== null
  )
    throw new Error("cancelled worker recovery invariant failed");
  console.log(
    JSON.stringify({
      published,
      duplicateSuppressed: true,
      retryScheduled: true,
      recovered,
      childProcessRecovered: true,
      cancelledWorkerRecovered: true,
    }),
  );
} finally {
  await queue.removeJobScheduler(eventId).catch(() => undefined);
  await queue.remove(queueJobId(eventId)).catch(() => undefined);
  await queue.close();
  await closeProcessingQueue();
  await prisma.processingJob.delete({ where: { id: job.id } });
  await prisma.sourceIdentity.delete({ where: { id: source.id } });
  await prisma.processingJob.delete({ where: { id: crashJob.id } });
  await prisma.sourceIdentity.delete({ where: { id: crashSource.id } });
  await prisma.$disconnect();
}
