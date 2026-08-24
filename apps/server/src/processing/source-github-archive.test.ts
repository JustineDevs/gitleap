import { describe, expect, it } from "vitest";

import { readTarArchive } from "./source-github";

describe("archive safety", () => {
  it("rejects truncated non-tar input without executing anything", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("not a tar"));
        controller.close();
      },
    });
    await expect(readTarArchive(stream)).rejects.toThrow("UPSTREAM_FAILURE");
  });

  it("returns every regular file from a multi-file archive", async () => {
    const entry = (path: string, content: string, type = 48) => {
      const body = Buffer.from(content);
      const header = Buffer.alloc(512);
      header.write(path, 0, 100, "utf8");
      header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
      header[156] = type;
      header.fill(32, 148, 156);
      header.write(
        `${header
          .reduce((sum, byte) => sum + byte, 0)
          .toString(8)
          .padStart(6, "0")}\0 `,
        148,
        8,
        "ascii",
      );
      const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
      body.copy(padded);
      return Buffer.concat([header, padded]);
    };
    const bytes = Buffer.concat([
      entry("repo-main/", "", 53),
      entry("repo-main/a.txt", "a"),
      entry("repo-main/b.txt", "b"),
      Buffer.alloc(1024),
    ]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    });
    await expect(readTarArchive(stream)).resolves.toEqual([
      { path: "repo-main/a.txt", bytes: new Uint8Array([97]) },
      { path: "repo-main/b.txt", bytes: new Uint8Array([98]) },
    ]);
  });

  it("rejects dot segments and oversized archive paths", async () => {
    const entry = (path: string) => {
      const header = Buffer.alloc(512);
      const separator = path.length > 100 ? path.lastIndexOf("/", 155) : -1;
      const name = separator > 0 ? path.slice(separator + 1) : path;
      const prefix = separator > 0 ? path.slice(0, separator) : "";
      header.write(name, 0, 100, "utf8");
      header.write(prefix, 345, 155, "utf8");
      header[156] = 48;
      header.fill(32, 148, 156);
      header.write(
        `${header
          .reduce((sum, byte) => sum + byte, 0)
          .toString(8)
          .padStart(6, "0")}\0 `,
        148,
        8,
        "ascii",
      );
      return Buffer.concat([header, Buffer.alloc(1024)]);
    };
    for (const path of ["repo/./file", `${"p".repeat(155)}/${"a".repeat(100)}`]) {
      const bytes = Buffer.concat([entry(path), Buffer.alloc(1024)]);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes));
          controller.close();
        },
      });
      await expect(readTarArchive(stream)).rejects.toThrow("POLICY_REJECTED");
    }
  });

  it("rejects links and declared file sizes above the per-file ceiling", async () => {
    const header = Buffer.alloc(512);
    header.write("repo/link", 0, 100, "utf8");
    header[156] = 50;
    header.fill(32, 148, 156);
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, "0")}\0 `,
      148,
      8,
      "ascii",
    );
    await expect(
      readTarArchive(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(Buffer.concat([header, Buffer.alloc(1024)])));
            controller.close();
          },
        }),
      ),
    ).rejects.toThrow("POLICY_REJECTED");

    const oversized = Buffer.alloc(512);
    oversized.write("repo/large", 0, 100, "utf8");
    oversized.write(`${(10 * 1024 * 1024 + 1).toString(8)}\0`, 124, 12, "ascii");
    oversized[156] = 48;
    oversized.fill(32, 148, 156);
    oversized.write(
      `${oversized
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, "0")}\0 `,
      148,
      8,
      "ascii",
    );
    await expect(
      readTarArchive(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(oversized));
            controller.close();
          },
        }),
      ),
    ).rejects.toThrow("SIZE_LIMIT");
  });
});
