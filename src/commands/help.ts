const TEXT = `cura — Cura dev-env CLI

Usage: cura <command> [args]

Commands:
  up [args]           start the Cura local stack (docker-compose.local.yml up -d)
  down [args]         stop the Cura local stack
  status              show cura-cli config (provider, model), plans, cloud + cyon
  init                provision local ollama (verify binary, start server, pull model)
  run <name>          execute a workflow from .che/workflows/<name>.yml
                      (alias for: cura workflow run <name>)
  workflow <sub>      list / show / run workflows from .che/workflows/
  cloud <sub>         control GCP Cloud Run services (status / start / stop /
                      reset / rebuild) — see 'cura cloud --help'
  <trigger> [args]    any workflow with 'trigger: <name>' in its YAML can be
                      run as 'cura <name>' — shadows the built-ins above
  reinstall           re-run the current repo's scripts/reinstall.{sh,ps1}
  config [key] [val]  view or change persistent settings (~/.cura/config);
                      e.g. 'cura config ollama_model llama3.2'
  doctor [target]     verify deps (docker, ollama, repo, node)
  help                show this message

Run 'cura <command> --help' for command-specific options.

Note: cura-cli does NOT do git/GitHub work — use 'che' (che-cli) for that.

Environment:
  CURA_REPO              path to cura repo (default: auto-detect; fallback ~/workspace/misc/cura)
  CURA_COMPOSE_FILE      compose file for up/down (default: <repo>/docker-compose.local.yml)
  CURA_OLLAMA_HOST       Ollama base URL (default: http://localhost:11434)
  CURA_OLLAMA_MODEL      Ollama model (default: llama3.2)
  GCP_PROJECT            project ID for 'cura cloud' (falls back to 'gcloud config get-value project')
  GCP_REGION             region for 'cura cloud' (default: europe-west6)
`;

export async function run(_argv: string[]): Promise<number> {
  process.stdout.write(TEXT);
  return 0;
}
