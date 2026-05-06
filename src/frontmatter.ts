import { readFileSync } from "node:fs";
import { parseYamlString } from "./yaml.js";

export type Frontmatter = {
  name?: string;
  status?: string;
  progress?: string;
  [k: string]: unknown;
};

export function parseFrontmatter(text: string): Frontmatter {
  if (!text.startsWith("---")) return {};
  const lines = text.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      end = i;
      break;
    }
  }
  if (end < 0) return {};
  const yamlBlock = lines.slice(1, end).join("\n");
  const parsed = parseYamlString(yamlBlock);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Frontmatter;
  }
  return {};
}

export function parseFrontmatterFile(path: string): Frontmatter {
  return parseFrontmatter(readFileSync(path, "utf-8"));
}

export function statusBadge(status: string | undefined, color = true): string {
  // Match the badge taxonomy from che-cli's frontmatter.sh.
  const C = color && process.stdout.isTTY;
  const g = (s: string) => (C ? `\x1b[32m${s}\x1b[0m` : s);
  const r = (s: string) => (C ? `\x1b[31m${s}\x1b[0m` : s);
  const y = (s: string) => (C ? `\x1b[33m${s}\x1b[0m` : s);
  const d = (s: string) => (C ? `\x1b[2m${s}\x1b[0m` : s);
  switch ((status ?? "").toLowerCase()) {
    case "done":
      return g("done");
    case "in-progress":
    case "in_progress":
    case "wip":
      return y("in-progress");
    case "blocked":
      return r("blocked");
    case "open":
      return d("open");
    default:
      return d(status ? status : "—");
  }
}
