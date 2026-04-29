#!/usr/bin/env node
import { up } from "./commands/up.js";
import { down } from "./commands/down.js";
import { ship } from "./commands/ship.js";
import { doctor } from "./commands/doctor.js";

const usage = `cura — Cura dev-env CLI (Node.js + TypeScript port; built on che-cli)

Usage: cura <command> [args]

Commands:
  up                  start the Cura local stack (docker-compose.local.yml)
  down                stop and remove the Cura local stack
  ship                run 'che ship' inside $CURA_REPO (recursive add+commit+push)
  doctor [target]     verify deps via 'che doctor' + Cura-specific checks
  help                show this message

Environment:
  CURA_REPO           path to the cura repo (default: $HOME/workspace/misc/cura)
  CURA_COMPOSE_FILE   compose file for up/down (default: $CURA_REPO/docker-compose.local.yml)
  CHE_*               passed through to che-cli (provider, model, etc.)

Requires: che-cli (https://chevp.github.io/che-cli/)
Docs:     https://chevp.github.io/cura-cli/
`;

async function main(): Promise<number> {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case "up":
      return up(args);
    case "down":
      return down(args);
    case "ship":
      return ship(args);
    case "doctor":
      return doctor(args);
    case undefined:
    case "help":
    case "-h":
    case "--help":
      console.log(usage);
      return 0;
    default:
      console.error(`cura: unknown command '${cmd}'`);
      console.error(usage);
      return 1;
  }
}

main().then((code) => process.exit(code));
