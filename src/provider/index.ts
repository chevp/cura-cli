import type { Provider } from "./types.js";
import { ollamaProvider, startOllamaServer } from "./ollama.js";

/**
 * cura-cli is ollama-only — no claude-code/copilot fallback path. Functions
 * mirror the chi shapes (active*, getProvider, providerEnsureRunning,
 * providerSmartGenerate) so the ported commands compile unchanged.
 */
export function activeProviderName(): "ollama" {
  return "ollama";
}

export function getProvider(): Provider {
  return ollamaProvider;
}

export async function providerEnsureRunning(): Promise<boolean> {
  return startOllamaServer();
}

export interface SmartGenerateOptions {
  complex?: boolean;
}

export async function providerSmartGenerate(
  prompt: string,
  _opts: SmartGenerateOptions = {},
): Promise<string> {
  if (!(await ollamaProvider.ping())) {
    throw new Error(
      "cura: ollama not reachable — run 'cura init' or 'cura doctor ollama'",
    );
  }
  return ollamaProvider.generate(prompt);
}

export type { Provider };
export type ProviderName = "ollama";
