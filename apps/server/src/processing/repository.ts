import { randomUUID } from "node:crypto";

import prisma, { Prisma } from "@gitleap/db";

import type { PipelineOptions, SourceIdentity } from "./identity";
import { canonicalIdentityHash } from "./identity";
import { PROCESSING_LIMITS } from "./limits";
import type { InternalState } from "./state";
import { assertTransition } from "./state";

const ACTIVE_STATES = [
  "QUEUED",
  "CLAIMED",
  "PROCESSING",
  "FAILED_RETRYABLE",
  "CANCEL_REQUESTED",
] as const;

export type SubmitJobInput = {
  userId: string;
  identity: SourceIdentity;
  pipelineVersion: string;
  options: PipelineOptions;
};

export function eventId(jobId: string, eventType: string, stateVersion: number): string {
  return `${jobId}:${eventType}:${stateVersion}`;
}

export function retryBackoffMs(attempt: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export async function createOrGetJob(
  input: SubmitJobInput,
): Promise<{ job: Awaited<ReturnType<typeof prisma.processingJob.create>>; reused: boolean }> {
  const configurationHash = canonicalIdentityHash(
    input.identity,
    input.pipelineVersion,
    input.options,
  );
  const transact = () =>
    prisma.$transaction(async (tx) => {
      const source = await tx.sourceIdentity.upsert({
        where: {
          provider_owner_repository_commitSha_pipelineVersion_configurationHash: {
            provider: input.identity.provider,
            owner: input.identity.owner,
            repository: input.identity.repository,
            commitSha: input.identity.commitSha,
            pipelineVersion: input.pipelineVersion,
            configurationHash,
          },
        },
        create: { ...input.identity, pipelineVersion: input.pipelineVersion, configurationHash },
        update: {},
      });
      const active = await tx.processingJob.findFirst({
        where: { sourceIdentityId: source.id, state: { in: [...ACTIVE_STATES] } },
        orderBy: { createdAt: "desc" },
      });
      const job =
        active ??
        (await tx.processingJob.create({
          data: {
            sourceIdentityId: source.id,
            maxCostUsd: PROCESSING_LIMITS.maxJobCostUsd,
            access: { create: { userId: input.userId, role: "OWNER" } },
          },
        }));
      if (!active) {
        await tx.outboxEvent.create({
          data: {
            id: eventId(job.id, "SUBMIT", job.stateVersion),
            jobId: job.id,
            eventType: "SUBMIT",
            stateVersion: job.stateVersion,
            payload: { jobId: job.id },
          },
        });
      }
      if (active) {
        await tx.jobAccess.upsert({
          where: { jobId_userId: { jobId: job.id, userId: input.userId } },
          update: { revokedAt: null },
          create: { jobId: job.id, userId: input.userId, role: "READER" },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId: input.userId,
          jobId: job.id,
          action: active ? "job.access_granted" : "job.created",
          metadata: { role: active ? "READER" : "OWNER" },
        },
      });
      return { job, reused: Boolean(active) };
    });
  for (let attempt = 0; ; attempt++) {
    try {
      return await transact();
    } catch (error) {
      const isUniqueRace =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueRace || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
    }
  }
}

export function newLeaseToken(): string {
  return randomUUID();
}

const stateValue: Record<InternalState, string> = {
  queued: "QUEUED",
  claimed: "CLAIMED",
  processing: "PROCESSING",
  ready: "READY",
  failed_retryable: "FAILED_RETRYABLE",
  failed_terminal: "FAILED_TERMINAL",
  cancel_requested: "CANCEL_REQUESTED",
  cancelled: "CANCELLED",
  expired: "EXPIRED",
};
const internalValue: Record<string, InternalState> = Object.fromEntries(
  Object.entries(stateValue).map(([key, value]) => [value, key]),
) as Record<string, InternalState>;

export async function claimJob(input: {
  jobId: string;
  workerId: string;
  leaseMs: number;
}): Promise<{ leaseToken: string; stateVersion: number } | null> {
  const leaseToken = newLeaseToken();
  const now = new Date();
  const [job] = await prisma.processingJob.updateManyAndReturn({
    where: {
      id: input.jobId,
      state: { in: ["QUEUED", "FAILED_RETRYABLE"] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      state: "CLAIMED",
      stateVersion: { increment: 1 },
      attempt: { increment: 1 },
      workerId: input.workerId,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      heartbeatAt: now,
    },
    select: { stateVersion: true },
  });
  if (!job) return null;
  return { leaseToken, stateVersion: job.stateVersion };
}

export async function recoverExpiredLeases(limit = 50): Promise<number> {
  const now = new Date();
  const expired = await prisma.processingJob.findMany({
    where: {
      state: { in: ["CLAIMED", "PROCESSING", "CANCEL_REQUESTED"] },
      leaseExpiresAt: { lt: now },
    },
    select: { id: true, state: true, stateVersion: true },
    take: limit,
  });
  let recovered = 0;
  for (const job of expired) {
    await prisma.$transaction(async (tx) => {
      const [changed] = await tx.processingJob.updateManyAndReturn({
        where: {
          id: job.id,
          state: { in: ["CLAIMED", "PROCESSING", "CANCEL_REQUESTED"] },
          stateVersion: job.stateVersion,
          leaseExpiresAt: { lt: now },
        },
        data: {
          state: job.state === "CANCEL_REQUESTED" ? "CANCELLED" : "QUEUED",
          stateVersion: { increment: 1 },
          leaseToken: null,
          workerId: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        },
        select: { stateVersion: true },
      });
      if (!changed) return;
      const outstanding = await tx.usageRecord.aggregate({
        where: { jobId: job.id, reconciledAt: null, leaseToken: { not: null } },
        _sum: { reservedCostUsd: true },
      });
      const reserved = outstanding._sum.reservedCostUsd;
      if (reserved && Number(reserved) > 0) {
        await tx.usageRecord.updateMany({
          where: { jobId: job.id, reconciledAt: null, leaseToken: { not: null } },
          data: { actualCostUsd: 0, reconciledAt: now },
        });
        await tx.$executeRaw(
          Prisma.sql`UPDATE "ProcessingJob" SET "reservedCostUsd" = GREATEST("reservedCostUsd" - ${reserved}, 0) WHERE "id" = ${job.id}`,
        );
      }
      if (job.state === "CANCEL_REQUESTED") {
        recovered++;
        return;
      }
      const next = changed.stateVersion;
      await tx.outboxEvent.upsert({
        where: { id: eventId(job.id, "RECOVER", next) },
        update: {},
        create: {
          id: eventId(job.id, "RECOVER", next),
          jobId: job.id,
          eventType: "RECOVER",
          stateVersion: next,
          payload: { jobId: job.id, recovered: true },
        },
      });
      recovered++;
    });
  }
  return recovered;
}

export async function upsertOwnedStage(input: {
  jobId: string;
  leaseToken: string;
  stateVersion: number;
  name: string;
  inputDigest: string;
  outputDigest?: string;
  output?: Prisma.InputJsonValue;
  state: "PROCESSING" | "SUCCEEDED";
  startedAt?: Date;
  finishedAt?: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const owner = await tx.processingJob.findFirst({
      where: {
        id: input.jobId,
        state: "PROCESSING",
        stateVersion: input.stateVersion,
        leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!owner) throw new Error("STALE_WORKER");
    await tx.jobStage.upsert({
      where: {
        jobId_name_inputDigest: {
          jobId: input.jobId,
          name: input.name,
          inputDigest: input.inputDigest,
        },
      },
      update: {
        state: input.state,
        ...(input.outputDigest === undefined ? {} : { outputDigest: input.outputDigest }),
        ...(input.output === undefined ? {} : { output: input.output }),
        ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finishedAt: input.finishedAt }),
      },
      create: {
        jobId: input.jobId,
        name: input.name,
        inputDigest: input.inputDigest,
        ...(input.outputDigest === undefined ? {} : { outputDigest: input.outputDigest }),
        ...(input.output === undefined ? {} : { output: input.output }),
        state: input.state,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
    });
  });
}

export async function publishReadyArtifact(input: {
  jobId: string;
  stateVersion: number;
  leaseToken: string;
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  contentType: string;
  provenance: Prisma.InputJsonValue;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const result = await tx.processingJob.updateMany({
      where: {
        id: input.jobId,
        state: "PROCESSING",
        stateVersion: input.stateVersion,
        leaseToken: input.leaseToken,
        cancelRequestedAt: null,
      },
      data: {
        state: "READY",
        stateVersion: { increment: 1 },
        leaseToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        expiresAt,
      },
    });
    if (!result.count) throw new Error("STALE_WORKER");
    await tx.artifact.upsert({
      where: { objectKey: input.objectKey },
      update: { availableAt: now, expiresAt },
      create: {
        jobId: input.jobId,
        objectKey: input.objectKey,
        checksum: input.checksum,
        sizeBytes: BigInt(input.sizeBytes),
        contentType: input.contentType,
        provenance: input.provenance,
        availableAt: now,
        expiresAt,
      },
    });
  });
}

export async function heartbeat(input: {
  jobId: string;
  leaseToken: string;
  leaseMs: number;
}): Promise<boolean> {
  const result = await prisma.processingJob.updateMany({
    where: {
      id: input.jobId,
      leaseToken: input.leaseToken,
      state: { in: ["CLAIMED", "PROCESSING"] },
      leaseExpiresAt: { gt: new Date() },
    },
    data: { heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + input.leaseMs) },
  });
  return result.count === 1;
}

