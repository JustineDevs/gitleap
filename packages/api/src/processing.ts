import prisma from "@gitleap/db";
import { env } from "@gitleap/env/server";

import { reserveSubmissionQuota } from "./quota";

const DETAIL_STAGES = ["queue", "index", "synthesis", "compile", "delivery"] as const;
const STAGE_LABELS: Record<(typeof DETAIL_STAGES)[number], string> = {
  queue: "ingest",
  index: "architecture",
  synthesis: "skills",
  compile: "compile",
  delivery: "delivery",
};

type DetailStage = {
  name: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
};

type DetailJob = {
  id: string;
  state: string;
  stateVersion: number;
  updatedAt: Date;
  expiresAt: Date | null;
  sourceIdentity: {
    provider: string;
    owner: string;
    repository: string;
    commitSha: string;
    pipelineVersion: string;
    configurationHash: string;
  };
  stages: Array<{
    name: string;
    state: string;
    output: unknown;
    startedAt: Date | null;
    finishedAt: Date | null;
    errorCode: string | null;
  }>;
};

export function projectProcessingDetails(job: DetailJob) {
  const byName = new Map(job.stages.map((stage) => [stage.name, stage]));
  const architecture = readArchitecture(byName.get("index")?.output);
  const candidate = readCandidate(byName.get("synthesis")?.output);
  const compiled = readManifest(byName.get("compile")?.output);
  const skills = candidate ? [skillMetadata(candidate)] : [];
  const stages: DetailStage[] = DETAIL_STAGES.map((name) => {
    const stage = byName.get(name);
    return {
      name: STAGE_LABELS[name],
      status: stage?.state.toLowerCase() ?? "pending",
      startedAt: stage?.startedAt ?? null,
      finishedAt: stage?.finishedAt ?? null,
      errorCode: stage?.errorCode ?? null,
    };
  });
  const completed = stages.filter((stage) => stage.status === "succeeded").length;
  const percent = job.state === "READY" ? 100 : Math.round((completed / stages.length) * 100);
  return {
    jobId: job.id,
    status: publicProcessingState(job.state),
    version: job.stateVersion,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    progress: { percent, completed, total: stages.length, stages },
    source: job.sourceIdentity,
    manifest: compiled ?? {
      version: 1,
      skills: skills.map(({ id, name, description, schemaVersion }) => ({
        id,
        name,
        description,
        schemaVersion,
      })),
    },
    skills,
    architectureMap: architecture,
    preview: {
      files: architecture.files.slice(0, 100),
      edges: architecture.edges.slice(0, 200),
      skills: skills.map(({ id, name, description, evidence }) => ({
        id,
        name,
        description,
        evidence,
      })),
    },
  };
}

export async function getAuthorizedProcessingDetails(input: {
  jobId: string;
  userId: string;
}): Promise<ReturnType<typeof projectProcessingDetails> | null> {
  const job = await prisma.processingJob.findFirst({
    where: { id: input.jobId, access: { some: { userId: input.userId, revokedAt: null } } },
    select: {
      id: true,
      state: true,
      stateVersion: true,
      updatedAt: true,
      expiresAt: true,
      sourceIdentity: {
        select: {
          provider: true,
          owner: true,
          repository: true,
          commitSha: true,
          pipelineVersion: true,
          configurationHash: true,
        },
      },
      stages: {
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          state: true,
          output: true,
          startedAt: true,
          finishedAt: true,
          errorCode: true,
        },
      },
    },
  });
  return job ? projectProcessingDetails(job) : null;
}

function readArchitecture(value: unknown): {
  version: 1;
  parser: string;
  files: unknown[];
  edges: unknown[];
  excluded: unknown[];
} {
  if (!value || typeof value !== "object")
    return { version: 1, parser: "v1-lexical", files: [], edges: [], excluded: [] };
  const record = value as Record<string, unknown>;
  return {
    version: 1,
    parser: typeof record.parser === "string" ? record.parser : "v1-lexical",
    files: Array.isArray(record.files) ? record.files : [],
    edges: Array.isArray(record.edges) ? record.edges : [],
    excluded: Array.isArray(record.excluded) ? record.excluded : [],
  };
}

function readCandidate(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function skillMetadata(candidate: Record<string, unknown>) {
  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    schemaVersion: candidate.schemaVersion,
    triggers: array(candidate.triggers),
    inputs: array(candidate.inputs),
    outputs: array(candidate.outputs),
    prerequisites: array(candidate.prerequisites),
    limitations: array(candidate.limitations),
    validation: array(candidate.validation),
    evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [],
  };
}

function readManifest(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const manifest = (value as Record<string, unknown>).manifest;
  return manifest && typeof manifest === "object" ? (manifest as Record<string, unknown>) : null;
}

