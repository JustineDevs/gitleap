import "dotenv/config";

const modelUrl = "https://model.test/synthesize";
const storageUrl = "https://storage.test";
process.env.MODEL_API_URL = modelUrl;
process.env.MODEL_API_KEY = "smoke-key";
process.env.MODEL_NAME = "smoke-model";
process.env.SUPABASE_URL = storageUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = "smoke-service-role";
process.env.SUPABASE_STORAGE_BUCKET = "private";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.STRIPE_SECRET_KEY = "smoke-stripe";
process.env.STRIPE_WEBHOOK_SECRET = "smoke-webhook";
process.env.ARCJET_KEY = "smoke-arcjet";
const { default: prisma } = await import("@gitleap/db");
const { appRouter } = await import("@gitleap/api/routers/index");
const { processJob } = await import("./pipeline");
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  if (url === modelUrl) {
    const request = JSON.parse(String(init?.body ?? "{}")) as { input?: string };
    const evidenceLine = (request.input ?? "")
      .split("\n")
      .find((line) => line.startsWith("EVIDENCE_JSON="));
    const evidence = JSON.parse(evidenceLine?.slice("EVIDENCE_JSON=".length) ?? "[]") as Array<{
      path?: string;
    }>;
    const evidencePath = evidence[0]?.path ?? "README";
    return new Response(
      JSON.stringify({
        output: {
          schemaVersion: 1,
          id: "fixture-skill",
          name: "Fixture Skill",
          description: "Evidence-backed fixture skill.",
          instructions: "Use the fixture evidence.",
          triggers: ["When the fixture is used"],
          inputs: ["Fixture repository"],
          outputs: ["Validated guidance"],
          prerequisites: ["Access to fixture"],
          limitations: ["Synthetic smoke input"],
          validation: ["Check README.md"],
          evidence: [
            {
              path: evidencePath,
              reason: "public fixture documentation",
            },
          ],
        },
        usage: { input_tokens: 12, output_tokens: 8, cost_usd: 0.01 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url.startsWith(`${storageUrl}/storage/v1/object/sign/`)) {
    const signedURL = new URL(url).pathname.replace(/^\/storage\/v1/, "");
    return new Response(JSON.stringify({ signedURL }), { status: 200 });
  }
  if (url.startsWith(storageUrl)) return new Response(null, { status: 200 });
  if (url.startsWith("https://codeload.github.com/")) return originalFetch(input);
  throw new Error(`Unexpected smoke request: ${url}`);
}) as typeof fetch;

const suffix = crypto.randomUUID().replaceAll("-", "");
const user = await prisma.user.create({
  data: {
    id: `pipeline-smoke-${suffix}`,
    name: "Pipeline Smoke",
    email: `pipeline-${suffix}@example.test`,
  },
});
const caller = appRouter.createCaller({
  session: {
    user: { id: user.id, name: user.name, email: user.email, emailVerified: false },
    session: {
      id: `session-${suffix}`,
      userId: user.id,
      token: `token-${suffix}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  },
} as never);
const submitted = await caller.submitProcessing({
  url: "https://github.com/octocat/Hello-World",
  revision: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
  includeTests: true,
});
const jobId = submitted.jobId;
const sourceIdentity = await prisma.processingJob.findUniqueOrThrow({
  where: { id: jobId },
  select: { sourceIdentityId: true },
});

const source = await prisma.sourceIdentity.findUniqueOrThrow({
  where: { id: sourceIdentity.sourceIdentityId },
});

try {
  await processJob(jobId, "pipeline-smoke");
  const current = await prisma.processingJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { state: true, usedCostUsd: true, leaseToken: true, workerId: true },
  });
  const [artifact, usage] = await Promise.all([
    prisma.artifact.findFirst({ where: { jobId } }),
    prisma.usageRecord.findFirst({ where: { jobId, stage: "synthesis" } }),
  ]);
  if (
    current.state !== "READY" ||
    current.leaseToken !== null ||
    current.workerId !== null ||
    !artifact ||
    artifact.availableAt === null ||
    usage?.inputTokens !== 12 ||
    usage.outputTokens !== 8 ||
    !artifact.provenance ||
    (artifact.provenance as { configurationHash?: string }).configurationHash !==
      source.configurationHash ||
    (artifact.provenance as { parserVersion?: string }).parserVersion !== "v1-lexical"
  )
    throw new Error("pipeline smoke invariant failed");
  const status = await caller.getProcessingStatus({ jobId });
  const download = await caller.getArtifactDownload({ jobId });
  if (status.status !== "ready" || !download.url) throw new Error("API pipeline contract failed");
  console.log(
    JSON.stringify({
      state: current.state,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  await prisma.processingJob.delete({ where: { id: jobId } });
  await prisma.sourceIdentity.delete({ where: { id: source.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}