export async function transition(input: {
  jobId: string;
  fromVersion: number;
  to: InternalState;
  leaseToken?: string;
}): Promise<boolean> {
  const current = await prisma.processingJob.findUnique({
    where: { id: input.jobId },
    select: { state: true, stateVersion: true },
  });
  if (!current || current.stateVersion !== input.fromVersion) return false;
  const from = internalValue[current.state];
  if (!from) return false;
  assertTransition(from, input.to);
  const where = input.leaseToken
    ? {
        id: input.jobId,
        state: current.state,
        stateVersion: input.fromVersion,
        leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: new Date() },
      }
    : { id: input.jobId, state: current.state, stateVersion: input.fromVersion };
  const result = await prisma.processingJob.updateMany({
    where,
    data: {
      state: stateValue[input.to] as never,
      stateVersion: { increment: 1 },
      ...(input.to === "cancel_requested" ? { cancelRequestedAt: new Date() } : {}),
      ...(input.to === "failed_retryable" ||
      input.to === "failed_terminal" ||
      input.to === "cancelled" ||
      input.to === "ready" ||
      input.to === "expired"
        ? { leaseToken: null, workerId: null, leaseExpiresAt: null, heartbeatAt: null }
        : {}),
    },
  });
  return result.count === 1;
}

export async function failAndScheduleRetry(input: {
  jobId: string;
  fromVersion: number;
  leaseToken: string;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const [changed] = await tx.processingJob.updateManyAndReturn({
      where: {
        id: input.jobId,
        state: "PROCESSING",
        stateVersion: input.fromVersion,
        leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: new Date() },
      },
      data: {
        state: "FAILED_RETRYABLE",
        stateVersion: { increment: 1 },
        leaseToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
      select: { attempt: true, stateVersion: true },
    });
    if (!changed) return false;
    await tx.outboxEvent.create({
      data: {
        id: eventId(input.jobId, "RETRY", changed.stateVersion),
        jobId: input.jobId,
        eventType: "RETRY",
        stateVersion: changed.stateVersion,
        payload: {
          jobId: input.jobId,
          retry: true,
          delayMs: retryBackoffMs(changed.attempt),
        },
      },
    });
    return true;
  });
}

