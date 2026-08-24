import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSkillPrompt,
  repomixCommand,
  runCommand,
  skillCloneCommand,
  skillRemoteCommand,
  skillUpdateCommand,
} from "./index";

describe("OSS command adapters", () => {
  test("builds a non-shell Repomix command with sensitive-file exclusions", () => {
    expect(repomixCommand({ cwd: ".", style: "markdown", compress: true }, "/bin/repomix")).toEqual(
      [
        "/bin/repomix",
        "--output",
        "repomix-output.xml",
        "--style",
        "markdown",
        "--compress",
        "--ignore",
        ".env*,**/*.pem,**/*.key,**/*.p12,**/*.secret.*,.internal/**",
      ],
    );
  });

  test("uses fixed upstream skill repositories and fast-forward updates", () => {
    expect(skillCloneCommand("stop-slop", "/tmp/skills/stop-slop")).toEqual([
      "git",
      "clone",
      "--depth",
      "1",
      "https://github.com/hardikpandya/stop-slop.git",
      "/tmp/skills/stop-slop",
    ]);
    expect(skillUpdateCommand("/tmp/skills/humanizer-zh")).toEqual([
      "git",
      "-C",
      "/tmp/skills/humanizer-zh",
      "pull",
      "--ff-only",
    ]);
    expect(skillRemoteCommand("/tmp/skills/humanizer-zh")).toEqual([
      "git",
      "-C",
      "/tmp/skills/humanizer-zh",
      "remote",
      "get-url",
      "origin",
    ]);
  });

  test("merges caller ignores with mandatory sensitive-file exclusions", () => {
    expect(repomixCommand({ cwd: ".", ignore: ["dist/**", ".env*"] }, "repomix")).toEqual([
      "repomix",
      "--output",
      "repomix-output.xml",
      "--ignore",
      ".env*,**/*.pem,**/*.key,**/*.p12,**/*.secret.*,.internal/**,dist/**",
    ]);
  });

  test("builds prompts from the installed upstream skill definition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gitleap-skill-"));
    try {
      await Bun.write(join(directory, "SKILL.md"), "# Skill\nUse the source instructions.");
      await expect(
        buildSkillPrompt({ skillDirectory: directory, input: "Rewrite this." }),
      ).resolves.toContain("Rewrite this.");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("preserves command stderr in failures", async () => {
    await expect(
      runCommand(["bun", "-e", "console.error('diagnostic'); process.exit(3)"], "."),
    ).rejects.toThrow("diagnostic");
  });
});
