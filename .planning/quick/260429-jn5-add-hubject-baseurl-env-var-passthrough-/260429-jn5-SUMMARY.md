---
phase: quick-260429-jn5
plan: 01
subsystem: infra
tags: [docker, compose, env-vars, hubject, oauth2, certificates, v2g, v2x]

requires:
  - phase: quick-260429-ixg
    provides: CLIENTID/CLIENTSECRET/TOKENURL env-var passthrough in docker-compose + .env.example template
provides:
  - "BASEURL env-var passthrough on Server/docker-compose.yml citrine.environment (closes the gap missed by 260429-ixg)"
  - "BASEURL placeholder + override-guidance comment block in Server/.env.example"
  - "Operator runbook: setting CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL in Server/.env now reaches the Hubject OAuth2 audience field"
affects: [v2x-discharge-testing, oauth2-credential-flow, hubject-integration]

tech-stack:
  added: []
  patterns:
    - "Env-var override of config.json via CITRINEOS_<UPPERCASED_DOTTED_PATH> (existing, reused)"
    - "compose default-empty interpolation (`${VAR:-}`) for safe optional passthrough (existing, reused)"

key-files:
  created: []
  modified:
    - Server/docker-compose.yml
    - Server/.env.example

key-decisions:
  - "Insert BASEURL alphabetically first within the four-key Hubject group in compose; do NOT re-order existing TOKENURL/CLIENTID/CLIENTSECRET keys in .env.example (alphabetical drift on the existing three is out of scope for this quick task)"
  - "Comment in .env.example explicitly names US QA (https://us.plugncharge-qa.hubject.com) so the operator who hit the original 403 finds themselves in the example"
  - "Empty-value passthrough is safe — defineConfig.ts:82-84 skips falsy values, so config.json baseUrl default (open.plugncharge-test.hubject.com) still wins when Server/.env lacks BASEURL"

patterns-established: []

requirements-completed: [QUICK-260429-JN5]

duration: 2min
completed: 2026-04-29
---

# quick-260429-jn5: Hubject BASEURL env-var passthrough Summary

**Closed the env-var override gap left by 260429-ixg: operators on US/EU QA or prod Hubject envs can now set `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL` in `Server/.env` and the value reaches the Hubject OAuth2 client's `audience` field instead of being silently dropped.**

## Performance

- **Duration:** 2min
- **Started:** 2026-04-29T19:12:09Z
- **Completed:** 2026-04-29T19:14:27Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- **Compose passthrough wired:** `Server/docker-compose.yml` `citrine.environment` block now lists all four Hubject env vars (BASEURL, CLIENTID, CLIENTSECRET, TOKENURL) in alphabetical order with `${VAR:-}` default-empty interpolation. End-to-end smoke test confirms `BASEURL=https://us.plugncharge-qa.hubject.com` from the operator's `Server/.env` now resolves through to the citrine service environment.
- **Template documents the override:** `Server/.env.example` gained a 4-line comment block explaining when to override (test default → US/EU QA / prod) and a `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL=` empty placeholder positioned alphabetically first in the four-key Hubject group.
- **Root cause closed:** 260429-ixg shipped CLIENTID/CLIENTSECRET/TOKENURL but missed BASEURL. Without this passthrough, an operator's `Server/.env` BASEURL was silently dropped by compose (compose does NOT auto-inject `.env` into containers — vars must be in `environment:`), so the config.json default (`https://open.plugncharge-test.hubject.com`) won and Hubject responded with `403 access_denied: Service not enabled within domain` on US QA. This plan fixes that.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add BASEURL passthrough to Server/docker-compose.yml citrine.environment block** — `1905267c` (feat)
2. **Task 2: Add BASEURL placeholder + override-guidance comment to Server/.env.example** — `4d8b0ba8` (docs)

## Exact Diffs Applied

### `Server/docker-compose.yml` (one-line diff)

```diff
@@ -101,6 +101,7 @@ services:
       # CITRINEOS_CONFIG_DIR: '/custom/config/path'  # Optional - uncomment if needed
       BOOTSTRAP_CITRINEOS_FILE_ACCESS_TYPE: 'local'
       BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH: '/data'
+      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL:-}
       CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID:-}
       CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET:-}
       CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL:-}
```

Resulting alphabetical order of the four Hubject keys in `citrine.environment`: **BASEURL → CLIENTID → CLIENTSECRET → TOKENURL**. Pure insertion, zero deletions.

### `Server/.env.example` (insertion: 4 comment lines + BASEURL key)

```diff
@@ -12,6 +12,12 @@
 # set this to Hubject's actual auth endpoint, e.g. the issuer of the
 # embedded demo JWT:
 #   https://auth.eu.plugncharge.hubject.com/oauth/token
+#
+# Hubject base URL (OAuth2 audience + REST root). Default in
+# Server/data/config.json is the Open Plug and Charge TEST env:
+# https://open.plugncharge-test.hubject.com — override for US QA
+# (https://us.plugncharge-qa.hubject.com), EU QA, or prod.
+CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL=
 CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL=
 CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID=
 CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET=
```

