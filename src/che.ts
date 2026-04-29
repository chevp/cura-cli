import { spawn, spawnSync } from "node:child_process";
import { delimiter, extname } from "node:path";
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
      const candidate = `${dir}${dir.endsWith("/") || dir.endsWith("\\") ? "" : isWindows ? "\\" : "/"}${name}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function hasChe(): boolean {
  return resolveOnPath("che") !== null;
}

export function requireChe(): string {
  const cheBin = resolveOnPath("che");
  if (!cheBin) {
    console.error(`cura: 'che' not found on $PATH`);
    console.error(`       cura-cli builds on che-cli — install it first:`);
    console.error(`       https://chevp.github.io/che-cli/`);
    process.exit(1);
  }
  return cheBin;
}

export function spawnChe(args: string[], opts: { cwd?: string } = {}): Promise<number> {
  const cheBin = requireChe();
  return new Promise((resolve) => {
    let child;
    if (isWindows && [".bat", ".cmd"].includes(extname(cheBin).toLowerCase())) {
      child = spawn("cmd.exe", ["/c", cheBin, ...args], {
        cwd: opts.cwd,
        stdio: "inherit",
      });
    } else if (isWindows && extname(cheBin).toLowerCase() === ".ps1") {
      child = spawn("powershell.exe", ["-NoProfile", "-File", cheBin, ...args], {
        cwd: opts.cwd,
        stdio: "inherit",
      });
    } else {
      child = spawn(cheBin, args, { cwd: opts.cwd, stdio: "inherit" });
    }
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`cura: failed to spawn che: ${err.message}`);
      resolve(1);
    });
  });
}

export function checkCheVersion(): { found: boolean; path: string | null; output: string } {
  const cheBin = resolveOnPath("che");
  if (!cheBin) return { found: false, path: null, output: "" };
  const isBat = isWindows && [".bat", ".cmd"].includes(extname(cheBin).toLowerCase());
  const r = isBat
    ? spawnSync("cmd.exe", ["/c", cheBin, "--help"], { encoding: "utf-8" })
    : spawnSync(cheBin, ["--help"], { encoding: "utf-8" });
  return { found: true, path: cheBin, output: (r.stdout ?? "").split("\n")[0] ?? "" };
}
