---
phase: quick-260429-ixg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - Server/docker-compose.yml
  - Server/.env.example
autonomous: true
requirements:
  - QUICK-260429-IXG
must_haves:
  truths:
    - "Operator can set Hubject clientId, clientSecret, and tokenUrl via Server/.env without committing secrets"
    - "Container boot reads CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_* env vars and overrides config.json values"
    - "Missing or empty env vars do not error at boot (compose :- default + defineConfig empty-value skip)"
    - "Server/.env is excluded from git (verified via git check-ignore)"
    - "Server/.env.example is tracked and contains placeholders only (no real secrets)"
  artifacts:
    - path: "Server/docker-compose.yml"
      provides: "citrine.environment passthrough for the three Hubject env vars"
      contains: "CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID"
    - path: "Server/.env.example"
      provides: "Tracked template for Server/.env (placeholders only)"
      contains: "CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL="
  key_links:
    - from: "Server/.env (operator-supplied, gitignored)"
      to: "compose citrine.environment"
      via: "compose default-empty interpolation in docker-compose.yml"
      pattern: "CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID"
    - from: "container env"
      to: "merged runtime config"
      via: "00_Base/src/config/defineConfig.ts mergeConfigFromEnvVars (skips empty values at lines 82-84)"
      pattern: "if \\(!value\\)"
---

<objective>
Wire Hubject Open Plug and Charge OAuth2 credentials (clientId, clientSecret, tokenUrl) through environment variables instead of committing them to `Server/data/config.json`. This keeps real secrets out of git while preserving the existing config.json placeholders as a fallback.

Purpose: Operator hygiene. The live `Server/data/config.json` currently contains placeholder/demo Hubject creds that are tracked in git. Switching to env-var-driven overrides via the existing `CITRINEOS_<UPPERCASED_DOTTED_PATH>` mechanism (`00_Base/src/config/defineConfig.ts`) lets operators supply real creds via a gitignored `Server/.env` file.

