import { getCuraRepo, validateCuraRepo } from "../repo.js";
import { spawnChe } from "../che.js";

export async function ship(args: string[]): Promise<number> {
  validateCuraRepo();
  const repo = getCuraRepo();
  console.log(`→ (in ${repo}) che ship ${args.join(" ")}`);
  return spawnChe(["ship", ...args], { cwd: repo });
}
