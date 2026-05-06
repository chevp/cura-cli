import { spawn, spawnSync } from "node:child_process";
import { delimiter } from "node:path";
import { existsSync } from "node:fs";

const isWindows = process.platform === "win32";

function resolveOnPath(name: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const exts = isWindows
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const sep = dir.endsWith("/") || dir.endsWith("\\") ? "" : isWindows ? "\\" : "/";
      const candidate = `${dir}${sep}${name}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function hasClaude(): boolean {
  return resolveOnPath("claude") !== null;
}

export function claudeVersion(): string | null {
  const bin = resolveOnPath("claude");
  if (!bin) return null;
  const r = spawnSync(bin, ["--version"], { encoding: "utf-8" });
  if (r.status !== 0) return null;
  return (r.stdout ?? "").split("\n")[0]?.trim() ?? null;
}

function isExecutionError(s: string): boolean {
  return s.replace(/\s+/g, "") === "Executionerror";
}

export type GenerateResult =
  | { ok: true; output: string }
  | { ok: false; error: string };

export function generate(prompt: string): Promise<GenerateResult> {
  return new Promise((resolve) => {
    const bin = resolveOnPath("claude");
    if (!bin) {
      resolve({ ok: false, error: "claude CLI not on PATH" });
      return;
    }
    const child = spawn(bin, ["-p", "--tools", ""], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.trim() || `claude exited ${code}` });
        return;
      }
      if (isExecutionError(stdout)) {
        resolve({
          ok: false,
          error:
            "claude returned 'Execution error' — try: claude -p --output-format json \"hi\"",
        });
        return;
      }
      resolve({ ok: true, output: stdout });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
