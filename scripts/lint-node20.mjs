import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
  process.execPath,
  [
    "--import",
    fileURLToPath(new URL("./set-polyfill.mjs", import.meta.url)),
    fileURLToPath(new URL("../node_modules/.bin/ultracite", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
