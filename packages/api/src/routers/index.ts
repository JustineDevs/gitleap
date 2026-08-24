import { createHash } from "node:crypto";
import prisma, { Prisma } from "@gitleap/db";
import { env } from "@gitleap/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { resolveGithubRevision as resolveRevision } from "../github";
import { protectedProcedure, publicProcedure, router } from "../index";
import {
  cancelProcessingJob,
  createOrGetProcessingJob,
  getAuthorizedArtifact,
  getAuthorizedProcessingDetails,
  getAuthorizedProcessingJob,
  publicProcessingState,
} from "../processing";

const submitInput = z.object({
  url: z
    .url()
    .refine((value) => new URL(value).hostname === "github.com", "Only public GitHub is supported"),
  revision: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._/-]+$/),
  includeTests: z.boolean().default(true),
});

export function safeSignedPath(value: string, expectedPath: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  }
  let parsed: URL;
  try {
    parsed = new URL(value, "https://storage.invalid");
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  }
  let parsedPath: string;
  let expectedDecoded: string;
  try {
    parsedPath = decodeURIComponent(parsed.pathname);
    expectedDecoded = decodeURIComponent(expectedPath);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  }
  if (
    !value.startsWith("/") ||
    !parsed.pathname.startsWith("/object/sign/") ||
    decoded.includes("..")
  )
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  if (parsedPath !== expectedDecoded)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  return value;
}

function signedObjectPath(bucket: string, objectKey: string): string {
  const segments = objectKey.split("/");
  if (
    !objectKey ||
    objectKey.startsWith("/") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  )
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  return `/object/sign/${encodeURIComponent(bucket)}/${segments.map(encodeURIComponent).join("/")}`;
}

