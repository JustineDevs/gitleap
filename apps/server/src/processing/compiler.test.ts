import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { compileSkillPack } from "./compiler";

const execFileAsync = promisify(execFile);

describe("skill compiler", () => {
  it("is deterministic and rejects secrets", () => {
    const candidate = {
      schemaVersion: 1 as const,
      id: "repo",
      name: "Repo",
      description: "desc",
      instructions: "do",
      triggers: ["when needed"],
      inputs: ["source"],
      outputs: ["guidance"],
      prerequisites: ["repository"],
      limitations: ["bounded"],
      validation: ["check evidence"],
      evidence: [{ path: "src/index.ts", reason: "entry point" }],
    };
    const first = compileSkillPack({
      candidates: [candidate],
      provenance: { commit: "a", configurationHash: "cfg" },
      architectureMap: { version: 1, parser: "v1-lexical", files: [], edges: [] },
    });
    const second = compileSkillPack({
      candidates: [candidate],
      provenance: { commit: "a", configurationHash: "cfg" },
      architectureMap: { version: 1, parser: "v1-lexical", files: [], edges: [] },
    });
    expect(first.checksum).toBe(second.checksum);
    expect(new TextDecoder().decode(gunzipSync(first.archive))).toContain(
      '"configurationHash": "cfg"',
    );
    const archive = new TextDecoder().decode(gunzipSync(first.archive));
    expect(archive).toContain("architecture-map.json");
    expect(archive).toContain("run-skill.sh");
    expect(archive).toContain("setup.sh");
    expect(archive).toContain(".agents/skills/repo/SKILL.md");
    expect(archive).toContain('metadata.id !== "repo"');
    expect(archive).toContain('"../../skills-manifest.json"');
    expect(archive).toContain(".agents/skills/repo/validation.test.ts");
    expect(archive).toContain("# Evidence References");
    expect(archive).toContain("# Usage Example");
    expect(archive).not.toContain("Generated skill package.");
    expect(() =>
      compileSkillPack({
        candidates: [{ ...candidate, instructions: "ghp_12345678901234567890" }],
        provenance: {},
      }),
    ).toThrow("SECRET_DETECTED");
    expect(() =>
      compileSkillPack({
        candidates: [{ ...candidate, id: "../escape" }],
        provenance: {},
      }),
    ).toThrow("POLICY_REJECTED");
  });

  it("emits an executable validation test for each skill layout", async () => {
    const candidate = {
      schemaVersion: 1 as const,
      id: "repo",
      name: "Repo",
      description: "desc",
      instructions: "do",
      triggers: ["when needed"],
      inputs: ["source"],
      outputs: ["guidance"],
      prerequisites: ["repository"],
      limitations: ["bounded"],
      validation: ["check evidence"],
      evidence: [{ path: "src/index.ts", reason: "entry point" }],
    };
    const directory = mkdtempSync(join(tmpdir(), "gitleap-pack-"));
    const archivePath = join(directory, "pack.tar.gz");
    try {
      const compiled = compileSkillPack({ candidates: [candidate], provenance: {} });
      writeFileSync(archivePath, compiled.archive);
      await execFileAsync("tar", ["-xzf", archivePath, "-C", directory]);
      const validation = await execFileAsync("bun", ["run", "skills/repo/validation.test.ts"], {
        cwd: directory,
      });
      expect(validation.stdout).toContain('"skill":"repo"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
