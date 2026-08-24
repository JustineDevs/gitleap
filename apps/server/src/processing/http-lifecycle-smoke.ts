import "dotenv/config";

import prisma from "@gitleap/db";
import { app } from "../index";
import { processJob } from "./pipeline";

const suffix = crypto.randomUUID().replaceAll("-", "");
const email = `http-${suffix}@example.test`;
const password = "smoke-password-123456";
const originalFetch = globalThis.fetch;
const storageUrl = process.env.SUPABASE_URL ?? "https://example.supabase.co";
await prisma.processingJob.deleteMany({
  where: { sourceIdentity: { owner: "octocat", repository: "hello-world" } },
});
await prisma.sourceIdentity.deleteMany({
  where: { owner: "octocat", repository: "hello-world" },
});
let jobId: string | undefined;

globalThis.fetch = (async (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  if (url.startsWith(`${storageUrl}/storage/v1/object/sign/`)) {
    const signedURL = new URL(url).pathname.replace(/^\/storage\/v1/, "");
    return new Response(JSON.stringify({ signedURL }), { status: 200 });
  }
  if (url.startsWith(storageUrl)) return new Response(null, { status: 200 });
  return originalFetch(input, init);
}) as typeof fetch;

try {
  const signup = await app.fetch(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ email, password, name: "HTTP Smoke" }),
    }),
  );
  if (!signup.ok) throw new Error(`HTTP signup failed: ${signup.status}`);
  const cookie = signup.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("HTTP auth cookie missing");

  const submit = await app.fetch(
    new Request("http://localhost/trpc/submitProcessing", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: "http://localhost:3000",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({
        url: "https://github.com/octocat/Hello-World",
        revision: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
        includeTests: true,
      }),
    }),
  );
  if (!submit.ok) throw new Error(`HTTP submit failed: ${submit.status} ${await submit.text()}`);
  jobId = readJobId(await submit.json());
  if (!jobId) throw new Error("HTTP submit returned no job");

  const cliSubmit = await app.fetch(
    new Request("http://localhost/trpc/submitProcessing", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-gitleap-client": "cli",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({
        url: "https://github.com/octocat/Hello-World",
        revision: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
        includeTests: true,
      }),
    }),
  );
  if (!cliSubmit.ok) throw new Error(`CLI-origin submit failed: ${cliSubmit.status}`);

  await processJob(jobId, "http-lifecycle-smoke");

  const status = await app.fetch(
    new Request(
      `http://localhost/trpc/getProcessingStatus?input=${encodeURIComponent(JSON.stringify({ jobId }))}`,
      {
        headers: { cookie, origin: "http://localhost:3000", "x-forwarded-for": "127.0.0.1" },
      },
    ),
  );
  const statusBody = await status.text();
  if (!status.ok || statusBody.includes('"status":"ready"') === false)
    throw new Error(`HTTP status did not expose ready state: ${statusBody}`);
  const download = await app.fetch(
    new Request(
      `http://localhost/trpc/getArtifactDownload?input=${encodeURIComponent(JSON.stringify({ jobId }))}`,
      {
        headers: { cookie, origin: "http://localhost:3000", "x-forwarded-for": "127.0.0.1" },
      },
    ),
  );
  if (!download.ok) throw new Error(`HTTP download failed: ${download.status}`);
  console.log(
    JSON.stringify({
      authenticated: true,
      submitted: true,
      worker: true,
      ready: true,
      download: true,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  if (jobId) {
    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
      select: { sourceIdentityId: true },
    });
    await prisma.processingJob.delete({ where: { id: jobId } });
    if (job) await prisma.sourceIdentity.delete({ where: { id: job.sourceIdentityId } });
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

function readJobId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  const result = root.result as Record<string, unknown> | undefined;
  const data = result?.data as Record<string, unknown> | undefined;
  const batch = root["0"] as Record<string, unknown> | undefined;
  const batchResult = batch?.result as Record<string, unknown> | undefined;
  const batchData = batchResult?.data as Record<string, unknown> | undefined;
  const direct = data?.jobId ?? (data?.json as Record<string, unknown> | undefined)?.jobId;
  const batched = (batchData?.json as Record<string, unknown> | undefined)?.jobId;
  return typeof direct === "string" ? direct : typeof batched === "string" ? batched : undefined;
}
