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
import { isInsideCuraRepo } from "../repo.js";
import { commandExists } from "../spawn.js";
import {
  CLOUD_RUN_SERVICES,
  activeGcloudAccount,
  describeService,
  readGcpEnv,
} from "../gcp.js";

const HELP = `cura status — overview of the current repo and cura-cli configuration.

Usage: cura status [options]

Options:
  -s, --short   only the one-line summary (no recent commits, no submodules,
                no cloud / cyon checks)
  -h, --help    show this help

Cloud + Cyon sections appear when run inside the cura repo (long mode only):
  cloud:   GCP Cloud Run services — needs GCP_PROJECT + gcloud on PATH
  cyon:    HTTP probes against cura.sowuvuma.cyon.site (3s timeout each)
`;

const MAX_GLOBAL_REPOS = 10;

const CYON_PROBES: Array<{ name: string; url: string }> = [
  { name: "api",       url: "https://cura.sowuvuma.cyon.site/api/health/config-check" },
  { name: "showcase",  url: "https://cura.sowuvuma.cyon.site/cura-showcase/" },
  { name: "storybook", url: "https://cura.sowuvuma.cyon.site/cura-storybook/" },
  { name: "progress",  url: "https://cura.sowuvuma.cyon.site/cura-progress/progress.html" },
];

async function probeUrl(url: string, timeoutMs = 3_000): Promise<{ code: number; ms: number; err?: string }> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, redirect: "follow" });
    return { code: res.status, ms: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { code: 0, ms: Date.now() - start, err: /abort/i.test(msg) ? "timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}

async function cloudSection(): Promise<void> {
  const env = readGcpEnv();
  if (!env) return;
  if (!commandExists("gcloud")) return;

  section(`gcp cloud run (${env.project} / ${env.region})`);
  const account = await activeGcloudAccount();
  if (!account) {
    process.stdout.write(`  ${c.red("✗")} gcloud not logged in — run 'gcloud auth login'\n`);
    return;
  }
  kv("account", account);

  const infos = await Promise.all(
    CLOUD_RUN_SERVICES.map(async (svc) => [svc, await describeService(svc, env)] as const),
  );
  for (const [svc, info] of infos) {
    if (!info.exists) {
      process.stdout.write(`  ${c.red("✗")} ${svc.padEnd(14)} ${c.dim("(not deployed)")}\n`);
      continue;
    }
    const mark = info.ready ? c.green("✓") : c.red("✗");
    const ingress = info.ingress === "all" ? c.green("public") : c.yellow(info.ingress);
    process.stdout.write(
      `  ${mark} ${svc.padEnd(14)} ${ingress.padEnd(16)} ${c.dim(info.url || "")}\n`,
    );
    if (!info.ready && info.notReadyReason) {
      process.stdout.write(`    ${c.dim(`└─ ${info.notReadyReason}`)}\n`);
    }
  }
}

async function cyonSection(): Promise<void> {
  section("cyon (cura.sowuvuma.cyon.site)");
  const results = await Promise.all(
    CYON_PROBES.map(async (p) => [p, await probeUrl(p.url)] as const),
  );
  for (const [p, r] of results) {
    let mark: string;
    let label: string;
    if (r.code >= 200 && r.code < 400) {
      mark = c.green("✓");
      label = `${r.code} ${c.dim(`${r.ms}ms`)}`;
    } else if (r.code === 401 || r.code === 403) {
      mark = c.yellow("◐");
      label = `${r.code} ${c.dim("(auth gated)")}`;
    } else if (r.code === 0) {
      mark = c.red("✗");
      label = c.dim(r.err ?? "unreachable");
    } else {
      mark = c.red("✗");
      label = `${r.code}`;
    }
    process.stdout.write(`  ${mark} ${p.name.padEnd(14)} ${label.padEnd(20)} ${c.dim(p.url)}\n`);
  }
}

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

  // ---- cloud + cyon (cura repo only, long mode only) --------------------
  // Beide Sektionen telefonieren ans Internet — daher streng gated. Parallel,
  // damit der gesamte Block in einer Round-Trip-Zeit durchläuft.
  if (!short && isInsideCuraRepo()) {
    await Promise.all([cloudSection(), cyonSection()]);
  }

  line();
  return 0;
}
