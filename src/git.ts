import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type RunResult = { code: number; stdout: string; stderr: string };

export function git(args: string[], cwd?: string): RunResult {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

export function gitText(args: string[], cwd?: string): string {
  return git(args, cwd).stdout.trim();
}

export function gitOk(args: string[], cwd?: string): boolean {
  return git(args, cwd).code === 0;
}

export function spawnGit(args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`cura: failed to spawn git: ${err.message}`);
      resolve(1);
    });
  });
}

export function isGitRepo(cwd?: string): boolean {
  return gitOk(["rev-parse", "--git-dir"], cwd);
}

export function gitDir(cwd?: string): string {
  return gitText(["rev-parse", "--git-dir"], cwd);
}

export function topLevel(cwd?: string): string {
  return gitText(["rev-parse", "--show-toplevel"], cwd);
}

export function currentBranch(cwd?: string): string | null {
  const r = git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);
  return r.code === 0 ? r.stdout.trim() : null;
}

export function hasUpstream(cwd?: string): boolean {
  return gitOk(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    cwd,
  );
}

export function porcelain(cwd?: string): string {
  return git(["status", "--porcelain=v1"], cwd).stdout;
}

const networkErrorPattern =
  /Could not resolve host:|Temporary failure in name resolution|Couldn't resolve host|Name or service not known/i;

export function isNetworkError(stderr: string): boolean {
  return networkErrorPattern.test(stderr);
}

const nonFastForwardPattern =
  /rejected.*(fetch first|non-fast-forward)|Updates were rejected/;

export type PushOutcome = {
  code: number;
  recovered: boolean;
  conflicts?: string[];
};

function recordError(
  cmd: string,
  exitCode: number,
  output: string,
  cwd?: string,
): void {
  const dir = gitDir(cwd);
  if (!dir) return;
  const log = join(cwd ?? process.cwd(), dir, "cura-last-error.log");
  try {
    mkdirSync(dirname(log), { recursive: true });
    const status = git(["status", "-sb"], cwd).stdout;
    const log5 = git(["log", "-5", "--oneline"], cwd).stdout;
    const remotes = git(["remote", "-v"], cwd).stdout;
    writeFileSync(
      log,
      `cura-cli error log
timestamp: ${new Date().toISOString()}
command:   ${cmd}
exit:      ${exitCode}
cwd:       ${cwd ?? process.cwd()}

--- output ---
${output}

--- git status -sb ---
${status}
--- git log -5 --oneline ---
${log5}
--- git remote -v ---
${remotes}`,
    );
  } catch {
    /* non-fatal */
  }
}

export function pushWithRecovery(
  pushArgs: string[],
  cwd?: string,
): PushOutcome {
  const cmd = `git push ${pushArgs.join(" ")}`;
  let r = spawnSync("git", ["push", ...pushArgs], { cwd, encoding: "utf-8" });
  let combined = (r.stdout ?? "") + (r.stderr ?? "");
  if (r.status === 0) {
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    return { code: 0, recovered: false };
  }

  if (!nonFastForwardPattern.test(combined)) {
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    recordError(cmd, r.status ?? 1, combined, cwd);
    console.error(`\ncura: push failed (exit ${r.status ?? 1})`);
    console.error(`run \x1b[2mcura explain\x1b[0m for an LLM-assisted diagnosis`);
    return { code: r.status ?? 1, recovered: false };
  }

  console.error("\x1b[2mcura: remote moved — pulling --rebase, retrying push\x1b[0m");
  const rebase = spawnSync("git", ["pull", "--rebase"], {
    cwd,
    encoding: "utf-8",
  });
  if (rebase.status !== 0) {
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    process.stderr.write(rebase.stdout ?? "");
    process.stderr.write(rebase.stderr ?? "");
    const dir = gitDir(cwd);
    const inRebase =
      dir &&
      (existsSync(join(cwd ?? process.cwd(), dir, "rebase-merge")) ||
        existsSync(join(cwd ?? process.cwd(), dir, "rebase-apply")));
    let conflicts: string[] = [];
    if (inRebase) {
      conflicts = git(["diff", "--name-only", "--diff-filter=U"], cwd)
        .stdout.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      console.error("\x1b[31mcura: rebase produced conflicts — aborting\x1b[0m");
      if (conflicts.length) {
        console.error("conflicting files:\n" + conflicts.join("\n"));
      }
      git(["rebase", "--abort"], cwd);
    }
    const out = (rebase.stdout ?? "") + (rebase.stderr ?? "");
    recordError(`${cmd} → pull --rebase failed`, rebase.status ?? 1, out, cwd);
    console.error(
      `\nrun \x1b[2mcura explain\x1b[0m for an LLM-assisted diagnosis`,
    );
    return { code: rebase.status ?? 1, recovered: false, conflicts };
  }

  // Retry push once.
  r = spawnSync("git", ["push", ...pushArgs], { cwd, encoding: "utf-8" });
  combined = (r.stdout ?? "") + (r.stderr ?? "");
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  if (r.status === 0) {
    console.error("\x1b[32m✓ push succeeded after rebase\x1b[0m");
    return { code: 0, recovered: true };
  }
  recordError(`${cmd} (after pull --rebase)`, r.status ?? 1, combined, cwd);
  console.error("\n\x1b[31mcura: push still failing after one retry\x1b[0m");
  console.error(`run \x1b[2mcura explain\x1b[0m for an LLM-assisted diagnosis`);
  return { code: r.status ?? 1, recovered: false };
}

export function ffPull(cwd?: string): { code: number; stderr: string } {
  if (!gitOk(["symbolic-ref", "-q", "HEAD"], cwd)) {
    return { code: 0, stderr: "" };
  }
  if (!hasUpstream(cwd)) return { code: 0, stderr: "" };
  let r = spawnSync("git", ["pull", "--ff-only", "--autostash"], {
    cwd,
    encoding: "utf-8",
  });
  if (r.status === 0) return { code: 0, stderr: "" };
  if (isNetworkError(r.stderr ?? "")) return { code: 2, stderr: r.stderr ?? "" };
  // try rebase
  r = spawnSync("git", ["pull", "--rebase", "--autostash"], {
    cwd,
    encoding: "utf-8",
  });
  if (r.status === 0) return { code: 0, stderr: "" };
  if (isNetworkError(r.stderr ?? "")) return { code: 2, stderr: r.stderr ?? "" };
  return { code: r.status ?? 1, stderr: r.stderr ?? "" };
}

export function listSubmodulePaths(repoRoot: string): string[] {
  if (!existsSync(join(repoRoot, ".gitmodules"))) return [];
  const r = git(
    ["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"],
    repoRoot,
  );
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/).slice(1).join(" "))
    .filter(Boolean);
}

export function listPhantomGitlinks(repoRoot: string): string[] {
  const cached = git(["diff", "--cached", "--raw"], repoRoot).stdout;
  const phantoms: string[] = [];
  const submodules = new Set(listSubmodulePaths(repoRoot));
  for (const raw of cached.split("\n")) {
    if (!raw) continue;
    // Format: ":<src_mode> <dst_mode> <src_sha> <dst_sha> <status>\t<path>"
    const tabSplit = raw.split("\t");
    if (tabSplit.length < 2) continue;
    const meta = tabSplit[0]!.split(/\s+/);
    const dstMode = meta[1];
    if (dstMode !== "160000") continue;
    const path = tabSplit.slice(1).join("\t");
    if (!submodules.has(path)) phantoms.push(path);
  }
  return phantoms;
}
