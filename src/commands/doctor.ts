import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getCuraRepo } from "../repo.js";
import { checkCheVersion, hasChe, spawnChe } from "../che.js";
import { dockerComposeVersion } from "../docker.js";

const tty = process.stdout.isTTY;
const C_GREEN = tty ? "\x1b[32m" : "";
const C_RED = tty ? "\x1b[31m" : "";
const C_DIM = tty ? "\x1b[2m" : "";
const C_RESET = tty ? "\x1b[0m" : "";

function ok(msg: string): void {
  console.log(`  ${C_GREEN}✓${C_RESET} ${msg}`);
}
function fail(msg: string): void {
  console.log(`  ${C_RED}✗${C_RESET} ${msg}`);
}
function info(msg: string): void {
  console.log(`    ${C_DIM}${msg}${C_RESET}`);
}

function cheSection(): boolean {
  console.log("che-cli:");
  const r = checkCheVersion();
  if (r.found) {
    ok(`che on PATH`);
    return true;
  }
  fail("che not on PATH (cura-cli builds on che-cli)");
  info("install: https://chevp.github.io/che-cli/");
  return false;
}

function repoSection(): void {
  console.log("cura repo:");
  const repo = getCuraRepo();
  if (!existsSync(repo)) {
    fail(`cura repo not found (set CURA_REPO or cd into the repo)`);
    return;
  }
  const source = process.env.CURA_REPO ? "from $CURA_REPO" : "auto-detected";
  ok(`cura repo (${source})`);
  for (const f of ["CLAUDE.md", "docker-compose.local.yml", "docker-compose.e2e.yml"]) {
    if (existsSync(join(repo, f))) ok(f);
    else fail(`${f} missing`);
  }
}

function composeSection(): void {
  console.log("docker compose:");
  const v = dockerComposeVersion();
  if (v.ok) {
    ok(`docker compose v2: ${v.version}`);
  } else {
    const v1 = spawnSync("docker-compose", ["--version"]);
    if (v1.status === 0) {
      fail("only docker-compose v1 found — cura-cli expects v2 (docker compose)");
    } else {
      fail("docker compose not available");
    }
  }
}

function nodeSection(): void {
  console.log("node:");
  ok(`node: ${process.version}`);
  const npmCheck = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/c", "npm", "--version"], { encoding: "utf-8" })
    : spawnSync("npm", ["--version"], { encoding: "utf-8" });
  if (npmCheck.status === 0) ok(`npm: ${(npmCheck.stdout ?? "").trim()}`);
  else fail("npm not available");
}

const usage = `cura doctor — verify Cura dev-env + run 'che doctor'.

Usage: cura doctor [target]

Targets:
  all       run all checks + 'che doctor' (default)
  che       only check that che-cli is installed
  repo      only check $CURA_REPO
  compose   only check 'docker compose'
  node      only check Node.js + npm

Environment:
  CURA_REPO   path to the cura repo (default: $HOME/workspace/misc/cura)
`;

export async function doctor(args: string[]): Promise<number> {
  const target = args[0] ?? "all";
  switch (target) {
    case "che":
      return cheSection() ? 0 : 1;
    case "repo":
      repoSection();
      return 0;
    case "compose":
      composeSection();
      return 0;
    case "node":
      nodeSection();
      return 0;
    case "-h":
    case "--help":
      console.log(usage);
      return 0;
    case "all":
    case "": {
      const cheOk = cheSection();
      console.log();
      repoSection();
      console.log();
      composeSection();
      console.log();
      nodeSection();
      console.log();
      if (cheOk) {
        console.log("che doctor:");
        return spawnChe(["doctor"]);
      }
      return 1;
    }
    default:
      console.error(`cura doctor: unknown target '${target}'`);
      console.error(`valid: all, che, repo, compose, node`);
      return 1;
  }
}