function array(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

const ACTIVE_STATES = [
  "QUEUED",
  "CLAIMED",
  "PROCESSING",
  "FAILED_RETRYABLE",
  "CANCEL_REQUESTED",
] as const;

export const publicProcessingState = (state: string) =>
  state === "QUEUED" || state === "FAILED_RETRYABLE"
    ? "queued"
    : state === "CLAIMED" || state === "PROCESSING" || state === "CANCEL_REQUESTED"
      ? "running"
      : state === "FAILED_TERMINAL"
        ? "failed"
        : state.toLowerCase();

export async function createOrGetProcessingJob(input: {
  sourceIdentityId: string;
  userId: string;
}): Promise<{ job: { id: string; state: string }; reused: boolean }> {
  return prisma.$transaction(async (tx) => {
    const ready = await tx.processingJob.findFirst({
      where: {
        sourceIdentityId: input.sourceIdentityId,
        state: "READY",
        artifacts: { some: { availableAt: { not: null }, expiresAt: { gt: new Date() } } },
      },
      orderBy: { createdAt: "desc" },
    });
    if (ready) {
      await tx.jobAccess.upsert({
        where: { jobId_userId: { jobId: ready.id, userId: input.userId } },
        update: { revokedAt: null },
        create: { jobId: ready.id, userId: input.userId, role: "READER" },
      });
      await tx.auditEvent.create({
        data: {
          actorId: input.userId,
          jobId: ready.id,
          action: "job.access_granted",
          metadata: { role: "READER", reusedArtifact: true },
        },
      });
      return { job: ready, reused: true };
    }
    const active = await tx.processingJob.findFirst({
      where: { sourceIdentityId: input.sourceIdentityId, state: { in: [...ACTIVE_STATES] } },
      orderBy: { createdAt: "desc" },
    });
    const job =
      active ??
      (await (async () => {
        if (!(await reserveSubmissionQuota(input.userId, new Date(), 10, tx)))
          throw new Error("SUBMISSION_QUOTA_EXCEEDED");
        return tx.processingJob.create({
          data: {
            sourceIdentityId: input.sourceIdentityId,
            maxCostUsd: env.PROCESSING_MAX_COST_USD,
            access: { create: { userId: input.userId, role: "OWNER" } },
          },
        });
      })());
    if (active)
      await tx.jobAccess.upsert({
        where: { jobId_userId: { jobId: job.id, userId: input.userId } },
        update: { revokedAt: null },
        create: { jobId: job.id, userId: input.userId, role: "READER" },
      });
    if (!active)
      await tx.outboxEvent.create({
        data: {
          id: `${job.id}:SUBMIT:${job.stateVersion}`,
          jobId: job.id,
          eventType: "SUBMIT",
          stateVersion: job.stateVersion,
          payload: { jobId: job.id },
        },
      });
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
}

export async function getAuthorizedProcessingJob(input: {
  jobId: string;
  userId: string;
}): Promise<{
  id: string;
  state: string;
  stateVersion: number;
  updatedAt: Date;
  expiresAt: Date | null;
} | null> {
  return prisma.processingJob.findFirst({
    where: {
      id: input.jobId,
      access: { some: { userId: input.userId, revokedAt: null } },
    },
    select: { id: true, state: true, stateVersion: true, updatedAt: true, expiresAt: true },
  });
}

export async function cancelProcessingJob(input: {
  jobId: string;
  userId: string;
  expectedVersion: number;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const owner = await tx.jobAccess.findFirst({
      where: { jobId: input.jobId, userId: input.userId, role: "OWNER", revokedAt: null },
      select: { id: true },
    });
    if (!owner) return false;
    const now = new Date();
    const queued = await tx.processingJob.updateMany({
      where: { id: input.jobId, state: "QUEUED", stateVersion: input.expectedVersion },
      data: { state: "CANCELLED", stateVersion: { increment: 1 }, cancelRequestedAt: now },
    });
    if (queued.count) {
      await tx.auditEvent.create({
        data: {
          actorId: input.userId,
          jobId: input.jobId,
          action: "job.cancelled",
          metadata: { expectedVersion: input.expectedVersion, phase: "queued" },
        },
      });
      return true;
    }
    const running = await tx.processingJob.updateMany({
      where: {
        id: input.jobId,
        state: { in: ["CLAIMED", "PROCESSING"] },
        stateVersion: input.expectedVersion,
      },
      data: {
        state: "CANCEL_REQUESTED",
        cancelRequestedAt: now,
        stateVersion: { increment: 1 },
      },
    });
    if (running.count) {
      await tx.auditEvent.create({
        data: {
          actorId: input.userId,
          jobId: input.jobId,
          action: "job.cancel_requested",
          metadata: { expectedVersion: input.expectedVersion, phase: "running" },
        },
      });
    }
    return running.count === 1;
  });
}

export async function getAuthorizedArtifact(input: { jobId: string; userId: string }): Promise<{
  objectKey: string;
  checksum: string;
  expiresAt: Date;
} | null> {
  return prisma.artifact.findFirst({
    where: {
      jobId: input.jobId,
      availableAt: { not: null },
      expiresAt: { gt: new Date() },
      job: {
        state: "READY",
        expiresAt: { gt: new Date() },
        access: { some: { userId: input.userId, revokedAt: null } },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { objectKey: true, checksum: true, expiresAt: true },
  });
}
