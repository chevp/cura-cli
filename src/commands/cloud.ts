import { commandExists, execAsync } from "../spawn.js";
import { getCuraRepo } from "../repo.js";
import { confirmYesNo } from "../prompt.js";
import { c, kv, line, section } from "../ui.js";

const HELP = `cura cloud — steuert die GCP Cloud Run Services (cura-app, core-service, cura-llm).

Usage: cura cloud <subcommand> [options]

Subcommands:
  status               zeigt URL, Ingress, IAP, Revision pro Service
  start                macht cura-app + core-service public erreichbar
                       (--ingress=all --allow-unauthenticated)
  stop                 sperrt den Public-Ingress (--ingress=internal
                       --no-allow-unauthenticated). Services bleiben bestehen.
  reset [--yes|-y]     löscht alle drei Services. Fragt y/N nach, sofern --yes
                       nicht gesetzt ist.
  rebuild              triggert den GitHub Actions Workflow 'deploy-gcp.yml'
                       (Build + Redeploy aller Services).

Environment:
  GCP_PROJECT          (required) GCP Projekt-ID
  GCP_REGION           Default europe-west6
`;

const SERVICES = ["cura-app", "core-service", "cura-llm"] as const;
const PUBLIC_SERVICES = ["cura-app", "core-service"] as const;
const WORKFLOW_FILE = "deploy-gcp.yml";

function ok(msg: string): void {
  process.stdout.write(`  ${c.green("✓")} ${msg}\n`);
}
function fail(msg: string): void {
  process.stdout.write(`  ${c.red("✗")} ${msg}\n`);
}
function info(msg: string): void {
  process.stdout.write(`  ${c.dim(msg)}\n`);
}

interface CloudEnv {
  project: string;
  region: string;
}

function readCloudEnv(): CloudEnv | null {
  const project = process.env.GCP_PROJECT;
  if (!project) {
    process.stderr.write(
      `cura cloud: GCP_PROJECT ist nicht gesetzt.\n` +
        `       hint: export GCP_PROJECT=<projekt-id>  (siehe deployment/cloud-run.md)\n`,
    );
    return null;
  }
  return {
    project,
    region: process.env.GCP_REGION || "europe-west6",
  };
}

async function ensureGcloud(): Promise<boolean> {
  if (!commandExists("gcloud")) {
    process.stderr.write(
      `cura cloud: 'gcloud' nicht auf PATH.\n` +
        `       install: https://cloud.google.com/sdk/docs/install\n`,
    );
    return false;
  }
  return true;
}

async function ensureGh(): Promise<boolean> {
  if (!commandExists("gh")) {
    process.stderr.write(
      `cura cloud rebuild: 'gh' (GitHub CLI) nicht auf PATH.\n` +
        `       install: https://cli.github.com\n`,
    );
    return false;
  }
  return true;
}

async function serviceExists(svc: string, env: CloudEnv): Promise<boolean> {
  const r = await execAsync(
    "gcloud",
    [
      "run",
      "services",
      "describe",
      svc,
      `--region=${env.region}`,
      `--project=${env.project}`,
      "--format=value(metadata.name)",
    ],
    { separateStderr: true },
  );
  return r.ok && r.stdout.trim() === svc;
}

async function runStatus(): Promise<number> {
  const env = readCloudEnv();
  if (!env) return 1;
  if (!(await ensureGcloud())) return 1;

  const repo = getCuraRepo();
  const verify = join(repo, "scripts", "gcp", "verify.sh");
  if (!existsSync(verify)) {
    process.stderr.write(`cura cloud status: ${verify} nicht gefunden\n`);
    return 1;
  }

  // verify.sh erwartet GCP_PROJECT/GCP_REGION im Environment.
  return execInherit("bash", [verify], {
    cwd: repo,
    env: { ...process.env, GCP_PROJECT: env.project, GCP_REGION: env.region },
  });
}

async function updateIngress(
  svc: string,
  env: CloudEnv,
  mode: "public" | "internal",
): Promise<boolean> {
  const flags =
    mode === "public"
      ? ["--ingress=all", "--allow-unauthenticated"]
      : ["--ingress=internal", "--no-allow-unauthenticated"];
  const r = await execAsync(
    "gcloud",
    [
      "run",
      "services",
      "update",
      svc,
      `--region=${env.region}`,
      `--project=${env.project}`,
      "--quiet",
      ...flags,
    ],
    { separateStderr: true },
  );
  if (r.ok) {
    ok(`${svc}: ${mode === "public" ? "ingress=all, public" : "ingress=internal, no-unauth"}`);
    return true;
  }
  fail(`${svc}: update fehlgeschlagen`);
  if (r.stderr.trim()) info(r.stderr.trim().split(/\r?\n/).slice(0, 3).join(" | "));
  return false;
}

