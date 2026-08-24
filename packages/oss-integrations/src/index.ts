import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  repomixCommand,
  skillCloneCommand,
  skillRemoteCommand,
  skillUpdateCommand,
} from "./commands";
import { OssToolError, resolveExecutable, runCommand } from "./runner";
import {
  type CommandResult,
  OSS_SKILL_REPOSITORIES,
  type RepomixOptions,
  type SkillIntegration,
  type SkillPromptOptions,
} from "./types";

export * from "./commands";
export * from "./runner";
export * from "./types";

export async function runRepomix(options: RepomixOptions): Promise<CommandResult> {
  const command = repomixCommand(options, resolveExecutable("repomix"));
  return runCommand(command, options.cwd);
}

export async function installSkill(
  skill: SkillIntegration,
  targetDirectory: string,
): Promise<CommandResult> {
  const target = resolve(targetDirectory);
  await mkdir(resolve(target, ".."), { recursive: true });
  let repositoryExists = false;
  try {
    await access(join(target, ".git"));
    repositoryExists = true;
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
  if (!repositoryExists) return runCommand(skillCloneCommand(skill, target), resolve(target, ".."));

  const remote = await runCommand(skillRemoteCommand(target), target);
  if (normalizeRemote(remote.stdout) !== normalizeRemote(OSS_SKILL_REPOSITORIES[skill])) {
    throw new OssToolError(`Skill directory has an unexpected origin: ${target}`, remote);
  }
  return runCommand(skillUpdateCommand(target), target);
}

export async function buildSkillPrompt({
  skillDirectory,
  input,
}: SkillPromptOptions): Promise<string> {
  const skillPath = join(resolve(skillDirectory), "SKILL.md");
  const skill = await Bun.file(skillPath).text();
  if (!skill.trim()) throw new Error(`Skill definition is empty: ${skillPath}`);
  if (!input.trim()) throw new Error("Input text must not be empty");
  return [
    "Use the following installed skill instructions exactly:",
    "",
    skill,
    "",
    "--- INPUT TO PROCESS ---",
    input,
  ].join("\n");
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeRemote(value: string): string {
  return value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}
