---
phase: quick-260429-ixg
plan: 01
subsystem: certificates
tags: [config, docker, secrets, hubject, env-vars]
requires:
  - 00_Base/src/config/defineConfig.ts (mergeConfigFromEnvVars, lines 82-84 falsy skip)
  - root .gitignore line 128 (.env glob)
provides:
  - operator-supplied Hubject creds via gitignored Server/.env
  - tracked Server/.env.example template
affects:
  - Server/docker-compose.yml (citrine.environment block)
tech-stack:
  added: []
  patterns:
    - compose default-empty interpolation `${VAR:-}` for safe missing-env passthrough
    - CITRINEOS_<UPPERCASED_DOTTED_PATH> env-var override of config.json
key-files:
  created:
    - Server/.env.example
  modified:
    - Server/docker-compose.yml
decisions:
  - Use `:-` default-empty syntax (not `${VAR}` or `${VAR?required}`) so missing Server/.env or unset keys don't error at compose-up; relies on defineConfig.ts:82-84 falsy skip to preserve config.json fallback
  - Do NOT touch root .gitignore — verified existing line 128 (`.env` no-leading-slash glob) already covers Server/.env
  - Do NOT create Server/.env in this plan — that's an operator-supplied file with real secrets
metrics:
  duration: 5min
  completed: 2026-04-29
---

# Quick Task 260429-ixg: Wire Hubject Credentials Through Env Var Summary

**One-liner:** Operator-supplied Hubject OAuth2 creds (clientId/clientSecret/tokenUrl) override `Server/data/config.json` via three new compose env passthroughs and a tracked `Server/.env.example` template; gitignored `Server/.env` is the operator's secret source.

## What Changed

### Server/docker-compose.yml

Added three lines to the `citrine.environment` block (between `BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH` and `depends_on:`), all using `:-` default-empty interpolation:

```diff
       BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH: '/data'
+      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID:-}
+      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET:-}
+      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL:-}
     depends_on:
```

### Server/.env.example (new file, tracked)

Created with placeholder-only values:

```
# Hubject Open Plug and Charge OAuth2 credentials.
# Copy this file to Server/.env and fill in real values.
# Server/.env is gitignored.
#
# These env vars override config.json on container boot via the
# CITRINEOS_<UPPERCASED_DOTTED_PATH> convention. See:
#   00_Base/src/config/defineConfig.ts (mergeConfigFromEnvVars)
#
# OAuth2 token endpoint. The default tokenUrl in Server/data/config.json
# points at a Stoplight docs page that returns a static demo JWT (expires
# every ~24h, currently expired since Dec 2025). For real credentials,
# set this to Hubject's actual auth endpoint, e.g. the issuer of the
# embedded demo JWT:
#   https://auth.eu.plugncharge.hubject.com/oauth/token
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL=
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID=
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET=
```

## Verification

### Task 1 (docker-compose.yml)

```
$ docker compose -f Server/docker-compose.yml config --quiet
$ echo $?
0
$ grep -c CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_ Server/docker-compose.yml
3
```

Resolved-config check (compose actually expands the `:-` interpolations into the merged service env block):

```
$ docker compose -f Server/docker-compose.yml config | \
    grep -E 'CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_(CLIENTID|CLIENTSECRET|TOKENURL)' | wc -l
3
```

### Task 2 (Server/.env.example + gitignore)

```
$ test -f Server/.env.example && echo OK
OK
$ grep -c '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_' Server/.env.example
3
$ grep -E '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_[A-Z]+=.+' Server/.env.example | wc -l
0
```

Verbatim `git check-ignore -v` output (confirms existing root `.gitignore` line 128 covers `Server/.env` — no `.gitignore` change required):

```
$ git check-ignore -v Server/.env
.gitignore:128:.env	Server/.env
$ echo $?
0

$ git check-ignore -v Server/.env.example
$ echo $?
1
```

`Server/.env` is gitignored (exit 0), `Server/.env.example` is tracked (exit 1).

### Whole-plan: no unintended files modified

```
$ git status --porcelain | grep -vE '^(.M| M|\?\?| A) (Server/docker-compose\.yml|Server/\.env\.example|\.planning/)' || echo "(no unintended changes)"
(no unintended changes)
```

## Commits

| Task | Description                                                | Commit     |
| ---- | ---------------------------------------------------------- | ---------- |
| 1    | feat(quick-260429-ixg): add Hubject env-var passthrough... | `a5f44354` |
| 2    | feat(quick-260429-ixg): add Server/.env.example template   | `42ba682a` |

## Operator Runbook

```
cp Server/.env.example Server/.env && $EDITOR Server/.env  # fill in Hubject creds, then docker compose up
```

When the operator runs `docker compose up`, compose reads `Server/.env` (because docker-compose.yml lives in `Server/` and compose auto-loads `.env` from the same directory), interpolates the three `${...:-}` references, and passes them through to the `citrine` service's env. Inside the container, `00_Base/src/config/defineConfig.ts:mergeConfigFromEnvVars` walks the `CITRINEOS_<UPPERCASED_DOTTED_PATH>` variables, skips empty values (lines 82-84), and overrides the matching keys in the loaded `config.json` (`util.certificateAuthority.v2gCA.hubject.{clientId,clientSecret,tokenUrl}`).

If the operator skips creating `Server/.env`, all three vars resolve to empty strings via `:-`, the falsy-skip in defineConfig leaves the existing config.json placeholder values in place, and the container boots without errors.

## Deviations from Plan

None — plan executed exactly as written. Two atomic commits, no auto-fixes needed, no checkpoints, no auth gates.

## Self-Check: PASSED

- Server/docker-compose.yml: FOUND (modified, 3 inserted lines)
- Server/.env.example: FOUND (new file, 17 lines)
- Commit a5f44354: FOUND in `git log`
- Commit 42ba682a: FOUND in `git log`
- All 5 whole-plan verification checks pass
- No stubs introduced (file is config-only, no code paths)
- No new threat surface introduced (env var passthrough is the *removal* of a hardcoded placeholder secret risk; the existing CITRINEOS_<...> mechanism is unchanged)
