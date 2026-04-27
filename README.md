# cura-cli

Cura dev-env CLI. **Builds on [che-cli](https://github.com/chevp/che-cli)** —
git/LLM/provider work is delegated to `che`, `cura` adds Cura-stack-specific
commands.

```sh
$ cura up                  # docker compose -f docker-compose.local.yml up -d
$ cura down
$ cura ship                # cd $CURA_REPO && che ship  (recursive add+commit+push)
$ cura doctor              # cura checks + 'che doctor'
```

> **Status:** Exploration v0.1 — see [SPEC.md](SPEC.md).
> **Requires:** [che-cli](https://chevp.github.io/che-cli/) installed first.

---

## Install

```sh
git clone https://github.com/chevp/cura-cli.git
cd cura-cli
./install.sh
```

This installs:

- `~/.local/bin/cura`     — the dispatcher
- `~/.local/lib/cura/`    — full subcommand tree

After installing, run **`cura doctor`** to verify everything works.

**Requirements:** `bash`, `docker compose` v2, and **`che-cli`** on `$PATH`.

---

## Commands

### `cura up` / `cura down`

Wrappers around `docker compose` for the Cura local stack. Extra args pass through.

```sh
cura up                    # = docker compose -f $CURA_REPO/docker-compose.local.yml up -d
cura up core-server        # only the core-server service
cura down -v               # also remove volumes
```

### `cura ship`

`cd`s into `$CURA_REPO` and runs `che ship` — recursive add + commit + push,
including submodules. Works regardless of the current directory.

```sh
cura ship
```

### `cura doctor`

Aggregated health check. Runs Cura-specific checks (repo, compose v2, che on
`$PATH`), then delegates to `che doctor` for git/provider/ollama checks.

```sh
cura doctor
cura doctor che            # only the che-cli check
cura doctor repo           # only $CURA_REPO checks
cura doctor compose        # only docker compose v2
```

---

## Configuration

| Variable             | Default                                   |
|----------------------|-------------------------------------------|
| `CURA_REPO`          | `$HOME/workspace/misc/cura`               |
| `CURA_COMPOSE_FILE`  | `$CURA_REPO/docker-compose.local.yml`     |
| `CHE_*`              | (passed through to `che`)                 |

---

## Project layout

```
cura-cli/
├── bin/cura                  # dispatcher
├── lib/cura/
│   ├── che.sh                # cura_require_che
│   ├── repo.sh               # cura_repo_check, $CURA_REPO
│   ├── doctor.sh
│   ├── stack/up.sh
│   ├── stack/down.sh
│   └── git/ship.sh
├── install.sh
├── README.md
└── SPEC.md                   # exploration deliverable
```

## Adding a new tool

1. Drop a script at `lib/cura/<topic>/<name>.sh`.
2. Add a `case` arm in `bin/cura` that execs it.
3. Re-run `./install.sh`.

## Related

- [che-cli](https://chevp.github.io/che-cli/) — the dependency this CLI builds on
- [cura-llm-local](https://chevp.github.io/cura-llm-local/) — local Ollama setup
