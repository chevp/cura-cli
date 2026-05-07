import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CURA_CONFIG_FILE: string =
  process.env.CURA_CONFIG_FILE ?? join(homedir(), ".cura", "config");

/**
 * cura-cli is ollama-only, so the persisted config knobs are limited to
 * Ollama coordinates and the generic diff truncation.
 */
const KEY_TO_ENV: Record<string, string> = {
  ollama_host: "CURA_OLLAMA_HOST",
  ollama_model: "CURA_OLLAMA_MODEL",
  max_diff_chars: "CURA_MAX_DIFF_CHARS",
};

/**
 * Only sets a CURA_* var when it isn't already present in the environment,
 * so: explicit env > saved config > built-in default.
 */
export function loadPersistedConfig(): void {
  if (!existsSync(CURA_CONFIG_FILE)) return;

  const raw = readFileSync(CURA_CONFIG_FILE, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trimStart();
    const envName = KEY_TO_ENV[key];
    if (!envName) continue;

    if (process.env[envName] === undefined || process.env[envName] === "") {
      process.env[envName] = value;
    }
  }
}
