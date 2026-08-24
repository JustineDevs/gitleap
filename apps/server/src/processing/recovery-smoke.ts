import { randomUUID } from "node:crypto";

import prisma from "@gitleap/db";

import { recoverExpiredLeases } from "./repository";

const suffix = randomUUID().replaceAll("-", "");
const source = await prisma.sourceIdentity.create({
  data: {
    provider: "github",
    owner: `recovery-${suffix}`,
    repository: "fixture",
    commitSha: "a".repeat(40),
    pipelineVersion: "recovery-test",
    configurationHash: suffix,
  },
});
const job = await prisma.processingJob.create({
  data: {
    sourceIdentityId: source.id,
    state: "PROCESSING",
    stateVersion: 4,
    attempt: 1,
    workerId: "crashed-worker",
    leaseToken: "stale-lease",
    leaseExpiresAt: new Date(Date.now() - 60_000),
    heartbeatAt: new Date(Date.now() - 120_000),
  },
});

try {
  const recovered = await recoverExpiredLeases();
  const current = await prisma.processingJob.findUniqueOrThrow({
    where: { id: job.id },
    select: { state: true, stateVersion: true, leaseToken: true },
  });
  const recoveryEvent = await prisma.outboxEvent.findUnique({
    where: { id: `${job.id}:RECOVER:5` },
    select: { eventType: true, stateVersion: true },
  });
  if (
    recovered !== 1 ||
    current.state !== "QUEUED" ||
    current.stateVersion !== 5 ||
    current.leaseToken !== null ||
    recoveryEvent?.eventType !== "RECOVER" ||
    recoveryEvent.stateVersion !== 5
  )
    throw new Error("worker recovery invariant failed");
  console.log(
    JSON.stringify({ recovered, state: current.state, stateVersion: current.stateVersion }),
  );
} finally {
  await prisma.processingJob.delete({ where: { id: job.id } });
  await prisma.sourceIdentity.delete({ where: { id: source.id } });
  await prisma.$disconnect();
}
