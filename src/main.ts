#!/usr/bin/env node
import { Command } from "commander";
import { loadPersistedConfig } from "./config.js";
import * as helpCmd from "./commands/help.js";
import * as upCmd from "./commands/up.js";
import * as downCmd from "./commands/down.js";
import * as statusCmd from "./commands/status.js";
import * as initCmd from "./commands/init.js";
import * as reinstallCmd from "./commands/reinstall.js";
import * as configCmd from "./commands/config.js";
import * as doctorCmd from "./commands/doctor.js";
import * as workflowCmd from "./commands/workflow.js";
import * as cloudCmd from "./commands/cloud.js";
import * as chatCmd from "./commands/chat.js";
import { resolveTrigger } from "./workflow/loader.js";

type CommandRunner = (argv: string[]) => Promise<number>;

// Each command still owns its own argv (options, --help text); commander
// here only supplies the top-level dispatch/registration.
const BUILTINS: Record<string, { runner: CommandRunner; summary: string }> = {
  up: { runner: upCmd.up, summary: "start the Cura local stack" },
  down: { runner: downCmd.down, summary: "stop the Cura local stack" },
  status: { runner: statusCmd.run, summary: "show cura-cli config, plans, cloud + cyon" },
  init: { runner: initCmd.run, summary: "provision local ollama" },
  reinstall: { runner: reinstallCmd.run, summary: "re-run the current repo's reinstall script" },
  config: { runner: configCmd.run, summary: "view or change persistent settings" },
  doctor: { runner: doctorCmd.run, summary: "verify deps (docker, ollama, repo, node)" },
  workflow: { runner: workflowCmd.run, summary: "list / show / run workflows from .che/workflows/" },
  run: { runner: workflowCmd.runAlias, summary: "execute a workflow (alias for 'workflow run')" },
  cloud: { runner: cloudCmd.run, summary: "control GCP Cloud Run services" },
  chat: { runner: chatCmd.run, summary: "interactive REPL against cura.orchestrator" },
};

const RESERVED_FOR_TRIGGER = new Set(["help", "-h", "--help", "workflow", "run"]);

async function invoke(cmd: string, runner: CommandRunner, argv: string[]): Promise<number> {
  try {
    return await runner(argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`cura ${cmd}: ${msg}\n`);
    return 1;
  }
}

function buildProgram(): Command {
  const program = new Command();
  program.name("cura").description("Cura dev-env CLI").helpOption(false);

  for (const [name, { runner, summary }] of Object.entries(BUILTINS)) {
    program
      .command(`${name} [args...]`)
      .description(summary)
      .helpOption(false)
      .allowUnknownOption(true)
      .action(async (args: string[]) => {
        process.exitCode = await invoke(name, runner, args);
      });
  }

  return program;
}

async function main(): Promise<number> {
  loadPersistedConfig();

  const [, , cmd = "help", ...rest] = process.argv;

  // Workflow triggers are declared dynamically in .che/workflows/*.yml and
  // aren't known at parse time, so they're resolved before handing off to
  // commander (which only knows the static BUILTINS above).
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

  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    return helpCmd.run(rest);
  }

  if (!(cmd in BUILTINS)) {
    process.stderr.write(`cura: unknown command '${cmd}'\n`);
    await helpCmd.run([]);
    return 1;
  }

  const program = buildProgram();
  program.exitOverride();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err && typeof err === "object" && "exitCode" in err) {
      return (err as { exitCode: number }).exitCode;
    }
    throw err;
  }
  return Number(process.exitCode ?? 0);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`cura: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
