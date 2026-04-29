import { getCuraRepo, validateCuraRepo } from "../repo.js";
import { spawnChe } from "../che.js";

export async function ship(args: string[]): Promise<number> {
  validateCuraRepo();
  return spawnChe(["ship", ...args], { cwd: getCuraRepo() });
}
