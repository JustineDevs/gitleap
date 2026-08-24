import { createHash } from "node:crypto";

import { PROCESSING_LIMITS } from "./limits";

export type IndexedFile = {
  path: string;
  sizeBytes: number;
  language: string;
  digest: string;
  supported: boolean;
  classification: FileClassification;
  symbols: SymbolRecord[];
  imports: string[];
};
export type FileClassification =
  | "source"
  | "documentation"
  | "configuration"
  | "test"
  | "unsupported";
export type InventoryExclusion = {
  path: string;
  classification: "vendor" | "generated" | "binary";
  reason: string;
};
export type SourceFile = { path: string; bytes: Uint8Array };
export type ArchitectureMap = {
  version: 1;
  parser: "v1-lexical";
  files: Array<{
    path: string;
    language: string;
    classification: FileClassification;
    symbols: SymbolRecord[];
    imports: string[];
  }>;
  edges: Array<{ from: string; to: string }>;
  excluded: InventoryExclusion[];
};
export type SymbolRecord = {
  kind: "class" | "function" | "interface" | "type" | "const";
  name: string;
  startLine: number;
  endLine: number;
  parent?: string;
};

const ignored =
  /^(?:node_modules|\.git|dist|build|coverage|vendor)(?:\/|$)|(?:^|\/)(?:dist|build|coverage|vendor|generated)(?:\/|$)/;

function classify(path: string, language: string): FileClassification {
  const basename = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (/(^|\/)(test|tests|__tests__)(\/|$)/.test(path) || /\.(test|spec)\.[^.]+$/.test(basename))
    return "test";
  if (language === "markdown") return "documentation";
  if (
    /^(package|tsconfig|jsconfig|biome|turbo|vite|vitest|next|eslint|prettier|pnpm-lock|bun-lock)/.test(
      basename,
    ) ||
    /\.(json|ya?ml|toml|lock)$/.test(basename)
  )
    return "configuration";
  return language === "unknown" ? "unsupported" : "source";
}

function languageFor(path: string): string {
  if (path.split("/").at(-1)?.toLowerCase() === "readme") return "markdown";
  const extension = path.split(".").pop()?.toLowerCase();
  return extension === "ts" || extension === "tsx"
    ? "typescript"
    : extension === "js" || extension === "jsx"
      ? "javascript"
      : extension === "json"
        ? "json"
        : extension === "md" || extension === "mdx"
          ? "markdown"
          : "unknown";
}

function symbolsFor(language: string, bytes: Uint8Array): SymbolRecord[] {
  if (language !== "typescript" && language !== "javascript") return [];
  const source = new TextDecoder().decode(bytes);
  const lines = source.split("\n");
  const symbols: SymbolRecord[] = [];
  const declaration =
    /^(?:export\s+)?(?:async\s+)?(class|function|interface|type|const)\s+([A-Za-z_$][\w$]*)\b/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.trim().match(declaration);
    if (!match) continue;
    const kind = match[1] as SymbolRecord["kind"];
    const name = match[2] as string;
    if (kind === "interface" || kind === "type") {
      symbols.push({ kind, name, startLine: index + 1, endLine: index + 1 });
      continue;
    }
    let endLine = index + 1;
    let depth = 0;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      depth +=
        (lines[cursor]?.match(/{/g)?.length ?? 0) - (lines[cursor]?.match(/}/g)?.length ?? 0);
      if (depth <= 0 && cursor > index) {
        endLine = cursor + 1;
        break;
      }
      endLine = cursor + 1;
    }
    symbols.push({ kind, name, startLine: index + 1, endLine });
  }
  return symbols.map((symbol) => {
    const parent = symbols
      .filter(
        (candidate) =>
          candidate !== symbol &&
          candidate.startLine < symbol.startLine &&
          candidate.endLine >= symbol.endLine,
      )
      .sort(
        (a, b) => a.endLine - a.startLine - (b.endLine - b.startLine) || b.startLine - a.startLine,
      )[0];
    return parent ? { ...symbol, parent: parent.name } : symbol;
  });
}

