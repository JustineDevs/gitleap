import { randomUUID } from "node:crypto";

import prisma from "@gitleap/db";

import { publishReadyArtifact, requestCancellation } from "./repository";

const suffix = randomUUID().replaceAll("-", "");

async function createFixture(label: string) {
  const source = await prisma.sourceIdentity.create({
    data: {
      provider: "github",
      owner: `race-${suffix}-${label}`,
      repository: "fixture",
      commitSha: "a".repeat(40),
      pipelineVersion: "race-test",
      configurationHash: `${suffix}-${label}`,
    },
  });
  const job = await prisma.processingJob.create({
    data: {
      sourceIdentityId: source.id,
      state: "PROCESSING",
      stateVersion: 1,
      leaseToken: `lease-${label}`,
      workerId: "race-worker",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  return { source, job };
}

async function publish(jobId: string, leaseToken: string, label: string): Promise<boolean> {
  try {
    await publishReadyArtifact({
      jobId,
      stateVersion: 1,
      leaseToken,
      objectKey: `jobs/${jobId}/${label}.tar.gz`,
      checksum: "b".repeat(64),
      sizeBytes: 1,
      contentType: "application/gzip",
      provenance: { test: true },
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_WORKER") return false;
    throw error;
  }
}

async function assertState(
  jobId: string,
  expected: "READY" | "CANCEL_REQUESTED",
  artifact: boolean,
) {
  const current = await prisma.processingJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { state: true },
  });
  const found = await prisma.artifact.findFirst({ where: { jobId }, select: { id: true } });
  if (current.state !== expected || Boolean(found) !== artifact)
    throw new Error(`publication race invariant failed: ${current.state}/${Boolean(found)}`);
}

const fixtures: Array<{ sourceId: string; jobId: string }> = [];
try {
  const cancelFirst = await createFixture("cancel-first");
  fixtures.push({ sourceId: cancelFirst.source.id, jobId: cancelFirst.job.id });
  if (!(await requestCancellation({ jobId: cancelFirst.job.id, expectedVersion: 1 })))
    throw new Error("cancel-first request was rejected");
  if (await publish(cancelFirst.job.id, "lease-cancel-first", "cancel-first"))
    throw new Error("publication succeeded after cancellation");
  await assertState(cancelFirst.job.id, "CANCEL_REQUESTED", false);

  const publishFirst = await createFixture("publish-first");
  fixtures.push({ sourceId: publishFirst.source.id, jobId: publishFirst.job.id });
  if (!(await publish(publishFirst.job.id, "lease-publish-first", "publish-first")))
    throw new Error("publish-first publication was rejected");
  if (await requestCancellation({ jobId: publishFirst.job.id, expectedVersion: 1 }))
    throw new Error("cancellation succeeded after publication");
  await assertState(publishFirst.job.id, "READY", true);

  const concurrent = await createFixture("concurrent");
  fixtures.push({ sourceId: concurrent.source.id, jobId: concurrent.job.id });
  const [published, cancelled] = await Promise.all([
    publish(concurrent.job.id, "lease-concurrent", "concurrent"),
    requestCancellation({ jobId: concurrent.job.id, expectedVersion: 1 }),
  ]);
  if (published === cancelled) throw new Error("race produced two successful state owners");
  await assertState(concurrent.job.id, published ? "READY" : "CANCEL_REQUESTED", published);
  console.log(
    JSON.stringify({ cancellationFirst: true, publicationFirst: true, concurrent: true }),
  );
} finally {
  for (const fixture of fixtures) {
    await prisma.processingJob.delete({ where: { id: fixture.jobId } });
    await prisma.sourceIdentity.delete({ where: { id: fixture.sourceId } });
  }
  await prisma.$disconnect();
}