Final `Server/.env.example` end-of-file ordering of the four KEY= lines:
1. `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL=`
2. `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL=`
3. `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID=`
4. `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET=`

The existing TOKENURL/CLIENTID/CLIENTSECRET lines and ordering are unchanged — alphabetical drift on those three is out of scope for this quick task.

## End-to-End Verification

`docker compose -f Server/docker-compose.yml config | grep CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_` (with operator's actual `Server/.env` in place):

```
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL: https://us.plugncharge-qa.hubject.com
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID: yFEa9FnAjCzdiArrf64iBzKVuoSm9KkQ
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET: U7uaZ_KzzUQpvSTKZBcsNMPyUmKvNQ0mOJoaG-G31WVlkUx3BMmKSpkOZv4sBHvP
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL: https://auth.us.plugncharge.hubject.com/oauth/token
```

All four Hubject keys reach the citrine service env, with BASEURL resolving to the operator's US QA value — exactly the override path that `02_Util/src/certificate/client/hubject.ts:227-241` consumes as the OAuth2 `audience`. The `403 access_denied: Service not enabled within domain: https://open.plugncharge-test.hubject.com` should no longer occur.

## Whole-Plan Verification Checks

| # | Check | Result |
|---|-------|--------|
| 1 | `docker compose -f Server/docker-compose.yml config --quiet` exits 0 | PASS |
| 2 | All four Hubject keys reach citrine service env (count=4) | PASS |
| 3 | `Server/.env.example` has 4 Hubject keys, all with empty values | PASS |
| 4 | End-to-end: BASEURL=https://us.plugncharge-qa.hubject.com from `Server/.env` resolves through compose | PASS |
| 5 | `Server/.env` is gitignored, `Server/.env.example` is tracked | PASS |
| 6 | Only intended files modified for this plan (compose BASEURL line, .env.example block) | PASS |

## Operator Runbook Delta from 260429-ixg

`Server/.env` (gitignored, operator-supplied) should now include a fourth line for non-test Hubject envs:

```
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL=https://us.plugncharge-qa.hubject.com
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL=https://auth.us.plugncharge.hubject.com/oauth/token
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID=<operator-issued client_id>
CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET=<operator-issued client_secret>
```

Operators on the default Hubject test env can leave BASEURL unset — compose `:-` resolves to empty, `defineConfig.ts:82-84` skips the empty value, and `Server/data/config.json` `baseUrl` default (`https://open.plugncharge-test.hubject.com`) wins. No regression for default-test-env operators.

## Decisions Made

- Insert BASEURL alphabetically first within the four-key Hubject group in compose; do NOT re-order existing TOKENURL/CLIENTID/CLIENTSECRET keys in `.env.example` (alphabetical drift on the existing three is out of scope — would muddy the diff).
- Empty placeholder for BASEURL in `.env.example` (no real URL even though it's not a secret) — preserves the "all empty" pattern and signals "operator must fill in" consistently across all four keys.
- Comment in `.env.example` explicitly names `us.plugncharge-qa.hubject.com` so the user who hit the 403 finds themselves in the example — Hubject's "test vs. QA vs. prod" landscape isn't obvious from config.json's single-default world.

## Deviations from Plan

None — plan executed exactly as written.

## Files Created/Modified

- `Server/docker-compose.yml` — Added BASEURL env-var passthrough line in `citrine.environment`, alphabetically first of the four Hubject keys (BASEURL → CLIENTID → CLIENTSECRET → TOKENURL).
- `Server/.env.example` — Added a 4-line override-guidance comment block + empty `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_BASEURL=` placeholder, positioned alphabetically first in the four-key Hubject group. Existing TOKENURL/CLIENTID/CLIENTSECRET lines unchanged.

## Out-of-Scope Notes

- Pre-existing local modifications to `Server/docker-compose.yml` (HASURA_GRAPHQL_MIGRATIONS_SERVER_TIMEOUT) and `package-lock.json` were present in the worktree at task start (visible in initial git status snapshot). They were left untouched and not committed by this plan — staging used a per-hunk patch to isolate the BASEURL line. These are out of scope for quick-260429-jn5.
- Alphabetical re-ordering of the existing three `Server/.env.example` keys (TOKENURL/CLIENTID/CLIENTSECRET → CLIENTID/CLIENTSECRET/TOKENURL) is out of scope per plan instructions.

## Self-Check: PASSED

- `Server/docker-compose.yml` BASEURL line: FOUND
- `Server/.env.example` BASEURL placeholder: FOUND
- Commit `1905267c` (Task 1 — feat compose): FOUND
- Commit `4d8b0ba8` (Task 2 — docs .env.example): FOUND
- Compose validates with empty env: PASS
- Compose resolves all 4 Hubject keys to citrine service: PASS (4/4)
- `.env.example` has 4 keys, all empty: PASS
- US QA override target documented in `.env.example` comment: PASS
- `Server/.env.example` remains tracked (not gitignored): PASS
