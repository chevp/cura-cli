import { existsSync } from "node:fs";
import { getComposeFile, validateCuraRepo } from "../repo.js";
import { spawnDockerCompose } from "../docker.js";

export async function down(args: string[]): Promise<number> {
  validateCuraRepo();
  const composeFile = getComposeFile();
  if (!existsSync(composeFile)) {
    console.error(`cura down: compose file not found: ${composeFile}`);
    return 1;
  }
  return spawnDockerCompose(composeFile, "down", args);
}