Output: Two file changes. `Server/docker-compose.yml` gets three new entries in `citrine.environment`, and `Server/.env.example` is created as a tracked template with placeholder values. No `.gitignore` change required (verified during planning: existing root `.gitignore` line 128 `.env` glob matches `Server/.env`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
Key contracts the executor needs. Extracted from codebase. Use these directly, no exploration needed.

From `00_Base/src/config/defineConfig.ts` (mergeConfigFromEnvVars), the env-var override mechanism:
- Env var name convention: `CITRINEOS_<UPPERCASED_DOTTED_PATH>`
  Example: `util.certificateAuthority.v2gCA.hubject.clientId` becomes `CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID`
- Empty values are skipped at lines 82-84, so the compose default-empty passthrough is safe when `Server/.env` is missing or a key is unset:
  ```typescript
  if (!value) {
    continue;
  }
  ```

From `Server/docker-compose.yml` (current state, lines 88-104), the `citrine.environment` block ends with:
```yaml
      BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH: '/data'
    depends_on:
```

From repo root `.gitignore` line 128: `.env` (no leading slash, globs at any depth, matches `Server/.env`).
Verified during planning: `git check-ignore -v Server/.env` reports `.gitignore:128:.env	Server/.env`. Already covered, no change needed.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Hubject env-var passthrough to Server/docker-compose.yml</name>
  <files>Server/docker-compose.yml</files>
  <action>
In `Server/docker-compose.yml`, locate the `citrine.environment` block. After the existing line:

```
      BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH: '/data'
```

(currently line 103), and immediately before the `    depends_on:` line (currently line 104), insert these three lines using the same 6-space indentation that matches the surrounding entries:

```
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID:-}
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET:-}
      CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL: ${CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL:-}
```

Use the `:-` default-empty interpolation syntax (default to empty string when the var is unset). This is critical — without `:-`, compose errors when `Server/.env` is missing the var. The empty-string passthrough is safe because `00_Base/src/config/defineConfig.ts:82-84` skips falsy values, so the existing config.json value is preserved when the env var is empty.

Do NOT modify any other lines. Do NOT touch `Server/data/config.json`. Do NOT create `Server/.env`.
  </action>
  <verify>
    <automated>docker compose -f Server/docker-compose.yml config --quiet &amp;&amp; test "$(grep -c CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_ Server/docker-compose.yml)" = "3"</automated>
  </verify>
  <done>
- `docker compose -f Server/docker-compose.yml config --quiet` exits 0 (compose file is valid YAML and resolves all interpolations)
- `grep -c CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_ Server/docker-compose.yml` reports `3`
- The three new lines appear inside the `citrine.environment` block (between `BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH` and `depends_on:`), all using `:-` default-empty syntax
- No other lines in `Server/docker-compose.yml` were modified (`git diff Server/docker-compose.yml` shows only the 3 added lines)
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Server/.env.example template and verify gitignore covers Server/.env</name>
  <files>Server/.env.example</files>
  <action>
Create `Server/.env.example` as a tracked template (placeholders only, NO real credentials) with this exact content:

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

All three values MUST be empty (placeholders only). Do NOT create `Server/.env` itself — that is the operator's job and must hold real secrets.

Then verify `.gitignore` covers `Server/.env`. The verification was performed during planning and confirmed:

```
$ git check-ignore -v Server/.env
.gitignore:128:.env	Server/.env
```

The repo root `.gitignore` line 128 (`.env` with no leading slash) globs at any depth and matches `Server/.env`. NO `.gitignore` change is needed. Re-run the verification to confirm, and capture the result verbatim in the task SUMMARY's "verification" section.

Also run `git check-ignore -v Server/.env.example` after creating the file. It should exit non-zero (file is NOT ignored). The template must be tracked.
  </action>
  <verify>
    <automated>test -f Server/.env.example &amp;&amp; grep -q '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_TOKENURL=$' Server/.env.example &amp;&amp; grep -q '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTID=$' Server/.env.example &amp;&amp; grep -q '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_CLIENTSECRET=$' Server/.env.example &amp;&amp; git check-ignore -q Server/.env &amp;&amp; ! git check-ignore -q Server/.env.example</automated>
  </verify>
  <done>
- `Server/.env.example` exists with the exact comment header and the three KEY= lines (empty values)
- All three keys grep-match with empty RHS (no real secrets accidentally committed)
- `git check-ignore -q Server/.env` exits 0 (file would be ignored if created)
- `git check-ignore -q Server/.env.example` exits 1 (template is tracked, not ignored)
- SUMMARY records the `git check-ignore -v Server/.env` output verbatim, confirming the existing rule (`.gitignore:128:.env`) covers it and no `.gitignore` edit was made
  </done>
</task>

</tasks>

<verification>
Whole-plan checks (automated):

1. Compose file resolves cleanly with empty env (no `Server/.env` present):
   ```
   docker compose -f Server/docker-compose.yml config --quiet
   ```
   Must exit 0.

2. The three new env keys are wired into the citrine service:
   ```
   docker compose -f Server/docker-compose.yml config | grep -E 'CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_(CLIENTID|CLIENTSECRET|TOKENURL)' | wc -l
   ```
   Must report `3`.

3. Template exists, has only the three keys with empty values, and no real secrets leaked:
   ```
   diff <(grep -c '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_' Server/.env.example) <(echo 3)
   grep -E '^CITRINEOS_UTIL_CERTIFICATEAUTHORITY_V2GCA_HUBJECT_[A-Z]+=.+' Server/.env.example  # must produce no output
   ```

4. Gitignore semantics correct:
   ```
   git check-ignore -q Server/.env          # exit 0 (would be ignored)
   git check-ignore -q Server/.env.example  # exit 1 (tracked)
   ```

5. No unintended files modified:
   ```
   git status --porcelain | grep -vE '^(.M| M|\?\?| A) (Server/docker-compose\.yml|Server/\.env\.example|\.planning/)' || true
   ```
   Should produce no output (only docker-compose.yml, .env.example, and planning files changed).
</verification>

<success_criteria>
- Operator can `cp Server/.env.example Server/.env`, fill in real Hubject creds, run `docker compose up`, and the container boots with the env-var values overriding `Server/data/config.json` (via the existing `mergeConfigFromEnvVars` mechanism in `00_Base/src/config/defineConfig.ts`).
- When `Server/.env` is absent or a key is empty, container still boots without errors. The compose `:-` default-empty syntax produces an empty string, and `defineConfig.ts:82-84` skips falsy values, falling back to the existing config.json placeholder.
- `Server/.env` is gitignored (verified, no change to `.gitignore`).
- `Server/.env.example` is tracked, contains placeholder keys only, with zero real credentials.
- No changes to `Server/data/config.json` or any other source file.
</success_criteria>

<output>
After completion, create `.planning/quick/260429-ixg-wire-hubject-credentials-through-env-var/260429-ixg-SUMMARY.md` documenting:
- The exact diff applied to `Server/docker-compose.yml`
- The created `Server/.env.example` content
- Verbatim output of `git check-ignore -v Server/.env` confirming `.gitignore:128:.env	Server/.env` (no `.gitignore` change needed)
- Verbatim output of `git check-ignore -v Server/.env.example` (should be non-zero exit, file is tracked)
- Operator runbook one-liner: `cp Server/.env.example Server/.env && $EDITOR Server/.env  # fill in Hubject creds, then docker compose up`
</output>
