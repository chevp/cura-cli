const TEXT = `cura — Cura dev-env CLI (ollama-backed)

Usage: cura <command> [args]

Commands:
  up [args]           start the Cura local stack (docker-compose.local.yml up -d)
  down [args]         stop the Cura local stack
  ship                add + commit + push, recursively into submodules
                      (commit message via local Ollama)
  commit              stage all + AI-generated commit message (+ optional --push)
  status              git status + cura-cli config (provider, model, env)
  explain [question]  ask Ollama to diagnose the last cura ship/commit failure
                      (read-only — prints a suggested command, never executes)
  init                provision local ollama (verify binary, start server, pull model)
  run <name>          execute a workflow from .che/workflows/<name>.yml
                      (alias for: cura workflow run <name>)
  workflow <sub>      list / show / run workflows from .che/workflows/
  <trigger> [args]    any workflow with 'trigger: <name>' in its YAML can be
                      run as 'cura <name>' — shadows the built-ins above
  reinstall           re-run the current repo's scripts/reinstall.sh
  config [key] [val]  view or change persistent settings (~/.cura/config);
                      e.g. 'cura config ollama_model llama3.2'
  doctor [target]     verify deps (git, docker, ollama, repo)
  help                show this message

Run 'cura <command> --help' for command-specific options.

Environment:
  CURA_REPO              path to cura repo (default: auto-detect; fallback ~/workspace/misc/cura)
  CURA_COMPOSE_FILE      compose file for up/down (default: <repo>/docker-compose.local.yml)
  CURA_OLLAMA_HOST       Ollama base URL (default: http://localhost:11434)
  CURA_OLLAMA_MODEL      Ollama model (default: llama3.2)
  CURA_MAX_DIFF_CHARS    diff truncation length for commit messages (default: 8000)
`;

export async function run(_argv: string[]): Promise<number> {
  process.stdout.write(TEXT);
  return 0;
}
