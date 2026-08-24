import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CommandResult } from "./types";

export class OssToolError extends Error {
  constructor(
    message: string,
    readonly result?: CommandResult,
  ) {
    super(message);
    this.name = "OssToolError";
  }
}

export function resolveExecutable(command: string): string {
  const executable =
    Bun.which(command) ??
    [
      resolve(import.meta.dir, "../node_modules/.bin", command),
      resolve(import.meta.dir, "../../../node_modules/.bin", command),
    ].find((candidate) => existsSync(candidate));
  if (!executable) throw new OssToolError(`Required executable is not installed: ${command}`);
  return executable;
}

export async function runCommand(command: readonly string[], cwd: string): Promise<CommandResult> {
  if (command.length === 0) throw new OssToolError("Cannot execute an empty command");
  const process = Bun.spawn([...command], {
    cwd: resolve(cwd),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  const result = { command, exitCode, stdout, stderr } satisfies CommandResult;
  if (exitCode !== 0) {
    const details = stderr.trim();
    const suffix = details ? `: ${details.slice(0, 4_000)}` : "";
    throw new OssToolError(`Command failed with exit code ${exitCode}${suffix}`, result);
  }
  return result;
}
