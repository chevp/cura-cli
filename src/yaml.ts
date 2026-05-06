import { readFileSync } from "node:fs";
import YAML from "yaml";

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [k: string]: YamlValue };

export function parseYamlFile(path: string): YamlValue {
  const raw = readFileSync(path, "utf-8");
  return YAML.parse(raw) ?? null;
}

export function parseYamlString(s: string): YamlValue {
  return YAML.parse(s) ?? null;
}

export function getPath(root: YamlValue, path: string): YamlValue | undefined {
  // Supports `.foo.bar`, `.foo[0].bar`. Used for compatibility with the old
  // wf_yq DSL — keeping it lets callers translate one-to-one.
  let cur: YamlValue | undefined = root;
  let i = 0;
  if (path.startsWith(".")) i = 1;
  let buf = "";
  const flushKey = () => {
    if (!buf) return;
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as Record<string, YamlValue>)[buf];
    } else {
      cur = undefined;
    }
    buf = "";
  };
  while (i < path.length) {
    const c = path[i]!;
    if (c === ".") {
      flushKey();
      i++;
    } else if (c === "[") {
      flushKey();
      const end = path.indexOf("]", i);
      if (end < 0) return undefined;
      const idx = Number.parseInt(path.slice(i + 1, end), 10);
      if (Array.isArray(cur)) cur = cur[idx];
      else cur = undefined;
      i = end + 1;
    } else {
      buf += c;
      i++;
    }
  }
  flushKey();
  return cur;
}
