import { createHash } from "node:crypto";

import { assertWithin, boundedSignal, PROCESSING_LIMITS, readBoundedText } from "./limits";

export type ModelContext = {
  jobId: string;
  stage: string;
  inputDigest: string;
  leaseToken: string;
  signal: AbortSignal;
  deadline: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
};
export type ModelUsage = { inputTokens: number; outputTokens: number; costUsd?: number };

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function estimateInputTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}

function requestTimeout(deadline: string): number {
  const remaining = Date.parse(deadline) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error("DEADLINE_EXCEEDED");
  return Math.min(remaining, 120_000);
}

export type SkillCandidate = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  instructions: string;
  triggers: string[];
  inputs: string[];
  outputs: string[];
  prerequisites: string[];
  limitations: string[];
  validation: string[];
  evidence: Array<{ path: string; startLine?: number; endLine?: number; reason: string }>;
};

export function validateCandidate(
  value: unknown,
  allowedPaths?: ReadonlySet<string>,
): SkillCandidate {
  if (!value || typeof value !== "object") throw new Error("INVALID_MODEL_OUTPUT");
  const candidate = value as Partial<SkillCandidate>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.description !== "string" ||
    typeof candidate.instructions !== "string" ||
    !Array.isArray(candidate.triggers) ||
    !Array.isArray(candidate.inputs) ||
    !Array.isArray(candidate.outputs) ||
    !Array.isArray(candidate.prerequisites) ||
    !Array.isArray(candidate.limitations) ||
    !Array.isArray(candidate.validation) ||
    !Array.isArray(candidate.evidence) ||
    candidate.evidence.length === 0 ||
    candidate.evidence.length > 100
  )
    throw new Error("INVALID_MODEL_OUTPUT");
  if (
    candidate.id.length > 128 ||
    candidate.name.length > 256 ||
    candidate.description.length > 4_000 ||
    candidate.instructions.length > 50_000
  )
    throw new Error("MODEL_OUTPUT_LIMIT");
  for (const values of [
    candidate.triggers,
    candidate.inputs,
    candidate.outputs,
    candidate.prerequisites,
    candidate.limitations,
    candidate.validation,
  ]) {
    if (values.some((value) => typeof value !== "string" || value.length > 1_000))
      throw new Error("MODEL_OUTPUT_LIMIT");
  }
  if (
    candidate.evidence.some(
      (item) =>
        !item ||
        typeof item.path !== "string" ||
        typeof item.reason !== "string" ||
        item.path.startsWith("/") ||
        item.path.split("/").includes("..") ||
        item.reason.length > 1_000 ||
        (item.startLine !== undefined &&
          (!Number.isInteger(item.startLine) || item.startLine < 1)) ||
        (item.endLine !== undefined &&
          (!Number.isInteger(item.endLine) || item.endLine < (item.startLine ?? 1))) ||
        (allowedPaths && !allowedPaths.has(item.path)),
    )
  )
    throw new Error("MISSING_EVIDENCE");
  return candidate as SkillCandidate;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(github_pat_|ghp_|gho_|ghu_|ghs_)[A-Za-z0-9_]+/g, "$1[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[REDACTED]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]")
    .replace(
      /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      "[REDACTED_PRIVATE_KEY]",
    );
}

export async function synthesizeSkill(input: {
  apiUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  context: ModelContext;
  allowedPaths?: ReadonlySet<string>;
}): Promise<{ candidate: SkillCandidate; usage: ModelUsage }> {
  const prompt = redactSecrets(input.prompt);
  if (estimateInputTokens(prompt) > input.context.maxInputTokens) throw new Error("TOKEN_LIMIT");
  const timeoutMs = requestTimeout(input.context.deadline);
  const response = await fetch(input.apiUrl, {
    method: "POST",
    signal: boundedSignal(input.context.signal, timeoutMs),
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": createHash("sha256")
        .update(`${input.context.jobId}:${input.context.stage}:${input.context.inputDigest}`)
        .digest("hex"),
    },
    body: JSON.stringify({
      model: input.model,
      input: prompt,
      max_input_tokens: input.context.maxInputTokens,
      max_output_tokens: Math.min(input.context.maxOutputTokens, PROCESSING_LIMITS.outputTokens),
    }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_FAILURE");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > MAX_RESPONSE_BYTES)
    throw new Error("MODEL_OUTPUT_LIMIT");
  const raw = await readBoundedText(response, MAX_RESPONSE_BYTES, "MODEL_OUTPUT_LIMIT");
  let body: {
    output?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number; cost_usd?: number };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    throw new Error("INVALID_MODEL_OUTPUT");
  }
  const usage = body.usage;
  if (!usage) throw new Error("MODEL_USAGE_MISSING");
  if (
    typeof usage.input_tokens !== "number" ||
    !Number.isInteger(usage.input_tokens) ||
    typeof usage.output_tokens !== "number" ||
    !Number.isInteger(usage.output_tokens) ||
    typeof usage.cost_usd !== "number"
  )
    throw new Error("MODEL_USAGE_INVALID");
  assertWithin(usage.input_tokens, input.context.maxInputTokens, "TOKEN_LIMIT");
  assertWithin(usage.output_tokens, input.context.maxOutputTokens, "TOKEN_LIMIT");
  assertWithin(usage.cost_usd, input.context.maxCostUsd, "COST_LIMIT");
  if (Date.parse(input.context.deadline) <= Date.now()) throw new Error("DEADLINE_EXCEEDED");
  return {
    candidate: validateCandidate(body.output, input.allowedPaths),
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: usage.cost_usd,
    },
  };
}
