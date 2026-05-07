import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { CURA_OS } from "../platform.js";
import { c, kv, line, section } from "../ui.js";
import { activeProviderName, getProvider } from "../provider/index.js";
import {
  aheadBehind,
  currentBranch,
  git,
  isInsideRepo,
  porcelain,
  recentCommits,
  repoRoot,
  shortStatus,
  submoduleStatusRecursive,
  upstreamRef,
} from "../git/index.js";
import { parseFrontmatterFile, statusBadge } from "../frontmatter.js";

const HELP = `cura status — overview of the current repo and cura-cli configuration.

Usage: cura status [options]

Options:
  -s, --short   only the one-line summary (no recent commits, no submodules)
  -h, --help    show this help
`;

const MAX_GLOBAL_REPOS = 10;

/** Scan immediate children of `dir` for git repositories (up to MAX_GLOBAL_REPOS). */
function discoverRepos(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const repos: string[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (existsSync(join(full, ".git"))) {
      repos.push(full);
      if (repos.length >= MAX_GLOBAL_REPOS) break;
    }
  }
  return repos;
}

function globalStatus(short: boolean): number {
  const cwd = process.cwd();
  const repos = discoverRepos(cwd);

  section("global overview");
  process.stdout.write(`  ${c.dim(`(not inside a git repository — showing workspace summary)`)}\n`);

  if (repos.length === 0) {
    process.stdout.write(`  ${c.dim("no git repositories found in child directories")}\n`);
    line();
    return 0;
  }

  section("repositories");
  for (const repo of repos) {
    const name = basename(repo);
    const branchR = git(["symbolic-ref", "--quiet", "--short", "HEAD"], repo);
    const branch = branchR.ok ? branchR.stdout.trim() : "detached";
    const st = git(["status", "--porcelain=v1"], repo);
    const dirty = st.ok && st.stdout.trim().length > 0;
    const state = dirty ? c.yellow("dirty") : c.green("clean");
    process.stdout.write(`  ${c.cyan(name.padEnd(24))} ${branch.padEnd(20)} ${state}\n`);
  }

  if (short) {
    line();
    return 0;
  }

  section("recent commits");
  for (const repo of repos) {
    const name = basename(repo);
    const commits = recentCommits(3, repo);
    if (commits.trim()) {
      process.stdout.write(`  ${c.bold(name)}\n`);
      process.stdout.write(`${commits}\n`);
    }
  }

  line();
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const first = argv[0];
  if (first === "-h" || first === "--help") {
    process.stdout.write(HELP);
    return 0;
  }
  const short = first === "-s" || first === "--short";

  // ---- cura-cli ------------------------------------------------------------
  section("cura-cli");
  kv("platform", CURA_OS);

  const provider = getProvider();
  kv(
    "provider",
    `${activeProviderName()} ${c.dim(`(model: ${provider.activeModel()})`)}`,
  );

  const reachable = await provider.ping();
  kv(
    "reachable",
    reachable
      ? c.green("yes")
      : `${c.red("no")} ${c.dim("— run 'cura doctor ollama' or 'cura init'")}`,
  );

  const envSet: Array<[string, string]> = [];
  for (const v of [
    "CURA_OLLAMA_HOST",
    "CURA_OLLAMA_MODEL",
    "CURA_MAX_DIFF_CHARS",
  ]) {
    const val = process.env[v];
    if (val) envSet.push([v, val]);
  }
  if (envSet.length > 0) {
    const f = envSet[0]!;
    kv("env", `${f[0]}=${f[1]}`);
    for (let i = 1; i < envSet.length; i++) {
      const [k, val] = envSet[i]!;
      process.stdout.write(`  ${" ".padEnd(18)} ${k}=${val}\n`);
    }
  }

  // ---- git ----------------------------------------------------------------
  if (!isInsideRepo()) {
    return globalStatus(short);
  }

  const root = repoRoot();
  const branch = currentBranch();
  const upstream = upstreamRef();
  const counts = porcelain();
  const dirty = counts.total === 0 ? c.green("clean") : c.yellow("dirty");

  section("git");
  kv("repo", basename(root));
  kv("branch", c.cyan(branch));
  if (upstream) {
    const ab = aheadBehind();
    kv(
      "upstream",
      `${upstream}  ${c.dim("↑")}${ab.ahead} ${c.dim("↓")}${ab.behind}`,
    );
  }
  kv("state", dirty);
  if (counts.total > 0) {
    kv(
      "changes",
      `${counts.staged} staged · ${counts.unstaged} unstaged · ${counts.untracked} untracked`,
    );
  }

  if (counts.total > 0 && !short) {
    line();
    process.stdout.write(shortStatus());
  }

  // ---- submodules ---------------------------------------------------------
  if (!short && existsSync(join(root, ".gitmodules"))) {
    section("submodules");
    const sm = submoduleStatusRecursive(root);
    if (!sm.trim()) {
      process.stdout.write(`  ${c.dim("(none initialized)")}\n`);
    } else {
      for (const ln of sm.split(/\r?\n/)) {
        if (!ln) continue;
        const flag = ln.charAt(0);
        const rest = ln.slice(1);
        switch (flag) {
          case " ":
            process.stdout.write(`  ${c.green("✓")} ${rest}\n`);
            break;
          case "+":
            process.stdout.write(`  ${c.yellow("±")} ${rest} ${c.dim("(out of sync)")}\n`);
            break;
          case "-":
            process.stdout.write(`  ${c.red("−")} ${rest} ${c.dim("(not initialized)")}\n`);
            break;
          case "U":
            process.stdout.write(`  ${c.red("!")} ${rest} ${c.dim("(merge conflict)")}\n`);
            break;
          default:
            process.stdout.write(`  ${ln}\n`);
        }
      }
    }
  }

  // ---- recent commits -----------------------------------------------------
  if (!short) {
    section("recent commits");
    process.stdout.write(recentCommits(5));
    line();
  }

  // ---- plans (.che/plans) -------------------------------------------------
  if (!short) {
    const plansDir = join(root, ".che", "plans");
    if (existsSync(plansDir) && statSync(plansDir).isDirectory()) {
      const entries = readdirSync(plansDir).filter((e) => e.endsWith(".md") && e !== "README.md");
      if (entries.length > 0) {
        section("plans");
        for (const entry of entries) {
          const file = join(plansDir, entry);
          const fm = parseFrontmatterFile(file);
          const stem = entry.replace(/\.md$/, "");
          const name = fm.name || stem;
          const badge = statusBadge(fm.status);
          const extra = fm.progress ? ` ${c.dim(`(${fm.progress})`)}` : "";
          process.stdout.write(
            `  ${badge.padEnd(11)} ${name}${extra} ${c.dim(`(${entry})`)}\n`,
          );
        }
      } else if (process.env.CURA_STATUS_SHOW_EMPTY === "1") {
        section("plans");
        process.stdout.write(`  ${c.dim(`(no plans in ${plansDir})`)}\n`);
      }
    }
  }

  line();
  return 0;
}
