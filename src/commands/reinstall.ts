import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { topLevel, isGitRepo } from "../git.js";

const isWindows = process.platform === "win32";

const usage = `cura reinstall — re-run the current repo's reinstall script.

Usage: cura reinstall [args...]

Looks for scripts/reinstall.sh (or reinstall.ps1 on Windows) in the cwd
first, then at the git root, and execs it with any extra args.
`;

function runScript(path: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    let child;
    if (path.endsWith(".ps1")) {
      const ps = isWindows
        ? "powershell.exe"
        : "pwsh";
      child = spawn(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path, ...args], {
        stdio: "inherit",
      });
    } else {
      child = spawn("bash", [path, ...args], { stdio: "inherit" });
    }
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`cura reinstall: failed to spawn: ${err.message}`);
      resolve(1);
    });
  });
}

export async function reinstall(args: string[]): Promise<number> {
  if (args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(usage);
    return 0;
  }
  let gitRoot = "";
  if (isGitRepo()) gitRoot = topLevel();
  const cwd = process.cwd();
  const candidates = isWindows
    ? [
        join(cwd, "scripts", "reinstall.ps1"),
        gitRoot && join(gitRoot, "scripts", "reinstall.ps1"),
        join(cwd, "scripts", "reinstall.sh"),
        gitRoot && join(gitRoot, "scripts", "reinstall.sh"),
      ]
    : [
        join(cwd, "scripts", "reinstall.sh"),
        gitRoot && join(gitRoot, "scripts", "reinstall.sh"),
        join(cwd, "scripts", "reinstall.ps1"),
        gitRoot && join(gitRoot, "scripts", "reinstall.ps1"),
      ];
  for (const path of candidates) {
    if (!path) continue;
    if (!existsSync(path)) continue;
    return runScript(path, args);
  }
  console.error(
    `cura reinstall: no scripts/reinstall.{sh,ps1} found in ${cwd}${gitRoot && gitRoot !== cwd ? ` or ${gitRoot}` : ""}`,
  );
  return 1;
}
