# cura-cli — SPEC v0.3 (Cura-only, standalone)

## Ziel

Cura-spezifische Dev-Env-Befehle. Standalone Node.js + TypeScript, **keine
`che-cli`-Abhängigkeit, kein Python, kein `js-yaml`**. Plattform-konsistent
auf Windows + macOS.

## Scope-Trennung — was gehört NICHT hierher

cura-cli macht **kein** Git/GitHub. Alles, was über die Cura-spezifische
Dev-Env hinausgeht, gehört in `che-cli` (Git/LLM/Provider) bzw. `gh` oder
`git` direkt:

- ❌ `cura ship`, `cura commit`, `cura status` (git-Teil), `cura explain`
  → in v0.3 entfernt. `che ship` / `che commit` / `che status`.
- ❌ AI-Commit-Messages, Git-Failure-Diagnose, Submodule-Recursion
  → in `che-cli`.
- ✓ Was bleibt: Docker-Stack, Ollama-Setup, GCP Cloud Run,
  `.che/workflows`-Runner, Plan-Listing, Health-Checks.

## Approach: Subprocess-Wrap

`cura` ruft `docker`, `ollama`, `gcloud`, optional `gh` als Kindprozess
(`child_process.spawn`). Lose Kopplung. **Keine Abhängigkeit auf `che`.**

**Sprache:** Node.js + TypeScript. Pure Node, keine Runtime-Deps. Build via
`tsc`, ausgeliefert über `npm install -g`.

## Subcommands (v0.3)

| Cmd | Wirkung | Externe Tools |
|---|---|---|
| `cura up [args]` | `docker compose -f $CURA_COMPOSE_FILE up -d [args]` | docker |
| `cura down [args]` | analog `down` | docker |
| `cura init` | provision local Ollama (binary, server, pull model) | ollama |
| `cura cloud <sub>` | GCP Cloud Run status/start/stop/reset/rebuild | gcloud, optional gh |
| `cura workflow <sub>` / `cura run <name>` | execute `.che/workflows/<name>.yml` | bash (für `.sh`-Steps) |
| `cura status` | cura-cli config + plans + cloud + cyon | optional gcloud |
| `cura doctor [target]` | docker / ollama / repo / node Health-Checks | docker, ollama |
| `cura config [k] [v]` | persistente Settings in `~/.cura/config` | — |
| `cura reinstall [args]` | walk-up `scripts/reinstall.{sh,ps1}` ausführen | bash bzw. pwsh |
| `cura help` | usage | — |

**Out of v0.3:** alle git/github-spezifischen Commands, `cura llm`,
`cura deploy`, `cura test`, plugin-Mechanismus.

## Layout

```
tools/cura-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts              # Dispatcher (mit workflow-trigger-shadowing)
│   ├── repo.ts              # Auto-Detect + Cache des Cura-Repos
│   ├── docker.ts            # docker compose Wrapper
│   ├── gcp.ts               # GCP_PROJECT / gcloud helpers
│   ├── spawn.ts             # cross-platform child_process (Win .cmd/.bat)
│   ├── platform.ts          # darwin / windows / wsl / linux Detection
│   ├── frontmatter.ts       # .che/plans/*.md frontmatter
│   ├── yaml.ts              # eigener YAML-Parser (zero-runtime-deps)
│   ├── workflow/loader.ts   # .che/workflows Resolver + Validator
│   ├── provider/ollama.ts   # local Ollama HTTP client
│   ├── ui.ts / prompt.ts    # ANSI colors, readline prompts
│   └── commands/{up,down,init,cloud,workflow,status,doctor,config,reinstall,help}.ts
├── README.md
└── SPEC.md
```

## Auto-Detection des Cura-Repos

cura läuft "im Hintergrund" — User muss `CURA_REPO` nicht setzen.

1. Wenn `CURA_REPO` gesetzt → use it.
2. Sonst walk-up von `process.cwd()` bis `CLAUDE.md` + `docker-compose.local.yml`
   gefunden ist → use it + cache it.
