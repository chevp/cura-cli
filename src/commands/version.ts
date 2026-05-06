import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitText } from "../git.js";

function packageVersion(): string | null {
  // src/commands/version.ts → ../../package.json (in dist/ → ../package.json)
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "package.json"),
    join(here, "..", "package.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const pkg = JSON.parse(readFileSync(p, "utf-8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function version(_args: string[]): Promise<number> {
  const v = packageVersion();
  process.stdout.write(`cura-cli${v ? " v" + v : ""}\n`);
  // If installed from a git checkout, also show describe + sha for parity with `che version`.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..", "..", "..");
  const describe = gitText(["describe", "--tags", "--always", "--dirty"], repoRoot);
  const sha = gitText(["rev-parse", "HEAD"], repoRoot);
  if (describe) process.stdout.write(`describe: ${describe}\n`);
  if (sha) process.stdout.write(`sha: ${sha}\n`);
  return 0;
}
