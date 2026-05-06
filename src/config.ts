import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const VALID_KEYS = ["max_diff_chars", "claude_path"] as const;
export type ConfigKey = (typeof VALID_KEYS)[number];

export const KEY_DOC: Record<ConfigKey, string> = {
  max_diff_chars: "diff truncation length (default: 8000)",
  claude_path: "absolute path to the claude binary (default: from $PATH)",
};

export function configPath(): string {
  return process.env.CURA_CONFIG_FILE ?? join(homedir(), ".cura", "config");
}

export function isValidKey(s: string): s is ConfigKey {
  return (VALID_KEYS as readonly string[]).includes(s);
}

export function validate(key: ConfigKey, value: string): string | null {
  switch (key) {
    case "max_diff_chars":
      if (!/^\d+$/.test(value)) return "max_diff_chars must be a positive integer";
      return null;
    case "claude_path":
      if (!value.length) return "claude_path must not be empty";
      return null;
  }
}

function readAll(): Map<string, string> {
  const m = new Map<string, string>();
  const p = configPath();
  if (!existsSync(p)) return m;
  const raw = readFileSync(p, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    m.set(k, v);
  }
  return m;
}

function writeAll(map: Map<string, string>): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  const lines: string[] = [];
  for (const [k, v] of map) lines.push(`${k}=${v}`);
  writeFileSync(p, lines.join("\n") + (lines.length ? "\n" : ""));
}

export function readKey(key: ConfigKey): string | null {
  return readAll().get(key) ?? null;
}

export function writeKey(key: ConfigKey, value: string): void {
  const m = readAll();
  m.set(key, value);
  writeAll(m);
}

export function unsetKey(key: ConfigKey): void {
  const m = readAll();
  if (!m.delete(key)) return;
  writeAll(m);
}

export function listAll(): string[] {
  const lines: string[] = [];
  const m = readAll();
  for (const [k, v] of m) lines.push(`${k}=${v}`);
  return lines;
}

export function getMaxDiffChars(): number {
  if (process.env.CURA_MAX_DIFF_CHARS) {
    const n = Number.parseInt(process.env.CURA_MAX_DIFF_CHARS, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const v = readKey("max_diff_chars");
  if (v) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 8000;
}
