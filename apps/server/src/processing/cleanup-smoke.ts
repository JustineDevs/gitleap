import "dotenv/config";

import prisma from "@gitleap/db";

import { cleanupExpiredArtifacts } from "./cleanup";
import { SupabaseStorage } from "./storage-supabase";

const suffix = crypto.randomUUID().replaceAll("-", "");
const storageUrl = "https://cleanup-storage.test";
const source = await prisma.sourceIdentity.create({
  data: {
    provider: "github",
    owner: `cleanup-${suffix}`,
    repository: "fixture",
    commitSha: "e".repeat(40),
    pipelineVersion: "cleanup-test",
    configurationHash: suffix,
  },
});
const job = await prisma.processingJob.create({
  data: {
    sourceIdentityId: source.id,
    state: "READY",
    stateVersion: 1,
    expiresAt: new Date(Date.now() - 1_000),
  },
});
const objectKey = `jobs/${job.id}/expired.tar.gz`;
await prisma.artifact.create({
  data: {
    jobId: job.id,
    objectKey,
    checksum: "cleanup-checksum",
    sizeBytes: 1,
    contentType: "application/gzip",
    provenance: { source: "cleanup-smoke" },
    availableAt: new Date(Date.now() - 2_000),
    expiresAt: new Date(Date.now() - 1_000),
  },
});

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  if (url.includes("/object/remove/")) return new Response(null, { status: 200 });
  if (url.includes("/object/list/")) return new Response("[]", { status: 200 });
  throw new Error(`Unexpected cleanup request: ${url}`);
}) as unknown as typeof fetch;

try {
  const result = await cleanupExpiredArtifacts(
    new SupabaseStorage({
      url: storageUrl,
      serviceRoleKey: "cleanup-service-role",
      bucket: "private",
    }),
  );
  const current = await prisma.processingJob.findUniqueOrThrow({
    where: { id: job.id },
    select: { state: true },
  });
  const artifact = await prisma.artifact.findUnique({ where: { objectKey } });
  const expiryAudit = await prisma.auditEvent.findFirst({
    where: { jobId: job.id, action: "job.expired" },
  });
  if (result.artifacts !== 1 || current.state !== "EXPIRED" || artifact || !expiryAudit)
    throw new Error("cleanup invariant failed");
  console.log(JSON.stringify({ expired: true, deleted: true, storageCleanup: true }));
} finally {
  globalThis.fetch = originalFetch;
  await prisma.processingJob.delete({ where: { id: job.id } });
  await prisma.sourceIdentity.delete({ where: { id: source.id } });
  await prisma.$disconnect();
}
