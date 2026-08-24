import "dotenv/config";

import { createOrGetProcessingJob } from "@gitleap/api/processing";
import { reserveSubmissionQuota } from "@gitleap/api/quota";
import prisma from "@gitleap/db";
import { Queue } from "bullmq";

import { closeProcessingQueue, publishOutboxBatch, queueJobId } from "./outbox";
import { redisConnection } from "./redis";
import {
  claimJob,
  createOrGetJob,
  reconcileModelCost,
  reserveModelCost,
  transition,
} from "./repository";

const suffix = crypto.randomUUID().replaceAll("-", "");
const user = await prisma.user.create({
  data: { id: `load-${suffix}`, name: "Load Smoke", email: `load-${suffix}@example.test` },
});
const identity = {
  provider: "github" as const,
  owner: `load-${suffix}`,
  repository: "fixture",
  commitSha: "a".repeat(40),
};
const options = { includeTests: true, parserSet: "v1-lexical", skillLimit: 1 };
const jobIds: string[] = [];
const queue = new Queue("gitleap-processing", { connection: redisConnection() });

try {
  const apiIdentity = await prisma.sourceIdentity.create({
    data: {
      provider: "github",
      owner: `${identity.owner}-api`,
      repository: identity.repository,
      commitSha: identity.commitSha,
      pipelineVersion: "v1",
      configurationHash: "quota-idempotency",
    },
  });
  const firstApiSubmission = await createOrGetProcessingJob({
    sourceIdentityId: apiIdentity.id,
    userId: user.id,
  });
  jobIds.push(firstApiSubmission.job.id);
  for (let index = 0; index < 19; index += 1) {
    const repeated = await createOrGetProcessingJob({
      sourceIdentityId: apiIdentity.id,
      userId: user.id,
    });
    if (!repeated.reused || repeated.job.id !== firstApiSubmission.job.id)
      throw new Error("API duplicate submission was not reused");
  }
  const apiQuota = await prisma.submissionQuota.findFirst({
    where: { userId: user.id },
    select: { count: true },
  });
  if (apiQuota?.count !== 1) throw new Error("API duplicate submission consumed quota");

  const duplicates = await Promise.all(
    Array.from({ length: 20 }, () =>
      createOrGetJob({ userId: user.id, identity, pipelineVersion: "load-smoke", options }),
    ),
  );
  const duplicateIds = new Set(duplicates.map(({ job }) => job.id));
  if (duplicateIds.size !== 1 || duplicates.filter(({ reused }) => !reused).length !== 1)
    throw new Error("duplicate submission load invariant failed");
  const duplicateJob = duplicates[0]?.job;
  if (!duplicateJob) throw new Error("duplicate submission did not create a job");
  jobIds.push(duplicateJob.id);

  const pressure = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      createOrGetJob({
        userId: user.id,
        identity: { ...identity, owner: `${identity.owner}-${index}` },
        pipelineVersion: "load-smoke",
        options,
      }),
    ),
  );
  jobIds.push(...pressure.map(({ job }) => job.id));
  const published = await publishOutboxBatch(100);
  if (published < 21) throw new Error(`queue pressure published only ${published} jobs`);

  const lease = await claimJob({ jobId: duplicateJob.id, workerId: "load-smoke", leaseMs: 60_000 });
  if (
    !lease ||
    !(await transition({
      jobId: duplicateJob.id,
      fromVersion: lease.stateVersion,
      to: "processing",
      leaseToken: lease.leaseToken,
    }))
  )
    throw new Error("cost load job was not claimable");
  const reservations = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      reserveModelCost({
        jobId: duplicateJob.id,
        stage: `load-cost-${index}`,
        leaseToken: lease.leaseToken,
        inputTokens: 1,
        outputTokens: 1,
        amountUsd: 0.25,
      }),
    ),
  );
  if (reservations.filter(Boolean).length !== 8)
    throw new Error(`cost limit load invariant failed: ${JSON.stringify(reservations)}`);
  await reconcileModelCost({
    jobId: duplicateJob.id,
    stage: "load-cost-0",
    leaseToken: lease.leaseToken,
    reservedUsd: 0.25,
    actualUsd: 0.1,
    inputTokens: 1,
    outputTokens: 1,
  });
  await reconcileModelCost({
    jobId: duplicateJob.id,
    stage: "load-cost-0",
    leaseToken: lease.leaseToken,
    reservedUsd: 0.25,
    actualUsd: 0.1,
  });
  const settledUsage = await prisma.usageRecord.findFirst({
    where: { jobId: duplicateJob.id, stage: "load-cost-0" },
    select: { actualCostUsd: true, reconciledAt: true },
  });
  const settledJob = await prisma.processingJob.findUniqueOrThrow({
    where: { id: duplicateJob.id },
    select: { reservedCostUsd: true, usedCostUsd: true },
  });
  if (
    !settledUsage?.reconciledAt ||
    Number(settledUsage.actualCostUsd) !== 0.1 ||
    Number(settledJob.usedCostUsd) !== 0.1 ||
    Number(settledJob.reservedCostUsd) !== 1.75
  )
    throw new Error("cost reconciliation idempotency invariant failed");

  const quota = await Promise.all(
    Array.from({ length: 20 }, () =>
      reserveSubmissionQuota(user.id, new Date("2026-08-14T12:00:00.000Z")),
    ),
  );
  if (quota.filter(Boolean).length !== 10) throw new Error("quota load invariant failed");
  console.log(
    JSON.stringify({
      duplicateSubmissions: 20,
      queuePublished: published,
      costAccepted: 8,
      quotaAccepted: 10,
    }),
  );
} finally {
  const jobs = await prisma.processingJob.findMany({
    where: { id: { in: jobIds } },
    select: { outboxEvents: { select: { id: true } } },
  });
  for (const job of jobs)
    for (const event of job.outboxEvents)
      await queue.remove(queueJobId(event.id)).catch(() => undefined);
  const sources = await prisma.sourceIdentity.findMany({
    where: { owner: { startsWith: identity.owner } },
    select: { id: true },
  });
  const sourceIds = sources.map(({ id }) => id);
  for (const sourceId of sourceIds) {
    const sourceJobs = await prisma.processingJob.findMany({
      where: { sourceIdentityId: sourceId },
      select: { id: true },
    });
    for (const { id } of sourceJobs) await prisma.processingJob.delete({ where: { id } });
    await prisma.sourceIdentity.delete({ where: { id: sourceId } });
  }
  await prisma.submissionQuota.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await queue.close();
  await closeProcessingQueue();
  await prisma.$disconnect();
}
