import "dotenv/config";

import { appRouter } from "@gitleap/api/routers/index";
import prisma from "@gitleap/db";

const userId = `processing-smoke-${crypto.randomUUID()}`;
const email = `${userId}@example.test`;
const user = await prisma.user.create({
  data: { id: userId, name: "Processing Smoke", email },
});
const otherUser = await prisma.user.create({
  data: {
    id: `${userId}-other`,
    name: "Other Smoke",
    email: `other-${email}`,
  },
});
const session = {
  user: { id: user.id, name: user.name, email: user.email, emailVerified: false },
  session: {
    id: `session-${crypto.randomUUID()}`,
    userId: user.id,
    token: `token-${crypto.randomUUID()}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
  },
};
const caller = appRouter.createCaller({ session } as never);
const otherCaller = appRouter.createCaller({
  session: { ...session, user: { ...session.user, id: otherUser.id, email: otherUser.email } },
} as never);
const objectKey = `jobs/${userId}.tar.gz`;
const jobIds: string[] = [];
let jobId: string | undefined;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ signedURL: `/object/sign/private/${objectKey}` }), {
    status: 200,
  })) as unknown as typeof fetch;

try {
  const quotaBefore = await prisma.submissionQuota.count({ where: { userId: user.id } });
  await expectRejected(() =>
    caller.submitProcessing({
      url: "https://github.com/octocat/Hello-World",
      revision: "not-a-real-revision",
      includeTests: true,
    }),
  );
  const quotaAfter = await prisma.submissionQuota.count({ where: { userId: user.id } });
  if (quotaAfter !== quotaBefore) throw new Error("invalid submission consumed quota");
  const submitted = await caller.submitProcessing({
    url: "https://github.com/octocat/Hello-World",
    revision: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
    includeTests: true,
  });
  jobId = submitted.jobId;
  jobIds.push(jobId);
  const queued = await caller.getProcessingStatus({ jobId: submitted.jobId });
  if (queued.status !== "queued") throw new Error(`Expected queued, got ${queued.status}`);

  const cancelled = await caller.submitProcessing({
    url: "https://github.com/octocat/Hello-World",
    revision: "dddddddddddddddddddddddddddddddddddddddd",
    includeTests: true,
  });
  jobIds.push(cancelled.jobId);
  const cancellation = await caller.cancelProcessing({
    jobId: cancelled.jobId,
    expectedVersion: 0,
  });
  if (!cancellation.accepted) throw new Error("Queued cancellation was not accepted");
  const cancelledStatus = await caller.getProcessingStatus({ jobId: cancelled.jobId });
  if (cancelledStatus.status !== "cancelled") throw new Error("Cancellation was not terminal");
  const cancellationAudit = await prisma.auditEvent.findFirst({
    where: { jobId: cancelled.jobId, action: "job.cancelled", actorId: user.id },
  });
  if (!cancellationAudit) throw new Error("Cancellation audit event was not recorded");

  const readyAt = new Date();
  const expiresAt = new Date(readyAt.getTime() + 60_000);
  await prisma.$transaction(async (tx) => {
    await tx.artifact.create({
      data: {
        jobId: submitted.jobId,
        objectKey,
        checksum: "smoke-checksum",
        sizeBytes: 10,
        contentType: "application/gzip",
        provenance: {
          provider: "github",
          owner: "octocat",
          repository: "Hello-World",
          commit: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
          pipelineVersion: "v1",
          inventoryDigest: "smoke-inventory",
          parserVersion: "v1-lexical",
          compilerVersion: "v1",
          validation: "schema-evidence-secret-archive",
        },
        availableAt: readyAt,
        expiresAt,
      },
    });
    await tx.processingJob.update({
      where: { id: submitted.jobId },
      data: { state: "READY", stateVersion: { increment: 1 }, expiresAt },
    });
  });
  const ready = await caller.getProcessingStatus({ jobId: submitted.jobId });
  if (ready.status !== "ready") throw new Error(`Expected ready, got ${ready.status}`);
  const download = await caller.getArtifactDownload({ jobId: submitted.jobId });
  if (
    !download.url ||
    download.checksum !== "smoke-checksum" ||
    new Date(download.expiresAt).getTime() > expiresAt.getTime()
  )
    throw new Error("Authorized download contract failed");
  const downloadAudit = await prisma.auditEvent.findFirst({
    where: { jobId: submitted.jobId, action: "artifact.download_url_issued", actorId: user.id },
  });
  if (!downloadAudit) throw new Error("Download audit event was not recorded");
  await expectRejected(() => otherCaller.getArtifactDownload({ jobId: submitted.jobId }));
  const reused = await otherCaller.submitProcessing({
    url: "https://github.com/octocat/Hello-World",
    revision: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
    includeTests: true,
  });
  if (reused.jobId !== submitted.jobId || !reused.reused)
    throw new Error("Completed artifact reuse contract failed");
  const sharedDownload = await otherCaller.getArtifactDownload({ jobId: submitted.jobId });
  if (!sharedDownload.url) throw new Error("Reader access contract failed");

  await prisma.processingJob.update({
    where: { id: submitted.jobId },
    data: { state: "EXPIRED", stateVersion: { increment: 1 }, expiresAt: new Date(Date.now() - 1) },
  });
  const expired = await caller.getProcessingStatus({ jobId: submitted.jobId });
  if (expired.status !== "expired") throw new Error(`Expected expired, got ${expired.status}`);
  await expectRejected(() => caller.getArtifactDownload({ jobId: submitted.jobId }));
  console.log(JSON.stringify({ submitted: true, queued: true, ready: true, expired: true }));
} finally {
  globalThis.fetch = originalFetch;
  const sourceIdentities = await prisma.processingJob.findMany({
    where: { id: { in: jobIds } },
    select: { sourceIdentityId: true },
  });
  const sourceIdentityIds = sourceIdentities.map(({ sourceIdentityId }) => sourceIdentityId);
  await prisma.processingJob.deleteMany({
    where: { sourceIdentityId: { in: sourceIdentityIds } },
  });
  await prisma.artifact.deleteMany({ where: { objectKey } });
  await prisma.sourceIdentity.deleteMany({
    where: { id: { in: sourceIdentityIds } },
  });
  await prisma.user.delete({ where: { id: otherUser.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

async function expectRejected(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error("Expected artifact access to be rejected after expiry");
}