async function runStart(): Promise<number> {
  const env = readCloudEnv();
  if (!env) return 1;
  if (!(await ensureGcloud())) return 1;

  section(`cloud start (${env.project} / ${env.region})`);
  let failed = 0;
  for (const svc of PUBLIC_SERVICES) {
    if (!(await serviceExists(svc, env))) {
      fail(`${svc}: existiert nicht — 'cura cloud rebuild' für initial deploy`);
      failed++;
      continue;
    }
    if (!(await updateIngress(svc, env, "public"))) failed++;
  }
  // cura-llm bleibt unverändert: ist je nach IAP-Modus internal oder public,
  // wird vom Deploy-Script gesteuert. Manuelles Toggeln hier macht es kaputt.
  info("cura-llm: unverändert (vom Deploy-Modus IAP_ENABLED gesteuert)");
  line();
  return failed === 0 ? 0 : 1;
}

async function runStop(): Promise<number> {
  const env = readCloudEnv();
  if (!env) return 1;
  if (!(await ensureGcloud())) return 1;

  section(`cloud stop (${env.project} / ${env.region})`);
  let failed = 0;
  for (const svc of PUBLIC_SERVICES) {
    if (!(await serviceExists(svc, env))) {
      info(`${svc}: existiert nicht, übersprungen`);
      continue;
    }
    if (!(await updateIngress(svc, env, "internal"))) failed++;
  }
  info("cura-llm: unverändert (vom Deploy-Modus IAP_ENABLED gesteuert)");
  line();
  return failed === 0 ? 0 : 1;
}

async function runReset(argv: string[]): Promise<number> {
  const env = readCloudEnv();
  if (!env) return 1;
  if (!(await ensureGcloud())) return 1;

  const skipPrompt = argv.includes("--yes") || argv.includes("-y");

  section(`cloud reset (${env.project} / ${env.region})`);

  // Erst auflisten was tatsächlich existiert — sonst lügt der Prompt.
  const existing: string[] = [];
  for (const svc of SERVICES) {
    if (await serviceExists(svc, env)) existing.push(svc);
  }
  if (existing.length === 0) {
    info("nichts zu löschen — keine der drei Services existiert");
    line();
    return 0;
  }
  for (const svc of existing) process.stdout.write(`  ${c.yellow("•")} ${svc}\n`);

  if (!skipPrompt) {
    line();
    const yes = await confirmYesNo(
      `Wirklich ${existing.length} Service(s) in ${env.project} löschen? [y/N] `,
    );
    if (!yes) {
      info("abgebrochen");
      return 1;
    }
  }

  let failed = 0;
  for (const svc of existing) {
    const r = await execAsync(
      "gcloud",
      [
        "run",
        "services",
        "delete",
        svc,
        `--region=${env.region}`,
        `--project=${env.project}`,
        "--quiet",
      ],
      { separateStderr: true },
    );
    if (r.ok) ok(`${svc}: gelöscht`);
    else {
      fail(`${svc}: delete fehlgeschlagen`);
      if (r.stderr.trim()) info(r.stderr.trim().split(/\r?\n/).slice(0, 3).join(" | "));
      failed++;
    }
  }
  line();
  return failed === 0 ? 0 : 1;
}

async function runRebuild(argv: string[]): Promise<number> {
  if (!(await ensureGh())) return 1;
  const repo = getCuraRepo();

  section("cloud rebuild");
  kv("workflow", WORKFLOW_FILE);

  const ghArgs = ["workflow", "run", WORKFLOW_FILE, ...argv];
  const r = await execAsync("gh", ghArgs, { cwd: repo, separateStderr: true });
  if (!r.ok) {
    fail(`gh workflow run fehlgeschlagen`);
    if (r.stderr.trim()) info(r.stderr.trim());
    return 1;
  }
  ok("Workflow getriggert");

  // Direkt den letzten Run anzeigen, damit der User den Link bekommt.
  const list = await execAsync(
    "gh",
    ["run", "list", "--workflow", WORKFLOW_FILE, "--limit", "1", "--json", "url,status,createdAt"],
    { cwd: repo, separateStderr: true },
  );
  if (list.ok && list.stdout.trim()) {
    try {
      const entries = JSON.parse(list.stdout) as Array<{ url?: string; status?: string }>;
      const first = entries[0];
      if (first?.url) kv("run", first.url);
    } catch {
      /* nicht-fatal */
    }
  }
  line();
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return sub ? 0 : 1;
  }
  const rest = argv.slice(1);
  switch (sub) {
    case "status":
      return runStatus();
    case "start":
      return runStart();
    case "stop":
      return runStop();
    case "reset":
      return runReset(rest);
    case "rebuild":
      return runRebuild(rest);
    default:
      process.stderr.write(`cura cloud: unbekanntes Subcommand '${sub}'\n\n`);
      process.stdout.write(HELP);
      return 1;
  }
}
