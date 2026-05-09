import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { CURA_OS } from "../platform.js";
import { commandExists, execInherit } from "../spawn.js";

const HELP = `cura reinstall — re-run the current repo's reinstall script.

Usage: cura reinstall [--] [args...]

Looks for the repo-local reinstall script. On Windows, the .ps1 form is
preferred. Elsewhere, the .sh form is preferred.

  windows: scripts/reinstall.ps1 → scripts/reinstall.sh
  other:   scripts/reinstall.sh  → scripts/reinstall.ps1

Both are searched in the cwd first, then walking up to the nearest ancestor
that has a 'scripts/' directory. Any extra args are forwarded to the script.
`;

/** Walk up from `start` until a directory containing `scripts/` is found. */
function findScriptsRoot(start: string): string | null {
  let cur = start;
  const root = parse(cur).root;
  while (cur && cur !== root) {
    if (existsSync(join(cur, "scripts"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (existsSync(join(cur, "scripts"))) return cur;
  return null;
}

export async function run(argv: string[]): Promise<number> {
  let args = argv;
  if (args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (args[0] === "--") args = args.slice(1);

  const cwd = process.cwd();
  const scriptsRoot = findScriptsRoot(cwd) ?? "";

  const sh = "scripts/reinstall.sh";
  const ps1 = "scripts/reinstall.ps1";
  const candidates =
    CURA_OS === "windows"
      ? [
          join(cwd, ps1),
          scriptsRoot ? join(scriptsRoot, ps1) : "",
          join(cwd, sh),
          scriptsRoot ? join(scriptsRoot, sh) : "",
        ]
      : [
          join(cwd, sh),
          scriptsRoot ? join(scriptsRoot, sh) : "",
          join(cwd, ps1),
          scriptsRoot ? join(scriptsRoot, ps1) : "",
        ];

  for (const path of candidates) {
    if (!path || !existsSync(path)) continue;
    if (path.endsWith(".ps1")) {
      const psh = commandExists("pwsh") ? "pwsh" : commandExists("powershell") ? "powershell" : "";
      if (!psh) {
        process.stderr.write(
          `cura reinstall: found ${path} but no PowerShell available\n` +
            "  install pwsh: winget install Microsoft.PowerShell\n",
        );
        return 1;
      }
      return execInherit(psh, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path, ...args]);
    }
    if (CURA_OS === "windows" && !commandExists("bash")) {
      process.stderr.write(
        `cura reinstall: found ${path} but 'bash' is not on PATH (needed on Windows)\n` +
          "  install Git for Windows or WSL, or provide scripts/reinstall.ps1\n",
      );
      return 1;
    }
    return execInherit("bash", [path, ...args]);
  }

  process.stderr.write(
    `cura reinstall: no scripts/reinstall.{sh,ps1} found in ${cwd}${
      scriptsRoot && scriptsRoot !== cwd ? ` or ${scriptsRoot}` : ""
    }\n` +
      "Convention: each repo provides its own scripts/reinstall.sh (or .ps1 on Windows).\n",
  );
  return 1;
}
