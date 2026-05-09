# cura-cli

Cura-spezifische Dev-Env-Befehle (Docker-Stack, Ollama-Setup, GCP Cloud Run,
`.che/workflows`-Runner). **Standalone, pure Node.js** — keine Abhängigkeit
auf `che-cli`, kein Python, kein `js-yaml`.

```sh
$ cura up                  # docker compose -f docker-compose.local.yml up -d
$ cura down
$ cura init                # provision local Ollama + pull model
$ cura cloud status        # show GCP Cloud Run state
$ cura run deploy-gcp      # execute .che/workflows/deploy-gcp.yml
$ cura doctor              # verify deps (docker, ollama, repo, node)
```

> **Status:** v0.3 — Cura-only. Git/GitHub-Commands wurden entfernt.
> **Requires:** `node >= 18`, `docker compose v2`. (Optional: `ollama`, `gcloud`, `gh`.)

**Git/GitHub-Workflows** (commit, push, PR, ...) gehören zu
[`che-cli`](https://chevp.github.io/che-cli/), nicht hierher.

---

## Install

```sh
git clone <cura-repo>
cd cura/tools/cura-cli
npm install -g .
```

`npm install -g .` baut das TypeScript via `prepare`-Hook und legt einen
`cura`-Executable in deinen npm-Global-Bin. Auf einem Standard-Node-Install ist
der bereits auf PATH:

- **Windows:** `%APPDATA%\npm\cura.cmd` und `cura.ps1`
- **macOS / Linux:** Symlink in `$(npm config get prefix)/bin/cura`

Nach dem Install: `cura doctor` zur Verifikation.

---

## Auto-Detection des Cura-Repos

cura ist gemeint zum "just work" — `CURA_REPO` muss nicht gesetzt werden.

Bei jedem Aufruf aus dem cura-Tree (oder Sub-Verzeichnis) walkt cura nach oben
und sucht das Repo-Root (`CLAUDE.md` + `docker-compose.local.yml`). Der Pfad
wird zu `%LOCALAPPDATA%\cura\state.json` (Win) bzw. `~/.config/cura/state.json`
(Unix) gecached. Aufrufe von ausserhalb des Trees lesen den Cache.

Nur bei mehreren cura-Clones explizit `CURA_REPO=…` setzen.

---

## Commands

### `cura up` / `cura down`

`docker compose`-Wrapper für den Cura-Local-Stack. Extra-Args werden
durchgereicht.

```sh
cura up                    # = docker compose -f <repo>/docker-compose.local.yml up -d
cura up core-service       # nur core-service
cura down -v               # auch Volumes entfernen
```

### `cura init`

Provisioniert das lokale Ollama-Setup: Binary prüfen, `ollama serve` starten,
`$CURA_OLLAMA_MODEL` pullen.

### `cura cloud <sub>`

Steuert die GCP Cloud Run Services. `GCP_PROJECT` wird gelesen aus:
1. ENV-Variable `GCP_PROJECT`
2. Fallback: `gcloud config get-value project`

```sh
cura cloud status          # URL, Ingress, IAP, Revision pro Service
cura cloud start           # cura-app + core-service public schalten
cura cloud stop            # Public-Ingress sperren (Services bleiben)
cura cloud reset --yes     # alle Services löschen
cura cloud rebuild         # gh workflow run deploy-gcp.yml
```

> **Hinweis:** `GCP_PROJECT` ist im cura-Repo als GitHub-Actions-Secret
> hinterlegt — Secrets sind aber **nicht** automatisch in deinem Terminal.
> Setze entweder `export GCP_PROJECT=<projekt-id>` oder
> `gcloud config set project <projekt-id>`.

### `cura workflow` / `cura run <name>`

Führt YAML-Workflows aus `.che/workflows/<name>.yml` aus. Steps referenzieren
existierende Skripte (`script:` + `args:` mit `${input}`-Substitution). Kein
Inline-Bash.

```sh
cura workflow list
cura workflow show deploy-gcp
cura workflow run deploy-gcp --GCP_PROJECT=cura-prod
cura run deploy-gcp                 # Alias
cura deploy-gcp                     # via 'trigger:' in YAML
```

### `cura status`

Übersicht: cura-cli Config (Ollama-Provider, ENV-Variablen), Plans aus
`.che/plans/`, GCP Cloud Run + Cyon-Probes (long mode, nur im cura-Repo).

```sh
cura status                # voll
cura status -s             # short — Config + Plans, kein Cloud/Cyon
```

### `cura doctor [target]`

Health-Check: Docker (Compose v2), Ollama (Binary + Server + Model), Cura-Repo,
Node.js + npm.

```sh
cura doctor                # alle
cura doctor docker         # nur Docker
cura doctor ollama         # nur Ollama
cura doctor repo           # nur Cura-Repo
cura doctor node           # nur Node.js + npm
```

### `cura config`

Persistente Settings in `~/.cura/config`. Explizite ENV-Variablen gewinnen
trotzdem.

```sh
cura config                            # listet alle
cura config ollama_model qwen2.5:0.5b
cura config ollama_host
cura config --unset ollama_model
cura config edit                       # öffnet im $EDITOR
```

### `cura reinstall`

Re-runs das repo-lokale `scripts/reinstall.{sh,ps1}`. Auf Windows wird `.ps1`
bevorzugt, sonst `.sh`. Walk-up nach `scripts/`-Verzeichnis.

---

## Configuration

| Variable             | Default                                                                  |
|----------------------|--------------------------------------------------------------------------|
| `CURA_REPO`          | auto-detected (walk-up + cache); fallback `$HOME/workspace/misc/cura`    |
| `CURA_COMPOSE_FILE`  | `<CURA_REPO>/docker-compose.local.yml`                                   |
| `CURA_OLLAMA_HOST`   | `http://localhost:11434`                                                 |
| `CURA_OLLAMA_MODEL`  | `llama3.2`                                                               |
| `GCP_PROJECT`        | (kein Default — Fallback auf `gcloud config get-value project`)          |
| `GCP_REGION`         | `europe-west6`                                                           |

---

## Project layout

```
tools/cura-cli/
├── package.json             # bin: { cura: "dist/main.js" }, prepare: tsc
├── tsconfig.json
├── src/
│   ├── main.ts              # subcommand dispatcher
│   ├── repo.ts              # auto-detect + cache cura repo
│   ├── docker.ts            # 'docker compose' wrapper
│   ├── gcp.ts               # GCP_PROJECT / gcloud helpers
│   ├── frontmatter.ts       # parse .che/plans frontmatter
│   ├── yaml.ts              # minimal YAML parser (no js-yaml dep)
│   ├── workflow/loader.ts   # .che/workflows resolver
│   ├── provider/ollama.ts   # local Ollama HTTP client
│   └── commands/
│       ├── up.ts / down.ts
│       ├── init.ts          # ollama provisioning
│       ├── cloud.ts         # GCP Cloud Run
│       ├── workflow.ts      # workflow runner
│       ├── status.ts / doctor.ts
│       ├── config.ts / reinstall.ts
│       └── help.ts
├── README.md
└── SPEC.md
```

## Adding a new tool

1. Drop `src/commands/<name>.ts` mit default-async-Function.
2. Wire es in den dispatch table in [`src/main.ts`](src/main.ts).
3. Re-run `npm install -g .` (oder `npm run build` während Iteration).

## Positioning vs `che`, `gh`, `git`

cura-cli ist ein **Cura-Repo-Helper**, kein Allzweck-CLI:

- Git/GitHub-Workflows (commit, push, PR, doctor-für-git) → **`che-cli`**.
- GitHub-API (PRs, Issues, Releases) → **`gh`** oder via `che`.
- Direktes Git → **`git`** selbst.
- cura-cli adds nur Cura-Stack-Glue: `up`/`down`/`init`/`cloud`/`workflow`/...

Wenn ein Feature auch ausserhalb des Cura-Repos nützlich wäre, gehört es nicht
hierher.

## Related

- [che-cli](https://chevp.github.io/che-cli/) — git/LLM/provider-CLI
- [cura-llm-local](https://chevp.github.io/cura-llm-local/) — lokales Ollama-Setup
