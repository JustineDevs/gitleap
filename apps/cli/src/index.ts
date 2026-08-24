#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fetchVerifiedArtifact, GitLeapClient } from "./client";
import { runInteractive } from "./interactive";
import { readSession, writeSession } from "./session";

process.on("uncaughtException", reportError);
process.on("unhandledRejection", reportError);

const args = Bun.argv.slice(2);
const command = args[0] ?? "ui";
const serverUrl = value("--server") ?? process.env.GITLEAP_SERVER_URL ?? "http://localhost:3000";
const client = new GitLeapClient({
  serverUrl,
  sessionCookie: process.env.GITLEAP_SESSION_COOKIE ?? readSession(),
});

if (command === "cli" || command === "ui" || command === "interactive") {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("The default GitLeap CLI UI requires an interactive terminal");
  await runInteractive(serverUrl);
  process.exit(0);
} else if (command === "help" || command === "--help" || command === "-h") {
  console.log(
    "GitLeap CLI\n\nCommands:\n  cli | ui                              open the interactive terminal console\n  login [--email EMAIL]                  authenticate and save a session\n  submit <github-url> --revision SHA     submit a repository\n  status <job-id>                        show processing status\n  cancel <job-id> --version N            cancel a queued/running job\n  download <job-id> [--output FILE]      download the authorized pack\n  run | pull <github-url> [--revision SHA] submit and wait for completion\n\nEnvironment:\n  GITLEAP_SERVER_URL       server URL (default: http://localhost:3000)\n  GITLEAP_EMAIL            login email\n  GITLEAP_PASSWORD         login password\n  GITLEAP_SESSION_COOKIE   override the stored session\n",
  );
  process.exit(0);
}

if (command === "login") {
  const email = value("--email") ?? process.env.GITLEAP_EMAIL;
  const password = process.env.GITLEAP_PASSWORD;
  if (!email || !password)
    throw new Error("Set GITLEAP_EMAIL and GITLEAP_PASSWORD, or pass --email");
  await client.signIn(email, password);
  if (client.cookie) writeSession(client.cookie);
  console.log("Authenticated.");
} else if (command === "submit") {
  const result = await client.submit({ url: required(1), revision: requiredValue("--revision") });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "status") {
  console.log(JSON.stringify(await client.status(required(1)), null, 2));
} else if (command === "cancel") {
  console.log(
    JSON.stringify(await client.cancel(required(1), Number(requiredValue("--version"))), null, 2),
  );
} else if (command === "download") {
  const jobId = required(1);
  const artifact = await client.download(jobId);
  const output = resolve(value("--output") ?? `${jobId}.tar.gz`);
  const body = await fetchVerifiedArtifact(artifact);
  mkdirSync(dirname(output), { recursive: true });
  await Bun.write(output, body);
  console.log(
    JSON.stringify({ output, checksum: artifact.checksum, expiresAt: artifact.expiresAt }, null, 2),
  );
} else if (command === "pull") {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("The pull pipeline requires an interactive terminal");
  const status = await runInteractive(serverUrl, {
    initialUrl: required(1),
    initialRevision: value("--revision") ?? "HEAD",
    autoSubmit: true,
    sessionCookie: process.env.GITLEAP_SESSION_COOKIE ?? readSession(),
  });
  if (status !== "ready") process.exitCode = 1;
} else if (command === "run") {
  const submitted = await client.submit({
    url: required(1),
    revision: value("--revision") ?? "HEAD",
  });
  let status = await client.status(submitted.jobId);
  while (!["ready", "failed", "cancelled", "expired"].includes(status.status)) {
    await Bun.sleep(1_000);
    status = await client.status(submitted.jobId);
    process.stdout.write(`\r${status.status} v${status.version}`);
  }
  console.log(`\n${JSON.stringify(status, null, 2)}`);
  if (status.status !== "ready") process.exitCode = 1;
} else {
  throw new Error(`Unknown command: ${command}`);
}

function value(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(index: number): string {
  const argument = args[index];
  if (!argument || argument.startsWith("--")) throw new Error("Missing required argument");
  return argument;
}

function requiredValue(flag: string): string {
  const result = value(flag);
  if (!result) throw new Error(`Missing ${flag}`);
  return result;
}

function reportError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
