import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function sessionPath(): string {
  return join(
    process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? ".", ".config"),
    "gitleap",
    "session",
  );
}

export function readSession(): string | undefined {
  try {
    return readFileSync(sessionPath(), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export function writeSession(cookie: string): void {
  const path = sessionPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${cookie}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}
