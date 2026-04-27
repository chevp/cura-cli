# cura-cli — SPEC v0.1 (Exploration, Mode B)

## Ziel
Cura-spezifische Dev-Env-Befehle, die `che-cli` als Dependency nutzen (nicht duplizieren).

## Approach: Subprocess-Wrap
`cura` ruft `che` als Kindprozess. Lose Kopplung. Wenn `che` nicht im `$PATH`,
exit 1 mit Hinweis auf `che-cli`. Alternativen B (source) und C (plugin)
verworfen — A bleibt am verständlichsten und respektiert "eigenes Binary".

## Subcommands (v0.1)

| Cmd | Wirkung | Baut auf |
|---|---|---|
| `cura up` | `docker compose -f $CURA_REPO/docker-compose.local.yml up -d` | — |
| `cura down` | analog `down` | — |
| `cura ship` | `cd $CURA_REPO && che ship` | `che ship` |
| `cura doctor` | Cura-Checks + `che doctor` | `che doctor` |
| `cura help` | usage | — |

**Out of v0.1:** `cura llm`, `cura deploy`, `cura test`.

## Layout

```
tools/cura-cli/
├── bin/cura
├── lib/cura/
│   ├── che.sh           # cura_require_che
│   ├── repo.sh          # cura_repo_check, $CURA_REPO
│   ├── doctor.sh        # cura doctor
│   ├── stack/up.sh      # cura up
│   ├── stack/down.sh    # cura down
│   └── git/ship.sh      # cura ship
├── install.sh           # → ~/.local/bin/cura + ~/.local/lib/cura/
├── README.md
└── SPEC.md
```

## Environment

- `CURA_REPO` (default: `$HOME/workspace/misc/cura`)
- `CURA_COMPOSE_FILE` (default: `$CURA_REPO/docker-compose.local.yml`)
- alle `CHE_*` werden von `che` selbst gelesen (provider routing)

## Acceptance Criteria

1. `cura doctor` läuft auf macOS grün, ruft `che doctor` als letzten Block.
2. `cura up` startet `docker-compose.local.yml` im `$CURA_REPO`.
3. `cura down` räumt den Stack auf.
4. `cura ship` führt `che ship` im `$CURA_REPO` aus, egal woher aufgerufen.
5. Fehlt `che` im `$PATH`, exit 1 mit Install-Hinweis.

## Kill Criteria

- Wenn `cura up` redundant zu einem `make`-Target im Cura-Repo wird → cura-cli auflösen, Aliases reichen.
- Wenn der Subprocess-Overhead von `che doctor` spürbar (>2s) → Approach B (source `~/.local/lib/che/`) erwägen.

## Challenger

**Top-3 Failure Modes**
1. `che` nicht installiert → klare Fehlermeldung, nicht cryptic exit.
2. `$CURA_REPO` falsch gesetzt → früh validieren (CLAUDE.md + compose-Datei prüfen).
3. `docker compose` v1 vs v2 Syntax-Drift → in `doctor` checken.

**Counter-Argument** — "Bash-Aliases reichen."
Stimmt für Solo-Use. Aber Doctor-Aggregation, Ship-Wrap und spätere
`cura llm` / `cura deploy`-Commands rechtfertigen ein eigenes Binary.

## Insights (Stand 2026-04-26 nach Prototype-Run)

- ✓ `cura doctor` ruft `che doctor` korrekt und ergänzt Cura-Checks (repo, compose v2, che-on-PATH).
- ✓ Fehlt `che` im `$PATH`, exit-Hinweis statt cryptic error — Failure Mode #1 aus dem Challenger validiert.
- ✓ `docker compose` v2 vorhanden (5.1.1) → Failure Mode #3 zur Kenntnis genommen, Check funktioniert.
- ⚠ `~/.local/bin` ist im Standard-Shell-PATH nicht enthalten — `install.sh` ergänzt es in `~/.zshrc` (analog `che-cli`), bestehende Shells brauchen ein Reload.
- ⏳ `cura up` / `cura down` / `cura ship` noch nicht durchlaufen — Acceptance #2-#4 werden beim ersten echten Run validiert.

**Offene Hypothesen für Production (G3):**
- `cura up` mit Subset-Args (`cura up core-service`) verhält sich wie erwartet.
- `cura ship` aus beliebigem `cwd` aufgerufen committet im richtigen Repo.