#!/usr/bin/env node
import { loadPersistedConfig } from "./config.js";
import * as helpCmd from "./commands/help.js";
import * as upCmd from "./commands/up.js";
import * as downCmd from "./commands/down.js";
import * as shipCmd from "./commands/ship.js";
import * as commitCmd from "./commands/commit.js";
import * as statusCmd from "./commands/status.js";
import * as explainCmd from "./commands/explain.js";
import * as initCmd from "./commands/init.js";
import * as reinstallCmd from "./commands/reinstall.js";
import * as configCmd from "./commands/config.js";
import * as doctorCmd from "./commands/doctor.js";
import * as workflowCmd from "./commands/workflow.js";
import { resolveTrigger } from "./workflow/loader.js";

type CommandRunner = (argv: string[]) => Promise<number>;

const COMMANDS: Record<string, CommandRunner> = {
  up: (a) => upCmd.up(a),
  down: (a) => downCmd.down(a),
  ship: shipCmd.run,
  commit: commitCmd.run,
  status: statusCmd.run,
  explain: explainCmd.run,
  init: initCmd.run,
  reinstall: reinstallCmd.run,
  config: configCmd.run,
  doctor: doctorCmd.run,
  workflow: workflowCmd.run,
  run: workflowCmd.runAlias,

  help: helpCmd.run,
  "-h": helpCmd.run,
  "--help": helpCmd.run,
};

/**
 * Reserved commands skip the workflow-trigger lookup so workflows stay
 * manageable even if a user authors a `trigger: workflow` (footgun guard).
 */
const RESERVED_FOR_TRIGGER = new Set(["help", "-h", "--help", "workflow", "run"]);

async function main(): Promise<number> {
  loadPersistedConfig();

  const [, , cmd = "help", ...rest] = process.argv;

  // Workflow triggers shadow built-ins. A `.che/workflows/*.yml` declaring
  // `trigger: <cmd>` takes precedence over the dispatch table below.
  if (!RESERVED_FOR_TRIGGER.has(cmd)) {
    try {
      const lookup = resolveTrigger(cmd);
      if (lookup.kind === "match") {
        return await workflowCmd.runAlias([lookup.stem, ...rest]);
      }
      if (lookup.kind === "ambiguous") {
        process.stderr.write(`cura: trigger '${cmd}' is declared by multiple workflows:\n`);
        for (const f of lookup.files) process.stderr.write(`  - ${f}\n`);
        return 2;
      }
    } catch {
      // Fall through to built-in dispatch on any loader hiccup.
    }
  }

  const runner = COMMANDS[cmd];
  if (!runner) {
    process.stderr.write(`cura: unknown command '${cmd}'\n`);
    await helpCmd.run([]);
    return 1;
  }

  try {
    return await runner(rest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`cura ${cmd}: ${msg}\n`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`cura: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