3. Sonst lies aus Cache (`%LOCALAPPDATA%\cura\state.json` Win, `~/.config/cura/state.json` sonst).
4. Sonst Fallback auf `$HOME/workspace/misc/cura` (kann fehlen → `validateCuraRepo` exit 1).

## GCP_PROJECT Resolution

`cura cloud` und `cura status` brauchen `GCP_PROJECT`. Auflösung in dieser
Reihenfolge:

1. ENV-Variable `GCP_PROJECT`
2. Fallback: `gcloud config get-value project` (gecached für die Dauer eines Runs)
3. Sonst: hartes exit 1 mit beiden Setup-Hints.

`GCP_PROJECT` ist im cura-Repo als GitHub-Actions-Secret hinterlegt — Secrets
sind aber **nicht** automatisch in der lokalen Shell verfügbar. Der gcloud-
Fallback macht `cura cloud` nach `gcloud config set project <id>` direkt
benutzbar, ohne dass der User einen ENV-Export pflegen muss.

## Environment

- `CURA_REPO` — auto-detect; Fallback `$HOME/workspace/misc/cura`
- `CURA_COMPOSE_FILE` — `<CURA_REPO>/docker-compose.local.yml`
- `CURA_OLLAMA_HOST` — `http://localhost:11434`
- `CURA_OLLAMA_MODEL` — `llama3.2`
- `GCP_PROJECT` — kein Default (Fallback `gcloud config get-value project`)
- `GCP_REGION` — `europe-west6`

## Plattform-Scope

**Windows + macOS first-class.** Linux best-effort (G1-Entscheid 2026-04-29).

Cross-platform-Notes:
- `spawn.ts`: auf Win `.cmd`/`.bat` über `cmd.exe /c` (CVE-2024-27980-Mitigation),
  `where` zur Resolution, `which` auf Unix.
- `reinstall.ts`: `.ps1` bevorzugt auf Win (via `pwsh`/`powershell`), sonst `.sh` via `bash`.
- `repo.ts`: State-Cache in `%LOCALAPPDATA%\cura` bzw. `$XDG_CONFIG_HOME/cura`.
- `config.ts`: `$EDITOR` auf Unix, `notepad` auf Win.
- `workflow/loader.ts`: Steps sind `.sh`-Skripte → auf Win brauchst du Git-Bash
  oder WSL. Dokumentiert, nicht abstrahiert.

## Acceptance Criteria

1. `cura doctor` läuft auf Windows + macOS grün.
2. `cura up [service]` startet `docker-compose.local.yml` mit Pass-Through-Args.
3. `cura down [-v ...]` räumt den Stack auf mit Pass-Through-Args.
4. `cura cloud status` liefert valid output mit `GCP_PROJECT` ENV **oder** mit
   `gcloud config set project` (kein ENV-Export nötig).
5. `cura run <name>` führt `.che/workflows/<name>.yml` aus (bash-Steps).
6. **Keine** Referenzen auf `che`, `git`, `gh` ausserhalb von:
   - `gh` für `cura cloud rebuild` (triggert GitHub-Actions-Deploy-Workflow)
   - `bash` für Workflow-Steps und `scripts/reinstall.sh`
7. `npm install -g .` ist idempotent und macht keinen weiteren Setup nötig.

## Kill Criteria

- macOS-Smoke-Test fehlschlagend → eigener `install.sh`.
- DEP0190-Quoting-Bug auf Win trotz `where`-Resolve → `commander` als Dep
  (würde aber zero-runtime-deps brechen — letzte Option).
- Workflow-Bash-Steps auf Win unbenutzbar → entweder PowerShell-Branch in
  `workflow/loader.ts` oder reine `.ps1`-Steps in `.che/workflows/`.

## Versions-History

- **v0.1** (Bash) — initial; rief `che` direkt.
- **v0.2** (Node.js + TS) — Port; immer noch `che`-Wrapper für `ship`/`doctor`.
- **v0.3** — git/github-Commands raus, `che`-Abhängigkeit gestrichen,
  Cura-only Surface, `gcloud config`-Fallback für `GCP_PROJECT`.
