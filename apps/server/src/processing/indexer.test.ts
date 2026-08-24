import { describe, expect, it } from "vitest";

import { buildArchitectureMap, inventory, semanticSlice } from "./indexer";
import { PROCESSING_LIMITS } from "./limits";

describe("static inventory", () => {
  it("is deterministic and excludes generated/vendor files", async () => {
    const input = async function* () {
      yield {
        path: "src/index.ts",
        bytes: new TextEncoder().encode('import { y } from "./dep";\nexport const x = y'),
      };
      yield { path: "node_modules/x.js", bytes: new Uint8Array([1]) };
    };
    const result = await inventory(input());
    expect(result.files.map((file) => file.path)).toEqual(["src/index.ts"]);
    expect(result.files[0]?.supported).toBe(true);
    expect(result.files[0]?.classification).toBe("source");
    expect(result.excluded).toEqual([
      {
        path: "node_modules/x.js",
        classification: "vendor",
        reason: "path matches the deterministic repository exclusion policy",
      },
    ]);
    expect(result.files[0]?.symbols).toEqual([
      { kind: "const", name: "x", startLine: 2, endLine: 2 },
    ]);
    expect(result.files[0]?.imports).toEqual(["./dep"]);
  });

  it("selects bounded, inspectable high-signal slices", () => {
    const files = [
      { path: "README.md", bytes: new TextEncoder().encode("readme") },
      { path: "src/index.ts", bytes: new TextEncoder().encode("export const value = 1") },
      { path: "notes.txt", bytes: new TextEncoder().encode("ignored") },
    ];
    const indexed: Parameters<typeof semanticSlice>[1] = [
      {
        path: "README.md",
        sizeBytes: 6,
        language: "markdown",
        digest: "a",
        supported: true,
        classification: "documentation",
        symbols: [],
        imports: [],
      },
      {
        path: "src/index.ts",
        sizeBytes: 21,
        language: "typescript",
        digest: "b",
        supported: true,
        classification: "source",
        symbols: [],
        imports: [],
      },
      {
        path: "notes.txt",
        sizeBytes: 6,
        language: "unknown",
        digest: "c",
        supported: false,
        classification: "unsupported",
        symbols: [],
        imports: [],
      },
    ];
    expect(semanticSlice(files, indexed, 1)).toEqual([
      {
        path: "README.md",
        language: "markdown",
        digest: "a",
        reason: "high-signal project or entrypoint file",
        content: "readme",
        symbols: [],
        imports: [],
      },
    ]);
  });

  it("records import targets and nested declaration ownership", async () => {
    const result = await inventory(
      (async function* () {
        yield {
          path: "src/nested.ts",
          bytes: new TextEncoder().encode(
            'import { helper } from "./helper";\nexport function outer() {\n  function inner() { return helper(); }\n  return inner();\n}',
          ),
        };
      })(),
    );
    expect(result.files[0]?.imports).toEqual(["./helper"]);
    expect(result.files[0]?.symbols).toContainEqual({
      kind: "function",
      name: "inner",
      startLine: 3,
      endLine: 4,
      parent: "outer",
    });
  });

  it("builds a deterministic architecture map with inspectable edges", async () => {
    const result = await inventory(
      (async function* () {
        yield {
          path: "src/index.ts",
          bytes: new TextEncoder().encode(
            'import { value } from "./value";\nexport const root = value',
          ),
        };
      })(),
    );
    expect(buildArchitectureMap(result.files)).toEqual({
      version: 1,
      parser: "v1-lexical",
      files: [
        {
          path: "src/index.ts",
          language: "typescript",
          classification: "source",
          symbols: [{ kind: "const", name: "root", startLine: 2, endLine: 2 }],
          imports: ["./value"],
        },
      ],
      edges: [{ from: "src/index.ts", to: "./value" }],
      excluded: [],
    });
  });

  it("marks unsupported files and keeps empty inventories deterministic", async () => {
    const unsupported = await inventory(
      (async function* () {
        yield { path: "notes.txt", bytes: new TextEncoder().encode("plain text") };
      })(),
    );
    expect(unsupported.files[0]).toMatchObject({
      language: "unknown",
      supported: false,
      classification: "unsupported",
    });
    expect(
      semanticSlice(
        [{ path: "notes.txt", bytes: new TextEncoder().encode("plain text") }],
        unsupported.files,
      ),
    ).toEqual([]);

    const empty = await inventory(
      (async function* () {
        yield* [] as Array<{ path: string; bytes: Uint8Array }>;
      })(),
    );
    const emptyAgain = await inventory(
      (async function* () {
        yield* [] as Array<{ path: string; bytes: Uint8Array }>;
      })(),
    );
    expect(empty.files).toEqual([]);
    expect(empty.excluded).toEqual([]);
    expect(empty.digest).toBe(emptyAgain.digest);
  });

  it("classifies tests and binaries while preserving exclusion reasons", async () => {
    const result = await inventory(
      (async function* () {
        yield { path: "src/value.test.ts", bytes: new TextEncoder().encode("export const x = 1") };
        yield { path: "config.json", bytes: new TextEncoder().encode("{}") };
        yield { path: "assets/image.bin", bytes: new Uint8Array([0, 1, 2]) };
        yield { path: "generated/types.ts", bytes: new TextEncoder().encode("export type X = 1") };
      })(),
    );
    expect(result.files.map((file) => [file.path, file.classification])).toEqual([
      ["config.json", "configuration"],
      ["src/value.test.ts", "test"],
    ]);
    expect(result.excluded.map(({ path, classification }) => [path, classification])).toEqual([
      ["assets/image.bin", "binary"],
      ["generated/types.ts", "generated"],
    ]);
    expect(
      semanticSlice(
        result.files.map(({ path }) => ({ path, bytes: new Uint8Array() })),
        result.files,
      ).map(({ path }) => path),
    ).toEqual(["config.json"]);
  });

  it("rejects per-file and aggregate file-count limits", async () => {
    await expect(
      inventory(
        (async function* () {
          yield {
            path: "large.txt",
            bytes: new TextEncoder().encode("x".repeat(PROCESSING_LIMITS.fileBytes + 1)),
          };
        })(),
      ),
    ).rejects.toThrow("SIZE_LIMIT");

    await expect(
      inventory(
        (async function* () {
          for (let index = 0; index <= PROCESSING_LIMITS.fileCount; index += 1)
            yield { path: `files/${index}.txt`, bytes: new Uint8Array() };
        })(),
      ),
    ).rejects.toThrow("SIZE_LIMIT");
  });
});
