import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["apps/server/src/processing", "packages/api/src", "apps/web/src"];
const forbidden = [
  /from\s+["']node:(?:child_process|vm)["']/,
  /require\(["'](?:node:child_process|node:vm)["']\)/,
  /\b(?:Bun\.)?(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
];

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/(?:\.test|\.spec|-smoke)\./.test(entry.name))
      files.push(path);
  }
  return files;
}

const violations: string[] = [];
for (const root of roots) {
  for (const file of await filesUnder(root)) {
    const source = await readFile(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
    }
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ roots, executionBoundaries: 0 }));
}
