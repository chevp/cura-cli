import { spawn, spawnSync } from "node:child_process";

export function spawnDockerCompose(
  composeFile: string,
  subcommand: string,
  args: string[],
): Promise<number> {
  const dockerArgs = ["compose", "-f", composeFile, subcommand, ...args];
  return new Promise((resolve) => {
    const child = spawn("docker", dockerArgs, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`cura: failed to spawn docker: ${err.message}`);
      resolve(1);
    });
  });
}

export function dockerComposeVersion(): { ok: boolean; version: string } {
  const r = spawnSync("docker", ["compose", "version", "--short"], {
    encoding: "utf-8",
  });
  if (r.status === 0) return { ok: true, version: (r.stdout ?? "").trim() };
  return { ok: false, version: "" };
}
