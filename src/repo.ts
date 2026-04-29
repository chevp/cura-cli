import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getCuraRepo(): string {
  return process.env.CURA_REPO ?? join(homedir(), "workspace", "misc", "cura");
}

export function getComposeFile(): string {
  const repo = getCuraRepo();
  return process.env.CURA_COMPOSE_FILE ?? join(repo, "docker-compose.local.yml");
}

export function validateCuraRepo(repo: string = getCuraRepo()): void {
  if (!existsSync(repo)) {
    console.error(`cura: $CURA_REPO does not exist: ${repo}`);
    console.error(`       set CURA_REPO=/path/to/cura`);
    process.exit(1);
  }
  const claudeMd = join(repo, "CLAUDE.md");
  const compose = join(repo, "docker-compose.local.yml");
  if (!existsSync(claudeMd) || !existsSync(compose)) {
    console.error(`cura: $CURA_REPO does not look like the cura repo: ${repo}`);
    console.error(`       expected CLAUDE.md and docker-compose.local.yml inside`);
    process.exit(1);
  }
}
