import { basename, join } from "node:path";
import { existsSync } from "node:fs";
import { execInherit } from "../spawn.js";
import { git, gitDir, isInsideRepo } from "../git/index.js";
import { run as commitRun } from "./commit.js";

const HELP = `cura ship — for this repo and every submodule (recursively):
  init if missing, fast-forward pull if on a branch, then add + commit + push.
`;

const SELF_BIN = process.argv[1] ?? "cura";

export async function run(argv: string[]): Promise<number> {
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    return 0;
  }

  if (!isInsideRepo()) {
    process.stderr.write("cura ship: not a git repository\n");
    return 1;
  }

  const repoRoot = git(["rev-parse", "--show-toplevel"]).stdout.trim();
  const dir = gitDir();
  if (!dir) return 1;

  // --- submodules: recurse first so the parent commit can include any pointer
  // bumps the children produced.
  const gmodPath = join(repoRoot, ".gitmodules");
  if (existsSync(gmodPath)) {
    const failed: string[] = [];
    const cfg = git(
      ["-C", repoRoot, "config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"],
    ).stdout;
    for (const ln of cfg.split(/\r?\n/)) {
      const trimmed = ln.trim();
      if (!trimmed) continue;
      const smPath = trimmed.split(/\s+/, 2)[1];
      if (!smPath) continue;

      const init = git(["-C", repoRoot, "submodule", "update", "--init", "--", smPath]);
      if (!init.ok) {
        failed.push(`${smPath} (init failed)`);
        process.stderr.write(
          `cura ship: submodule update failed for '${smPath}' — skipping (continuing)\n`,
        );
        continue;
      }

      const smAbs = join(repoRoot, smPath);
      if (!existsSync(join(smAbs, ".git"))) continue;

      // ff-pull on a branch only.
      if (git(["-C", smAbs, "symbolic-ref", "-q", "HEAD"]).ok) {
        const ff = git(["-C", smAbs, "pull", "--ff-only", "--quiet"]);
        if (!ff.ok) {
          process.stdout.write(`cura ship: pull failed in ${smPath} (continuing)\n`);
        }
      } else {
        process.stdout.write(`cura ship: ${smPath} is in detached HEAD, skipping pull\n`);
      }

      const subRc = await execInherit(process.execPath, [SELF_BIN, "ship"], {
        cwd: smAbs,
        env: { ...process.env, __CURA_NESTED: "1" },
      });
      if (subRc !== 0) {
        failed.push(`${smPath} (ship failed)`);
        process.stderr.write(`cura ship: ship failed in '${smPath}' (continuing)\n`);
      }
    }

    if (failed.length > 0) {
      process.stderr.write(`\ncura ship: ${failed.length} submodule(s) had errors:\n`);
      for (const f of failed) process.stderr.write(`  - ${f}\n`);
    }
  }

  // --- pull main repo before commit/push: ff-only first, fall back to rebase ---
  if (
    git(["-C", repoRoot, "symbolic-ref", "-q", "HEAD"]).ok &&
    git(["-C", repoRoot, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).ok
  ) {
    const ff = git(["-C", repoRoot, "pull", "--ff-only", "--autostash"]);
    if (!ff.ok) {
      process.stderr.write(
        `cura ship: ff-only pull failed in ${basename(repoRoot)} — trying pull --rebase --autostash\n`,
      );
      const rb = git(["-C", repoRoot, "pull", "--rebase", "--autostash"]);
      process.stdout.write(rb.stdout);
      process.stderr.write(rb.stderr);
      if (!rb.ok) {
        const innerDir = git(["-C", repoRoot, "rev-parse", "--git-dir"]).stdout.trim();
        const inRebase =
          existsSync(join(innerDir, "rebase-merge")) || existsSync(join(innerDir, "rebase-apply"));
        if (inRebase) {
          // No AI conflict resolver in cura-cli (would require claude-code) —
          // surface conflicts and abort so the user can resolve manually.
          const conflicts = git(["-C", repoRoot, "diff", "--name-only", "--diff-filter=U"])
            .stdout.trim();
          if (conflicts) {
            process.stderr.write(`\ncura ship: rebase produced conflicts:\n${conflicts}\n`);
          }
          git(["-C", repoRoot, "rebase", "--abort"]);
          process.stderr.write(
            "cura ship: rebase aborted — resolve manually (git pull --rebase) and retry\n",
          );
          return 1;
        }
        process.stderr.write(
          `cura ship: pull failed in ${basename(repoRoot)} — resolve manually and retry\n`,
        );
        return 1;
      }
    }
  }

  // --- detached HEAD recovery ---
  if (!git(["-C", repoRoot, "symbolic-ref", "-q", "HEAD"]).ok) {
    const detachedSha = git(["-C", repoRoot, "rev-parse", "HEAD"]).stdout.trim();
    const list = git([
      "-C", repoRoot,
      "for-each-ref",
      "--format=%(refname:short)",
      "--contains", detachedSha,
      "refs/heads/",
    ]).stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const recoverBranch = list[0] ?? "";
    if (recoverBranch) {
      const co = git(["-C", repoRoot, "checkout", recoverBranch]);
      if (co.ok) {
        process.stdout.write(`cura ship: recovered from detached HEAD, switched to '${recoverBranch}'\n`);
      } else {
        process.stdout.write(
          `cura ship: detached HEAD at ${detachedSha} (could not recover to '${recoverBranch}')\n`,
        );
      }
    } else {
      process.stdout.write(
        `cura ship: detached HEAD at ${detachedSha} (no branch contains this commit)\n`,
      );
    }
  }

  // Compact path: nothing in the working tree → one-line status, skip commit.
  const dirty = git(["-C", repoRoot, "status", "--porcelain"]).stdout.trim();
  if (!dirty) {
    process.stdout.write(`${basename(repoRoot)}: clean\n`);
    return 0;
  }

  process.stdout.write(`\n── repo: ${basename(repoRoot)} ──\n`);

  if (git(["-C", repoRoot, "symbolic-ref", "-q", "HEAD"]).ok) {
    return commitRun(["--push", "--yes"]);
  }
  process.stdout.write("cura ship: still in detached HEAD, committing without push\n");
  return commitRun(["--yes"]);
}
