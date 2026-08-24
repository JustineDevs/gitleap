import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import type { SkillCandidate } from "./model";

function safePath(value: string): string {
  const path = value.replaceAll("\\", "/");
  const parts = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.length > 64 ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    throw new Error("POLICY_REJECTED");
  return path;
}

function tarEntry(path: string, content: string, mode = "0000644"): Uint8Array {
  const data = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  header.write(`${mode}\0`, 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header[156] = 48;
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.fill(32, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return new Uint8Array(Buffer.concat([header, padded]));
}

const RUN_SKILL = `#!/usr/bin/env bash
set -euo pipefail

skill_id="\${1:-repository-overview}"
skill_file=".agents/skills/$skill_id/SKILL.md"
if [[ ! -f "$skill_file" ]]; then
  skill_file="skills/$skill_id/SKILL.md"
fi
if [[ ! -f "$skill_file" ]]; then
  printf 'Unknown skill: %s\\n' "$skill_id" >&2
  exit 2
fi
cat "$skill_file"
`;

const SETUP = `#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
pack_root="$script_dir"
if [[ "$(basename -- "$script_dir")" == ".agents" ]]; then
  pack_root="$(cd -- "$script_dir/.." && pwd)"
fi
manifest="$pack_root/.agents/skills-manifest.json"
if [[ ! -s "$manifest" ]]; then
  printf 'Missing skills manifest: %s\\n' "$manifest" >&2
  exit 1
fi
if [[ ! -x "$pack_root/run-skill.sh" ]]; then
  chmod +x "$pack_root/run-skill.sh"
fi
printf 'GitLeap skill pack is ready.\\n'
printf 'Run: %s/run-skill.sh <skill-id>\\n' "$pack_root"
`;

function validationTest(id: string): string {
  return `import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const metadata = JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8")) as {
  id?: unknown;
  evidence?: unknown;
};
const manifest = JSON.parse(
  readFileSync(join(directory, "../../skills-manifest.json"), "utf8"),
) as { skills?: Array<{ id?: unknown }> };
const skill = readFileSync(join(directory, "SKILL.md"), "utf8").trim();

if (metadata.id !== ${JSON.stringify(id)}) throw new Error("skill metadata id mismatch");
if (!skill) throw new Error("skill instructions are empty");
if (!Array.isArray(metadata.evidence) || metadata.evidence.length === 0)
  throw new Error("skill evidence is missing");
if (!manifest.skills?.some((entry) => entry.id === metadata.id))
  throw new Error("skill is missing from the manifest");

console.log(JSON.stringify({ skill: metadata.id, evidence: metadata.evidence.length }));
`;
}

function assertNoSecrets(value: string): void {
  if (
    /(github_pat_|ghp_|gho_|ghu_|ghs_|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]+ PRIVATE KEY-----)/.test(
      value,
    )
  )
    throw new Error("SECRET_DETECTED");
}

export function compileSkillPack(input: {
  candidates: SkillCandidate[];
  provenance: Record<string, unknown>;
  architectureMap?: Record<string, unknown>;
}): { archive: Uint8Array; checksum: string; manifest: string } {
  const manifest = `${JSON.stringify(
    {
      version: 1,
      skills: input.candidates.map(({ id, name, description, schemaVersion }) => ({
        id,
        name,
        description,
        schemaVersion,
      })),
    },
    null,
    2,
  )}\n`;
  const provenance = `${JSON.stringify(input.provenance, null, 2)}\n`;
  const architectureMap = `${JSON.stringify(input.architectureMap ?? { version: 1, files: [], edges: [] }, null, 2)}\n`;
  assertNoSecrets(manifest);
  assertNoSecrets(provenance);
  assertNoSecrets(architectureMap);
  const entries: Uint8Array[] = [
    tarEntry(
      "README.md",
      "# GitLeap Skill Pack\n\nThis archive contains generated, evidence-backed skills.\n",
    ),
    tarEntry("skills-manifest.json", manifest),
    tarEntry("provenance.json", provenance),
    tarEntry("architecture-map.json", architectureMap),
    tarEntry("run-skill.sh", RUN_SKILL, "0000755"),
    tarEntry("setup.sh", SETUP, "0000755"),
    tarEntry(".agents/skills-manifest.json", manifest),
    tarEntry(".agents/setup.sh", SETUP, "0000755"),
  ];
  for (const candidate of [...input.candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    const id = safePath(candidate.id);
    const skill = `# ${candidate.name}\n\n${candidate.description}\n\n${candidate.instructions}\n`;
    assertNoSecrets(skill);
    entries.push(tarEntry(`skills/${id}/SKILL.md`, skill));
    entries.push(tarEntry(`.agents/skills/${id}/SKILL.md`, skill));
    const metadata = `${JSON.stringify(
      {
        id,
        triggers: candidate.triggers,
        inputs: candidate.inputs,
        outputs: candidate.outputs,
        prerequisites: candidate.prerequisites,
        limitations: candidate.limitations,
        validation: candidate.validation,
        evidence: candidate.evidence,
      },
      null,
      2,
    )}\n`;
    assertNoSecrets(metadata);
    const skillReadme = `# ${candidate.name}

${candidate.description}

## Inputs

${candidate.inputs.map((value) => `- ${value}`).join("\n")}

## Outputs

${candidate.outputs.map((value) => `- ${value}`).join("\n")}

## Validation

${candidate.validation.map((value) => `- ${value}`).join("\n")}
`;
    const referencesReadme = `# Evidence References

${candidate.evidence.map(({ path, reason }) => `- \`${path}\`: ${reason}`).join("\n")}
`;
    const examplesReadme = `# Usage Example

Provide the documented inputs to the skill and follow its instructions. The
expected outputs are:

${candidate.outputs.map((value) => `- ${value}`).join("\n")}

Verify the result using the checks listed in the skill validation section.
`;
    assertNoSecrets(skillReadme);
    assertNoSecrets(referencesReadme);
    assertNoSecrets(examplesReadme);
    entries.push(tarEntry(`skills/${id}/README.md`, skillReadme));
    entries.push(tarEntry(`skills/${id}/references/README.md`, referencesReadme));
    entries.push(tarEntry(`.agents/skills/${id}/references/README.md`, referencesReadme));
    entries.push(tarEntry(`skills/${id}/examples/README.md`, examplesReadme));
    entries.push(tarEntry(`.agents/skills/${id}/examples/README.md`, examplesReadme));
    entries.push(tarEntry(`skills/${id}/metadata.json`, metadata));
    entries.push(tarEntry(`.agents/skills/${id}/metadata.json`, metadata));
    const validation = validationTest(id);
    entries.push(tarEntry(`skills/${id}/validation.test.ts`, validation));
    entries.push(tarEntry(`.agents/skills/${id}/validation.test.ts`, validation));
  }
  const raw = Buffer.concat([...entries.map((entry) => Buffer.from(entry)), Buffer.alloc(1024)]);
  const archive = new Uint8Array(gzipSync(raw));
  return { archive, checksum: createHash("sha256").update(archive).digest("hex"), manifest };
}
