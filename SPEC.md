# cura-cli — SPEC v0.2 (Node.js + TypeScript Port)

## Ziel

Cura-spezifische Dev-Env-Befehle, die `che-cli` als Dependency nutzen (nicht duplizieren). Plattform-konsistent auf Windows + macOS.

## Approach: Subprocess-Wrap (unverändert ggü. v0.1)

`cura` ruft `che` und `docker` als Kindprozess (`child_process.spawn`). Lose Kopplung. Wenn `che` nicht auffindbar, exit 1 mit Hinweis auf `che-cli`.

**Sprache:** Node.js + TypeScript. Ein Codebase, ein Verhalten auf Win + Mac. Build via `tsc`, ausgeliefert über `npm install -g`.

## Subcommands (v0.2 — gleiche Surface wie v0.1)

| Cmd | Wirkung | Baut auf |
|---|---|---|
| `cura up [args]` | `docker compose -f $CURA_COMPOSE_FILE up -d [args]` | — |
| `cura down [args]` | analog `down` | — |
| `cura ship [args]` | `cd $CURA_REPO && che ship [args]` | `che ship` |
| `cura doctor [target]` | Cura-Checks (che/repo/compose/node) + `che doctor` | `che doctor` |
| `cura help` | usage | — |

**Out of v0.2:** `cura llm`, `cura deploy`, `cura test`, `gh`-Anbindung, plugin-Mechanismus. cura-cli ist Helper für Cura-Repo, kein Allzweck-CLI.

## Layout

```
tools/cura-cli/
├── package.json             # bin: { cura: "dist/main.js" }, prepare: tsc
├── tsconfig.json
├── src/
│   ├── main.ts              # Dispatcher
│   ├── repo.ts              # Auto-Detect + Cache
│   ├── che.ts               # Lookup + Spawn (Win .bat/.ps1 handling)
│   ├── docker.ts            # docker compose Wrapper
│   └── commands/{up,down,ship,doctor}.ts
├── README.md
└── SPEC.md
```

## Auto-Detection (neu in v0.2)

cura läuft "im Hintergrund" — User muss `CURA_REPO` nicht setzen.

1. Wenn `CURA_REPO` gesetzt → use it.
2. Sonst walk-up von `process.cwd()` bis ein Verzeichnis mit `CLAUDE.md` + `docker-compose.local.yml` gefunden ist → use it + cache it.
3. Sonst lies aus Cache (`%LOCALAPPDATA%\cura\state.json` auf Win, `~/.config/cura/state.json` sonst).
4. Sonst Fallback auf `$HOME/workspace/misc/cura` (kann fehlen → `validateCuraRepo` exit 1 mit Hinweis).

Kein Echo von Absolute-Paths in der Operation. Die CLI ist deliberately quiet — `docker compose`-Output und `che`-Output streamen direkt durch (`stdio: inherit`).

## Environment

- `CURA_REPO` (default: auto-detect; Fallback `$HOME/workspace/misc/cura`)
- `CURA_COMPOSE_FILE` (default: `$CURA_REPO/docker-compose.local.yml`)
- alle `CHE_*` werden von `che` selbst gelesen

## Acceptance Criteria

1. `cura doctor` läuft auf Windows + macOS grün, ruft `che doctor` als letzten Block.
2. `cura up [service]` startet `docker-compose.local.yml` mit Pass-Through-Args.
3. `cura down [-v ...]` räumt den Stack auf mit Pass-Through-Args.
4. `cura ship` führt `che ship` im `$CURA_REPO` aus, egal woher aufgerufen.
5. Fehlt `che` im `$PATH`, exit 1 mit Install-Hinweis.
6. **Neu in v0.2:** `cura up` aus frischer Win-PowerShell-Session funktioniert (kein PATH-Edit nötig — `npm install -g` legt `cura.cmd` auto auf PATH).
7. **Neu in v0.2:** `npm install -g .` ist idempotent.

Plattform-Scope: **Windows + macOS first-class**. Linux out of scope (G1-Entscheid 2026-04-29 in [§13.1](../../context/plans/§13.1_problem-statement-cura-cli.ctx.md)).

## Kill Criteria

- macOS-Smoke-Test fehlschlagend → eigener `install.sh` mit `~/.local/bin/`-Symlink.
- DEP0190-Quoting-Bug trotz `which`-Resolve → `commander` als Dep.
- `cura ship` aus tooling-cwd nicht im Repo-Root → `spawn(..., { cwd: CURA_REPO })` statt `process.chdir`.

## Insights aus G2-Empirik (2026-04-29)

- `che` ist auf Win bereits fully shimmed (`che.bat`, `che.ps1`, Bash-`che` parallel) — kein `bash -lc`-Fallback nötig.
- npm-Prefix `%APPDATA%\npm\` ist beim Default-Node-Install schon auf User-PATH — `npm install -g .` reicht für Distribution.
- Node v24 wirft DEP0190 bei `spawn(cmd, args, { shell: true })`. Mitigation: für `.bat`/`.cmd`-Targets explizit `spawn("cmd.exe", ["/c", absPath, ...args])`, sonst `spawn(absPath, args)` ohne shell.
- Auto-Detect via walk-up + State-Cache eliminiert die "set CURA_REPO every session"-Friktion.

Vollständige Insights: [§13.2_insights.md](../../context/plans/§13.2_insights.md).

## Challenger

**Top-3 Failure Modes** (siehe [§13.2 §4.1](../../context/plans/§13.2_cura-cli-node-port.exp.md)):

1. `prepare`-Hook tsc-Fehler → halber Install. **Mitigation:** `tsc --noEmitOnError`.
2. `spawn` mit `shell: true` und Args mit Leerzeichen → DEP0190-Quoting-Bug. **Mitigation:** `which`-Resolve + `cmd.exe /c` für `.bat`-Targets.
3. `cura ship` aus tooling-cwd shipped falschen Sub-Dir. **Mitigation:** `spawn(..., { cwd: CURA_REPO })`.

**Counter-Argument** — "ein 30-Zeilen-`install.ps1` mit `cura.cmd`-Wrapper hätte gereicht."
Stimmt funktional, aber: TypeScript-Codebase reduziert Maintenance-Last bei wachsender Surface, npm-Distribution ist bewährt, Node ist auf Cura-Dev-Maschinen ohnehin Voraussetzung.
