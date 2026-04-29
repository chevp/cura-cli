import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";

function looksLikeCuraRepo(dir: string): boolean {
  return (
    existsSync(join(dir, "CLAUDE.md")) &&
    existsSync(join(dir, "docker-compose.local.yml"))
  );
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
  if (found) return found;
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
