import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";

function stateDir(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "cura");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "cura");
}

function stateFile(): string {
  return join(stateDir(), "state.json");
}

function readCachedRepo(): string | null {
  try {
    const raw = readFileSync(stateFile(), "utf-8");
    const parsed = JSON.parse(raw) as { repo?: string };
    if (parsed.repo && looksLikeCuraRepo(parsed.repo)) return parsed.repo;
  } catch {
    /* no cache yet */
  }
  return null;
}

function writeCachedRepo(repo: string): void {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify({ repo, savedAt: new Date().toISOString() }, null, 2));
  } catch {
    /* non-fatal; caching is best-effort */
  }
}

function looksLikeCuraRepo(dir: string): boolean {
  return (
    existsSync(join(dir, "CLAUDE.md")) &&
    existsSync(join(dir, "docker-compose.local.yml"))
  );
}

/** True when the current cwd (or an ancestor) is the cura repo. */
export function isInsideCuraRepo(): boolean {
  return walkUpForCuraRepo(process.cwd()) !== null;
}

function walkUpForCuraRepo(start: string): string | null {
  let cur = start;
  const root = parse(cur).root;
  while (cur && cur !== root) {
    if (looksLikeCuraRepo(cur)) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (looksLikeCuraRepo(cur)) return cur;
  return null;
}

export function getCuraRepo(): string {
  if (process.env.CURA_REPO) return process.env.CURA_REPO;
  const found = walkUpForCuraRepo(process.cwd());
  if (found) {
    writeCachedRepo(found);
    return found;
  }
  const cached = readCachedRepo();
  if (cached) return cached;
  return join(homedir(), "workspace", "misc", "cura");
}

export function getComposeFile(): string {
  if (process.env.CURA_COMPOSE_FILE) return process.env.CURA_COMPOSE_FILE;
  return join(getCuraRepo(), "docker-compose.local.yml");
}

export function validateCuraRepo(repo: string = getCuraRepo()): void {
  if (!existsSync(repo)) {
    console.error(`cura: cura repo not found (looked for CLAUDE.md + docker-compose.local.yml in cwd and ancestors)`);
    console.error(`       hint: cd into the cura repo, or set CURA_REPO=/path/to/cura`);
    process.exit(1);
  }
  if (!looksLikeCuraRepo(repo)) {
    console.error(`cura: directory does not look like the cura repo`);
    console.error(`       expected CLAUDE.md and docker-compose.local.yml inside`);
    process.exit(1);
  }
}
