const positiveEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const PROCESSING_LIMITS = {
  compressedBytes: 256 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  fileCount: 50_000,
  fileBytes: 10 * 1024 * 1024,
  jobTimeoutMs: 15 * 60 * 1000,
  maxAttempts: 3,
  inputTokens: 100_000,
  outputTokens: 20_000,
  maxJobCostUsd: positiveEnv("PROCESSING_MAX_COST_USD", 2),
  maxCallCostUsd: positiveEnv("PROCESSING_MAX_CALL_COST_USD", 0.25),
} as const;

export function estimatedModelCost(
  inputTokens: number,
  outputTokens: number,
  inputUsdPer1k: number,
  outputUsdPer1k: number,
): number {
  return (inputTokens * inputUsdPer1k + outputTokens * outputUsdPer1k) / 1000;
}

export function assertWithin(value: number, max: number, code: string): void {
  if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(code);
}

export function boundedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function readBoundedText(
  response: Response,
  maxBytes: number,
  code: string,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel(code);
      throw new Error(code);
    }
    chunks.push(next.value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}
