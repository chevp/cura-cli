import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CURA_OS } from "../platform.js";
import { c, kv, line, section } from "../ui.js";
import { ollamaProvider } from "../provider/ollama.js";
import { parseFrontmatterFile, statusBadge } from "../frontmatter.js";
import { getCuraRepo, isInsideCuraRepo } from "../repo.js";
import { commandExists } from "../spawn.js";
import {
  CLOUD_RUN_SERVICES,
  activeGcloudAccount,
  describeService,
  resolveGcpEnv,
} from "../gcp.js";

const HELP = `cura status — overview of cura-cli configuration, plans, cloud + cyon.

Usage: cura status [options]

Options:
  -s, --short   only the cura-cli config + plans (no cloud / cyon checks)
  -h, --help    show this help

Cloud + Cyon sections appear when run inside the cura repo (long mode only):
  cloud:   GCP Cloud Run services — needs GCP_PROJECT (or 'gcloud config') + gcloud
  cyon:    HTTP probes against cura.sowuvuma.cyon.site (3s timeout each)

Note: cura-cli does NOT show git status — use 'che status' (che-cli) for that.
`;

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
  const env = await resolveGcpEnv();
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
  kv("provider", `ollama ${c.dim(`(model: ${process.env.CURA_OLLAMA_MODEL ?? "llama3.2"})`)}`);

  const reachable = await ollamaProvider.ping();
  kv(
    "reachable",
    reachable
      ? c.green("yes")
      : `${c.red("no")} ${c.dim("— run 'cura doctor ollama' or 'cura init'")}`,
  );

  const envSet: Array<[string, string]> = [];
  for (const v of ["CURA_OLLAMA_HOST", "CURA_OLLAMA_MODEL", "CURA_REPO", "GCP_PROJECT", "GCP_REGION"]) {
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

  // ---- plans (.che/plans) -------------------------------------------------
  const repo = getCuraRepo();
  if (existsSync(repo)) {
    const plansDir = join(repo, ".che", "plans");
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
      }
    }
  }

  // ---- cloud + cyon (cura repo only, long mode only) --------------------
  if (!short && isInsideCuraRepo()) {
    await Promise.all([cloudSection(), cyonSection()]);
  }

  line();
  return 0;
}
