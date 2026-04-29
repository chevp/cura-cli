# cura-cli

Cura dev-env CLI. **Builds on [che-cli](https://github.com/chevp/che-cli)** —
git/LLM/provider work is delegated to `che`, `cura` adds Cura-stack-specific
commands.

```sh
$ cura up                  # docker compose -f docker-compose.local.yml up -d
$ cura down
$ cura ship                # cd into the cura repo, then run `che ship`
$ cura doctor              # cura checks + 'che doctor'
```

> **Status:** v0.2 — Node.js + TypeScript port (was v0.1 Bash).
> See [SPEC.md](SPEC.md) and [§13 plans](../../context/plans/).
> **Requires:** [che-cli](https://chevp.github.io/che-cli/), `node >= 18`, `docker compose v2`.

---

## Install

```sh
git clone <cura-repo>
cd cura/tools/cura-cli
npm install -g .
```

That's it. `npm install -g .` builds the TypeScript via the `prepare` hook and
puts a `cura` executable in your npm global bin directory — which is already on
PATH on a normal Node install.

- **Windows:** `%APPDATA%\npm\cura.cmd` and `cura.ps1`
- **macOS / Linux:** symlink in `$(npm config get prefix)/bin/cura`

After install, run `cura doctor` to verify everything works.

---

## Auto-detection

cura is meant to "just work" — you don't need to set any env var.

When you run any `cura` command from inside the cura tree (or any sub-directory),
cura walks up to find the repo root (`CLAUDE.md` + `docker-compose.local.yml`)
and caches that location to `%LOCALAPPDATA%\cura\state.json` (Win) or
`~/.config/cura/state.json` (Unix).

On later invocations from outside the tree (e.g. `cura ship` from any cwd),
cura reads the cached path. You only need `CURA_REPO=…` if you have multiple
cura clones and want to point cura at a specific one.

---

## Commands

### `cura up` / `cura down`

Wrappers around `docker compose` for the Cura local stack. Extra args pass through.

```sh
cura up                    # = docker compose -f <repo>/docker-compose.local.yml up -d
cura up core-service       # only the core-service service
cura down -v               # also remove volumes
```

### `cura ship`

Runs `che ship` inside the cura repo — recursive add + commit + push,
including submodules. Works regardless of the current directory.

```sh
cura ship
```

### `cura doctor`

Aggregated health check. Runs Cura-specific checks (che on PATH, cura repo,
docker compose v2, node), then delegates to `che doctor` for git/provider/ollama checks.

```sh
cura doctor
cura doctor che            # only the che-cli check
cura doctor repo           # only the cura repo check
cura doctor compose        # only docker compose v2
cura doctor node           # only Node.js + npm
```

---

## Configuration

| Variable             | Default                                                                  |
|----------------------|--------------------------------------------------------------------------|
| `CURA_REPO`          | auto-detected (walk-up + cache); fallback `$HOME/workspace/misc/cura`    |
| `CURA_COMPOSE_FILE`  | `<CURA_REPO>/docker-compose.local.yml`                                   |
| `CHE_*`              | (passed through to `che`)                                                |

---

## Project layout

```
tools/cura-cli/
├── package.json             # bin: { cura: "dist/main.js" }, prepare: tsc
├── tsconfig.json
├── src/
│   ├── main.ts              # subcommand dispatcher
│   ├── repo.ts              # auto-detect + cache cura repo
│   ├── che.ts               # `che` lookup + spawn (Win .bat handling)
│   ├── docker.ts            # `docker compose` wrapper
│   └── commands/
│       ├── up.ts
│       ├── down.ts
│       ├── ship.ts
│       └── doctor.ts
├── README.md
└── SPEC.md
```

## Adding a new tool

1. Drop a new file at `src/commands/<name>.ts` exporting a default async function.
2. Wire it into the `switch` in [`src/main.ts`](src/main.ts).
3. Re-run `npm install -g .` (or `npm run build` if you're iterating).

## Positioning vs `che` and `gh`

cura-cli is a Cura-repo helper, **not** a competing general-purpose CLI:

- LLM provider routing, AI commit messages, git/GitHub work → stays in `che`.
- GitHub-API operations (PR, issue, release) → stays in `gh` or via `che`.
- cura-cli only adds Cura-specific glue (`up`/`down`/`ship`/`doctor`) on top.

If a feature would also be useful outside Cura, it belongs in `che`, not here.

## Related

- [che-cli](https://chevp.github.io/che-cli/) — the dependency this CLI builds on
- [cura-llm-local](https://chevp.github.io/cura-llm-local/) — local Ollama setup