function importsFor(language: string, bytes: Uint8Array): string[] {
  if (language !== "typescript" && language !== "javascript") return [];
  const source = new TextDecoder().decode(bytes);
  const imports = new Set<string>();
  for (const line of source.split("\n")) {
    const match = line.match(/(?:from|import|require\()\s*["']([^"']+)["']/);
    if (match?.[1]) imports.add(match[1]);
  }
  return [...imports].sort();
}

export async function inventory(
  files: AsyncIterable<{ path: string; bytes: Uint8Array }>,
): Promise<{ files: IndexedFile[]; excluded: InventoryExclusion[]; digest: string }> {
  const result: IndexedFile[] = [];
  const excluded: InventoryExclusion[] = [];
  let expanded = 0;
  for await (const file of files) {
    if (result.length >= PROCESSING_LIMITS.fileCount) throw new Error("SIZE_LIMIT");
    const path = file.path.replaceAll("\\", "/");
    if (!path || path.startsWith("/") || path.split("/").includes(".."))
      throw new Error("POLICY_REJECTED");
    if (ignored.test(path)) {
      excluded.push({
        path,
        classification: /(^|\/)(?:generated|dist|build|coverage)(\/|$)/.test(path)
          ? "generated"
          : "vendor",
        reason: "path matches the deterministic repository exclusion policy",
      });
      continue;
    }
    if (file.bytes.includes(0)) {
      excluded.push({
        path,
        classification: "binary",
        reason: "file contains NUL bytes and is treated as binary content",
      });
      continue;
    }
    if (file.bytes.byteLength > PROCESSING_LIMITS.fileBytes) throw new Error("SIZE_LIMIT");
    expanded += file.bytes.byteLength;
    if (expanded > PROCESSING_LIMITS.expandedBytes) throw new Error("SIZE_LIMIT");
    const language = languageFor(path);
    result.push({
      path,
      sizeBytes: file.bytes.byteLength,
      language,
      digest: createHash("sha256").update(file.bytes).digest("hex"),
      supported: language !== "unknown",
      classification: classify(path, language),
      symbols: symbolsFor(language, file.bytes),
      imports: importsFor(language, file.bytes),
    });
  }
  result.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files: result,
    excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)),
    digest: createHash("sha256").update(JSON.stringify({ result, excluded })).digest("hex"),
  };
}

export function buildArchitectureMap(
  files: IndexedFile[],
  excluded: InventoryExclusion[] = [],
): ArchitectureMap {
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: 1,
    parser: "v1-lexical",
    files: ordered.map(({ path, language, classification, symbols, imports }) => ({
      path,
      language,
      classification,
      symbols,
      imports,
    })),
    edges: ordered.flatMap((file) => file.imports.map((to) => ({ from: file.path, to }))),
    excluded: [...excluded].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export type SemanticSlice = {
  path: string;
  language: string;
  digest: string;
  reason: string;
  content: string;
  symbols: SymbolRecord[];
  imports: string[];
};

export function semanticSlice(
  files: SourceFile[],
  indexed: IndexedFile[],
  maxFiles = 20,
  maxBytes = 256 * 1024,
): SemanticSlice[] {
  const byPath = new Map(files.map((file) => [file.path.replaceAll("\\", "/"), file]));
  const ranked = indexed
    .filter((file) => file.supported && file.classification !== "test" && byPath.has(file.path))
    .map((file) => ({
      file,
      score: /(^|\/)README(?:\.md)?$/i.test(file.path)
        ? 100
        : /(^|\/)(package\.json|tsconfig\.json|src\/)/.test(file.path)
          ? 50
          : 10,
    }))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  const result: SemanticSlice[] = [];
  let usedBytes = 0;
  for (const { file, score } of ranked) {
    if (result.length >= maxFiles) break;
    const source = byPath.get(file.path);
    if (!source || usedBytes + source.bytes.byteLength > maxBytes) continue;
    usedBytes += source.bytes.byteLength;
    result.push({
      path: file.path,
      language: file.language,
      digest: file.digest,
      reason:
        score >= 50
          ? "high-signal project or entrypoint file"
          : "supported source file within slice budget",
      content: new TextDecoder().decode(source.bytes),
      symbols: file.symbols,
      imports: file.imports,
    });
  }
  return result;
}
