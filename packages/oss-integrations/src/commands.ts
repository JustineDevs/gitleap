import { OSS_SKILL_REPOSITORIES, type RepomixOptions, type SkillIntegration } from "./types";

const DEFAULT_IGNORES = [
  ".env*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.secret.*",
  ".internal/**",
] as const;

export function repomixCommand(options: RepomixOptions, executable = "repomix"): string[] {
  const command = [executable, "--output", options.output ?? "repomix-output.xml"];
  if (options.style) command.push("--style", options.style);
  if (options.compress) command.push("--compress");
  const ignores = [...new Set([...DEFAULT_IGNORES, ...(options.ignore ?? [])])];
  if (ignores.length > 0) command.push("--ignore", ignores.join(","));
  return command;
}

export function skillCloneCommand(skill: SkillIntegration, targetDirectory: string): string[] {
  return ["git", "clone", "--depth", "1", OSS_SKILL_REPOSITORIES[skill], targetDirectory];
}

export function skillUpdateCommand(targetDirectory: string): string[] {
  return ["git", "-C", targetDirectory, "pull", "--ff-only"];
}

export function skillRemoteCommand(targetDirectory: string): string[] {
  return ["git", "-C", targetDirectory, "remote", "get-url", "origin"];
}
