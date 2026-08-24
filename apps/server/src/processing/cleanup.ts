import prisma from "@gitleap/db";

import type { SupabaseStorage } from "./storage-supabase";

export async function cleanupExpiredArtifacts(
  storage: SupabaseStorage,
  now = new Date(),
): Promise<{ artifacts: number; inbox: number }> {
  const expired = await prisma.artifact.findMany({
    where: { expiresAt: { lte: now } },
    select: {
      id: true,
      jobId: true,
      objectKey: true,
      job: { select: { state: true, stateVersion: true } },
    },
  });
  let removed = 0;
  for (const artifact of expired) {
    try {
      const expiredJob = await prisma.processingJob.updateMany({
        where: {
          id: artifact.jobId,
          state: "READY",
          stateVersion: artifact.job.stateVersion,
          expiresAt: { lte: now },
        },
        data: { state: "EXPIRED", stateVersion: { increment: 1 } },
      });
      if (expiredJob.count === 0 && artifact.job.state !== "EXPIRED") continue;
      if (expiredJob.count) {
        await prisma.auditEvent.create({
          data: {
            jobId: artifact.jobId,
            action: "job.expired",
            metadata: { artifactId: artifact.id, reason: "retention" },
          },
        });
      }
      await storage.delete(artifact.objectKey);
      await prisma.artifact.delete({ where: { id: artifact.id } });
      removed++;
    } catch (error) {
      // Keep the database record when storage deletion fails; reconciliation retries it.
      console.error("artifact cleanup failed", {
        artifactId: artifact.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  const inbox = await prisma.consumerInbox.deleteMany({ where: { expiresAt: { lte: now } } });
  let orphans = 0;
  for (const object of await storage.list("jobs/")) {
    const createdAt = object.createdAt ? new Date(object.createdAt).getTime() : now.getTime();
    if (createdAt > now.getTime() - 60 * 60 * 1_000) continue;
    const referenced = await prisma.artifact.findFirst({
      where: { objectKey: object.name },
      select: { id: true },
    });
    if (!referenced) {
      await storage.delete(object.name);
      orphans++;
    }
  }
  return { artifacts: removed + orphans, inbox: inbox.count };
}