async function readSigningResponse(response: Response): Promise<string> {
  if (!response.body)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > 64 * 1024) {
      await reader.cancel("SIGNING_RESPONSE_TOO_LARGE");
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function resolveCommitSha(
  owner: string,
  repository: string,
  revision: string,
): Promise<string> {
  if (/^[a-f0-9]{40}$/i.test(revision)) return revision.toLowerCase();
  try {
    return await resolveRevision({ owner, repository, revision });
  } catch (error) {
    if (error instanceof Error && error.message === "GITHUB_RATE_LIMITED")
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "GitHub rate limit exceeded" });
    if (error instanceof Error && error.message === "GITHUB_UPSTREAM_FAILURE")
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "GitHub is temporarily unavailable",
      });
    if (error instanceof Error && error.message === "GITHUB_REVISION_NOT_FOUND")
      throw new TRPCError({ code: "BAD_REQUEST", message: "GitHub revision not found" });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "GitHub is temporarily unavailable",
    });
  }
}

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  submitProcessing: protectedProcedure.input(submitInput).mutation(async ({ input, ctx }) => {
    const parsed = new URL(input.url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      parts.length !== 2 ||
      parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part)) ||
      !/^[A-Za-z0-9._/-]+$/.test(input.revision)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A canonical HTTPS GitHub URL and 40-character commit SHA are required",
      });
    const [owner, rawRepository] = parts as [string, string];
    const repository = rawRepository.replace(/\.git$/i, "").toLowerCase();
    const commitSha = await resolveCommitSha(owner, repository, input.revision);
    const configurationHash = createHash("sha256")
      .update(
        JSON.stringify({
          includeTests: input.includeTests,
          parserSet: "v1-lexical",
          skillLimit: 10,
        }),
      )
      .digest("hex");
    const identity = await prisma.sourceIdentity.upsert({
      where: {
        provider_owner_repository_commitSha_pipelineVersion_configurationHash: {
          provider: "github",
          owner: owner.toLowerCase(),
          repository,
          commitSha,
          pipelineVersion: "v1",
          configurationHash,
        },
      },
      create: {
        provider: "github",
        owner: owner.toLowerCase(),
        repository,
        commitSha,
        pipelineVersion: "v1",
        configurationHash,
      },
      update: {},
    });
    let result: { job: { id: string; state: string }; reused: boolean };
    try {
      result = await createOrGetProcessingJob({
        sourceIdentityId: identity.id,
        userId: ctx.session.user.id,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_QUOTA_EXCEEDED")
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Submission rate limit exceeded",
        });
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
        throw error;
      const existing = await prisma.processingJob.findFirst({
        where: {
          sourceIdentityId: identity.id,
          state: {
            in: ["QUEUED", "CLAIMED", "PROCESSING", "FAILED_RETRYABLE", "CANCEL_REQUESTED"],
          },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!existing) throw error;
      await prisma.$transaction(async (tx) => {
        await tx.jobAccess.upsert({
          where: { jobId_userId: { jobId: existing.id, userId: ctx.session.user.id } },
          update: { revokedAt: null },
          create: { jobId: existing.id, userId: ctx.session.user.id, role: "READER" },
        });
        await tx.auditEvent.create({
          data: {
            actorId: ctx.session.user.id,
            jobId: existing.id,
            action: "job.access_granted",
            metadata: { role: "READER", reusedAfterUniqueRace: true },
          },
        });
      });
      result = { job: existing, reused: true };
    }
    return {
      jobId: result.job.id,
      status: publicProcessingState(result.job.state),
      reused: result.reused,
    };
  }),
  getProcessingStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const job = await getAuthorizedProcessingJob({
        jobId: input.jobId,
        userId: ctx.session.user.id,
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Processing job not found" });
      return {
        jobId: job.id,
        status: publicProcessingState(job.state),
        version: job.stateVersion,
        updatedAt: job.updatedAt,
        expiresAt: job.expiresAt,
      };
    }),
  getProcessingDetails: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const details = await getAuthorizedProcessingDetails({
        jobId: input.jobId,
        userId: ctx.session.user.id,
      });
      if (!details) throw new TRPCError({ code: "NOT_FOUND", message: "Processing job not found" });
      return details;
    }),
  cancelProcessing: protectedProcedure
    .input(z.object({ jobId: z.string().min(1), expectedVersion: z.number().int().nonnegative() }))
    .mutation(async ({ input, ctx }) => {
      const accepted = await cancelProcessingJob({
        jobId: input.jobId,
        userId: ctx.session.user.id,
        expectedVersion: input.expectedVersion,
      });
      if (!accepted)
        throw new TRPCError({ code: "NOT_FOUND", message: "Processing job not found" });
      return { accepted };
    }),
  getArtifactDownload: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const artifact = await getAuthorizedArtifact({
        jobId: input.jobId,
        userId: ctx.session.user.id,
      });
      if (!artifact)
        throw new TRPCError({ code: "NOT_FOUND", message: "Artifact not found or expired" });
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Artifact storage is not configured",
        });
      const expectedPath = signedObjectPath(env.SUPABASE_STORAGE_BUCKET, artifact.objectKey);
      const now = Date.now();
      const expiresIn = Math.min(
        900,
        Math.max(1, Math.ceil((artifact.expiresAt.getTime() - now) / 1_000)),
      );
      const response = await fetch(
        `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1${expectedPath}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({ expiresIn }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
      let body: { signedURL?: string };
      try {
        body = JSON.parse(await readSigningResponse(response)) as { signedURL?: string };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
      }
      if (!body.signedURL)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Artifact signing failed" });
      safeSignedPath(body.signedURL, expectedPath);
      await prisma.auditEvent.create({
        data: {
          actorId: ctx.session.user.id,
          jobId: input.jobId,
          action: "artifact.download_url_issued",
          metadata: { expiresAt: artifact.expiresAt.toISOString() },
        },
      });
      return {
        url: `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1${body.signedURL}`,
        expiresAt: new Date(
          Math.min(artifact.expiresAt.getTime(), now + expiresIn * 1_000),
        ).toISOString(),
        checksum: artifact.checksum,
      };
    }),
});
export type AppRouter = typeof appRouter;
