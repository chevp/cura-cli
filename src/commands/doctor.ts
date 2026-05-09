import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { c, kv, line, section } from "../ui.js";
import { ollamaProvider } from "../provider/ollama.js";
import { commandExists } from "../spawn.js";
import { getCuraRepo } from "../repo.js";
import { dockerComposeVersion } from "../docker.js";

const HELP = `cura doctor — verify deps for cura-cli.

Usage: cura doctor [target]

Targets:
  all       run every check (default)
  docker    check 'docker compose' v2
  ollama    check ollama binary + server reachability + model
  repo      check the cura repo (CLAUDE.md + docker-compose.local.yml)
  node      check Node.js + npm

Note: cura-cli does NOT verify git/gh — use 'che doctor' (che-cli) for that.
`;

function ok(msg: string): void {
  process.stdout.write(`  ${c.green("✓")} ${msg}\n`);
}
function fail(msg: string): void {
  process.stdout.write(`  ${c.red("✗")} ${msg}\n`);
}
function info(msg: string): void {
  process.stdout.write(`    ${c.dim(msg)}\n`);
}

function checkDocker(): boolean {
  section("docker");
  if (!commandExists("docker")) {
    fail("docker not on PATH");
    info("install: https://docs.docker.com/get-docker/");
    return false;
  }
  const v = dockerComposeVersion();
  if (v.ok) {
    ok(`docker compose v2: ${v.version}`);
    return true;
  }
  const v1 = spawnSync("docker-compose", ["--version"], { encoding: "utf8" });
  if (v1.status === 0) {
    fail("only docker-compose v1 found — cura-cli expects v2 ('docker compose')");
    return false;
  }
  fail("'docker compose' subcommand not available");
  return false;
}

async function checkOllama(): Promise<boolean> {
  section("ollama");
  let allOk = true;
  if (!commandExists("ollama")) {
    fail("ollama binary not on PATH");
    info("install: https://ollama.com/download");
    allOk = false;
  } else {
    const r = spawnSync("ollama", ["--version"], { encoding: "utf8" });
    ok((r.stdout ?? "").trim().split("\n")[0] || "ollama on PATH");
  }
  const reachable = await ollamaProvider.ping();
  if (reachable) {
    ok(`server reachable at ${process.env.CURA_OLLAMA_HOST ?? "http://localhost:11434"}`);
  } else {
    fail("ollama server not reachable");
    info("start with: ollama serve  (or run 'cura init')");
    allOk = false;
  }
  if (reachable) {
    const model = process.env.CURA_OLLAMA_MODEL ?? "llama3.2";
    if (await ollamaProvider.hasModel(model)) {
      ok(`model '${model}' available`);
    } else {
      fail(`model '${model}' not pulled`);
      info(`pull with: ollama pull ${model}`);
      allOk = false;
    }
  }
  return allOk;
}

function checkRepo(): boolean {
  section("cura repo");
  const repo = getCuraRepo();
  if (!existsSync(repo)) {
    fail("cura repo not found (set CURA_REPO or cd into the repo)");
    return false;
  }
  const source = process.env.CURA_REPO ? "from $CURA_REPO" : "auto-detected";
  ok(`cura repo (${source}): ${repo}`);
  let allOk = true;
  for (const f of ["CLAUDE.md", "docker-compose.local.yml", "docker-compose.e2e.yml"]) {
    if (existsSync(join(repo, f))) ok(f);
    else {
      fail(`${f} missing`);
      allOk = false;
    }
  }
  return allOk;
}

function checkNode(): boolean {
  section("node");
  ok(`node: ${process.version}`);
  const npmCheck =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", "npm", "--version"], { encoding: "utf8" })
      : spawnSync("npm", ["--version"], { encoding: "utf8" });
  if (npmCheck.status === 0) {
    ok(`npm: ${(npmCheck.stdout ?? "").trim()}`);
    return true;
  }
  fail("npm not available");
  return false;
}

export async function run(argv: string[]): Promise<number> {
  const target = argv[0] ?? "all";
  if (target === "-h" || target === "--help") {
    process.stdout.write(HELP);
    return 0;
  }
  let allOk = true;
  switch (target) {
    case "docker":
      allOk = checkDocker();
      break;
    case "ollama":
    case "provider":
      allOk = await checkOllama();
      break;
    case "repo":
      allOk = checkRepo();
      break;
    case "node":
      allOk = checkNode();
      break;
    case "all":
      allOk = checkDocker() && allOk;
      allOk = (await checkOllama()) && allOk;
      allOk = checkRepo() && allOk;
      allOk = checkNode() && allOk;
      break;
    default:
      process.stderr.write(`cura doctor: unknown target '${target}'\n`);
      process.stderr.write("valid: all, docker, ollama, repo, node\n");
      return 1;
  }
  line();
  // Suppress unused-import lint when no consumer references kv at module scope.
  void kv;
  return allOk ? 0 : 1;
}
