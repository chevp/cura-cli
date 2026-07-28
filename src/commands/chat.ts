import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { c, line } from "../ui.js";
import { ping, streamChat } from "../provider/orchestrator.js";

const HELP = `cura chat — interactive REPL against the running cura.orchestrator chat endpoint

Usage: cura chat [options]

Options:
  --resident <id>   residentId sent with every turn (default: none)
  --mode <mode>     agent mode, e.g. 'bericht' (default: none)
  --model <name>    override model (default: server default)
  -h, --help        show this help

Environment:
  CURA_ORCHESTRATOR_HOST   base URL of cura.orchestrator (default: http://localhost:8092)

Type your message and press enter. Ctrl+C or /exit to quit.
`;

interface ChatOptions {
  resident?: string;
  mode?: string;
  model?: string;
}

function parseArgs(argv: string[]): ChatOptions | null {
  const cmd = new Command();
  cmd
    .name("cura chat")
    .helpOption(false)
    .option("--resident <id>", "residentId sent with every turn")
    .option("--mode <mode>", "agent mode, e.g. 'bericht'")
    .option("--model <name>", "override model")
    .option("-h, --help", "show help")
    .allowExcessArguments(false)
    .exitOverride();

  try {
    cmd.parse(argv, { from: "user" });
  } catch {
    return null;
  }

  const opts = cmd.opts<ChatOptions & { help?: boolean }>();
  if (opts.help) return null;
  return opts;
}

export async function run(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  if (!opts) {
    process.stdout.write(HELP);
    return 0;
  }

  const reachable = await ping();
  if (!reachable) {
    process.stderr.write(
      `${c.red("✗")} cura.orchestrator not reachable at ${
        process.env.CURA_ORCHESTRATOR_HOST ?? "http://localhost:8092"
      } — is the local stack up? Try 'cura up'.\n`,
    );
    return 1;
  }

  const sessionId = randomUUID();
  line(c.dim(`session ${sessionId}${opts.resident ? `  resident ${opts.resident}` : ""}`));
  line(c.dim("Type your message and press enter. Ctrl+C or /exit to quit."));
  line();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let exiting = false;
  rl.on("SIGINT", () => {
    exiting = true;
    rl.close();
  });

  for (;;) {
    let content: string;
    try {
      content = (await rl.question(c.cyan("you> "))).trim();
    } catch {
      break;
    }
    if (exiting) break;
    if (!content) continue;
    if (content === "/exit" || content === "/quit") break;

    process.stdout.write(c.bold("cura> "));
    let sawDelta = false;
    let hadError = false;
    await streamChat(
      {
        sessionId,
        content,
        residentId: opts.resident,
        mode: opts.mode,
        model: opts.model,
      },
      (type, data) => {
        if (type === "delta") {
          sawDelta = true;
          const text = (data as { text?: string } | null)?.text ?? "";
          process.stdout.write(text);
        } else if (type === "error") {
          hadError = true;
          const message = (data as { message?: string } | null)?.message ?? String(data);
          process.stderr.write(`\n${c.red("error")} ${message}\n`);
        }
      },
    );
    if (!sawDelta && !hadError) process.stdout.write(c.dim("(no response)"));
    process.stdout.write("\n\n");
  }

  rl.close();
  line();
  return 0;
}
