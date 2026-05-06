import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  KEY_DOC,
  VALID_KEYS,
  configPath,
  isValidKey,
  listAll,
  readKey,
  unsetKey,
  validate,
  writeKey,
  type ConfigKey,
} from "../config.js";

const usage = `cura config — view or change persistent settings.

Usage:
  cura config                    list saved settings
  cura config <key>              show saved value for <key>
  cura config <key> <value>      set <key> (validates known keys)
  cura config --unset <key>      remove <key> from saved settings
  cura config edit               open the config file in $EDITOR
  cura config path               print the config file path

Keys:
${VALID_KEYS.map((k) => `  ${k.padEnd(18)} ${KEY_DOC[k as ConfigKey]}`).join("\n")}

Notes:
  Settings are saved to ${configPath()}.
  Env vars override saved values: e.g.
    CURA_MAX_DIFF_CHARS=4000 cura commit
`;

export async function config(args: string[]): Promise<number> {
  const cmd = args[0];
  if (!cmd || cmd === "list") {
    const lines = listAll();
    if (!lines.length) {
      process.stdout.write(
        `(no settings — config file does not exist: ${configPath()})\n`,
      );
    } else {
      process.stdout.write(lines.join("\n") + "\n");
    }
    return 0;
  }
  if (cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(usage);
    return 0;
  }
  if (cmd === "path") {
    process.stdout.write(configPath() + "\n");
    return 0;
  }
  if (cmd === "edit") {
    const p = configPath();
    mkdirSync(dirname(p), { recursive: true });
    if (!existsSync(p)) writeFileSync(p, "");
    const editor = process.env.EDITOR ?? "vi";
    return new Promise((resolve) => {
      const child = spawn(editor, [p], { stdio: "inherit" });
      child.on("exit", (code) => resolve(code ?? 1));
      child.on("error", (err) => {
        console.error(`cura config: failed to launch editor: ${err.message}`);
        resolve(1);
      });
    });
  }
  if (cmd === "--unset") {
    const key = args[1];
    if (!key) {
      console.error("cura config: --unset requires a key");
      return 1;
    }
    if (!isValidKey(key)) {
      console.error(`cura config: unknown key '${key}' (run 'cura config --help')`);
      return 1;
    }
    unsetKey(key);
    process.stdout.write(`unset ${key}\n`);
    return 0;
  }
  if (!isValidKey(cmd)) {
    console.error(`cura config: unknown key '${cmd}' (run 'cura config --help')`);
    return 1;
  }
  if (args.length === 1) {
    const v = readKey(cmd);
    if (v) process.stdout.write(v + "\n");
    else process.stdout.write("(unset — using default)\n");
    return 0;
  }
  const value = args.slice(1).join(" ");
  const err = validate(cmd, value);
  if (err) {
    console.error(`cura config: ${err}`);
    return 1;
  }
  writeKey(cmd, value);
  process.stdout.write(`${cmd}=${value}\n`);
  return 0;
}