export async function requestCancellation(input: {
  jobId: string;
  expectedVersion: number;
}): Promise<boolean> {
  const queued = await prisma.processingJob.updateMany({
    where: {
      id: input.jobId,
      stateVersion: input.expectedVersion,
      state: "QUEUED",
    },
    data: {
      state: "CANCELLED",
      cancelRequestedAt: new Date(),
      stateVersion: { increment: 1 },
    },
  });
  if (queued.count === 1) return true;
  const running = await prisma.processingJob.updateMany({
    where: {
      id: input.jobId,
      stateVersion: input.expectedVersion,
      state: { in: ["CLAIMED", "PROCESSING"] },
    },
    data: {
      state: "CANCEL_REQUESTED",
      cancelRequestedAt: new Date(),
      stateVersion: { increment: 1 },
    },
  });
  return running.count === 1;
}

export async function acceptQueueEvent(input: {
  eventId: string;
  jobId: string;
  expiresAt: Date;
}): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.consumerInbox.create({ data: input });
      await tx.jobStage.create({
        data: {
          jobId: input.jobId,
          name: "queue",
          inputDigest: input.eventId,
          state: "PROCESSING",
          startedAt: new Date(),
        },
      });
    });
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
      return false;
    throw error;
  }
}

export async function reserveModelCost(input: {
  jobId: string;
  stage: string;
  leaseToken: string;
  inputTokens: number;
  outputTokens: number;
  amountUsd: number;
}): Promise<boolean> {
  if (input.amountUsd <= 0 || !Number.isFinite(input.amountUsd)) throw new Error("INVALID_COST");
  return prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRaw(
      Prisma.sql`UPDATE "ProcessingJob" SET "reservedCostUsd" = "reservedCostUsd" + ${input.amountUsd} WHERE "id" = ${input.jobId} AND "leaseToken" = ${input.leaseToken} AND "state" = 'PROCESSING' AND "reservedCostUsd" + "usedCostUsd" + ${input.amountUsd} <= "maxCostUsd"`,
    );
    if (changed !== 1) return false;
    await tx.usageRecord.create({
      data: {
        jobId: input.jobId,
        stage: input.stage,
        leaseToken: input.leaseToken,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        reservedCostUsd: input.amountUsd,
        actualCostUsd: input.amountUsd,
      },
    });
    return true;
  });
}

export async function reconcileModelCost(input: {
  jobId: string;
  stage: string;
  leaseToken: string;
  reservedUsd: number;
  actualUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  if (input.actualUsd < 0 || input.actualUsd > input.reservedUsd) throw new Error("INVALID_COST");
  await prisma.$transaction(async (tx) => {
    const usage = await tx.usageRecord.findFirst({
      where: { jobId: input.jobId, stage: input.stage, leaseToken: input.leaseToken },
      orderBy: { createdAt: "desc" },
    });
    if (!usage) return;
    if (usage.reconciledAt) return;
    await tx.usageRecord.update({
      where: { id: usage.id },
      data: {
        actualCostUsd: input.actualUsd,
        reconciledAt: new Date(),
        ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
        ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
      },
    });
    await tx.$executeRaw(
      Prisma.sql`UPDATE "ProcessingJob" SET "reservedCostUsd" = GREATEST("reservedCostUsd" - ${input.reservedUsd}, 0), "usedCostUsd" = "usedCostUsd" + ${input.actualUsd} WHERE "id" = ${input.jobId} AND "leaseToken" = ${input.leaseToken}`,
    );
  });
}
