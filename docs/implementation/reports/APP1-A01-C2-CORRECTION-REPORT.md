# APP1-A01-C2 — Compose Bootstrap Policy Evidence Correction

**Verdict:** PASS — real isolated Compose evidence supplied for the bootstrap
environment policy; a genuine result-observability defect was found and fixed.
Not pushed. Two new commits after the A01-C1 evidence commit.

## A. Preflight and evidence defect

- Preflight HEAD `2145137` (A01-C1 evidence commit). Branch `production`, tree clean.
- A01-C1 Commit C `9aabbf0`; A01-C1 evidence Commit D `2145137`.
- Defect: A01-C1 §H claimed DEV missing-env → `FAILED_MISSING_ENV_DEVELOPMENT`
  exit 1, but §M admitted the development readiness-block was **inferred** from
  dependency wiring + a Compose-contract test, not proven by a real startup.
  A01-C1 implementation was accepted provisionally; its evidence was incomplete.
  A01-C2 closes only that real-runtime policy proof.

## B. Isolated Compose test architecture

- `infrastructure/compose/docker-compose.smoke.yml` — test-only override on the
  canonical `docker-compose.dev.yml`: unique `${SMOKE_PROJECT}` name + isolated
  network, project-prefixed Postgres volume, `ports: !reset []` (no host ports),
  parameterised `staff-bootstrap` `NODE_ENV`, reused dev images, and a live
  `apps/api/src` bind-mount so the container `nest build` compiles the working tree.
- `tools/smoke-app1-bootstrap-compose.mjs` — per-case unique project, temporary
  ignored env file, real `docker compose` runs, DB assertions via `docker exec …
  psql`, runtime-generated secrets + redaction, `down --volumes --remove-orphans`
  in `finally`. Pure helpers unit-tested (`.test.mjs`, 6/6). `pnpm smoke:app1-bootstrap`.
- Never re-implements bootstrap logic. The persistent `embroidery-dev` stack and DB
  are never targeted (distinct `embroidery-a01c2-*` prefix, no shared ports/volume/net).

## C. Development missing-env real run

Isolated project (dev, password absent), real `up --wait admin`:
`upExit=1`, `staff-bootstrap exit=1`, `result=FAILED_MISSING_ENV_DEVELOPMENT`,
`adminRunning=false`, `admins=0`, `credentials=0`. The canonical `up --wait`
returned non-zero (bootstrap dependency failed) → the public Admin never became
ready; no admin/credential rows created. Partial-missing (email+display present,
password absent) via a real `run` container: `exit=1`,
`result=FAILED_MISSING_ENV_DEVELOPMENT`, `admins=0`.

## D. Development create/reuse regression

Isolated project, all three variables present:
- create (real `run` container): `exit=0`, `result=CREATED`, `admins=1`,
  `credentials=1`; readiness (`up --wait admin`): `upExit=0`, `adminRunning=true`.
- reuse (re-run on same DB): `exit=0`, `result=REUSED_EXISTING`, `admins=1`,
  `credentials=1`, `credentialHashUnchanged=true` — no duplicate, no rotation.
Password runtime-generated and never printed.

## E. Production missing-env real run

Isolated project (prod), real `staff-bootstrap` container:
- missing all: `exit=0`, `result=SKIPPED_MISSING_ENV_PRODUCTION`, `admins=0` — dependents continue, no mutation.
- partial (password absent): `exit=0`, `result=SKIPPED_MISSING_ENV_PRODUCTION`, `admins=0`.
- unknown env (`NODE_ENV=staging`): `exit=1`, `result=FAILED_BOOTSTRAP`, `admins=0` — fail-closed.

## F. Cleanup and persistent-environment safety

`down --volumes --remove-orphans` in every `finally`. Final residue check:
`residualContainers=0`, `residualVolumes=0`, `residualNetworks=0`; the normal
`embroidery-dev` stack stayed up (6 containers) and its database was never touched.
Per-project images cleaned; shared cached base images retained.

## G. Commit E evidence

Commit E: `32a7854` — `test(app1): prove Compose bootstrap environment policy`.
The real run exposed a **genuine defect**: `NestFactory.createApplicationContext(
…, { logger: false })` globally silences the Nest `Logger`, so the machine-
parseable `result=` line was swallowed for every post-boot outcome
(CREATED / REUSED_EXISTING / mismatch / not-active). Minimal fix (`apps/api/src/
cli/staff-bootstrap.ts`): the CLI now writes `result=…` straight to stdout/stderr.
No auth/session/policy behaviour changed; the closed status set and exit codes
are unchanged. Files: smoke override, harness + helper tests, `smoke:app1-bootstrap`
script, CLI result-emission fix.

## H. Validation matrix

`pnpm quality` = PASS. api + admin typecheck/lint/test/build PASS; check:openapi
(`ae015dd6…`) + check:api-client (`89c1aace…`) UNCHANGED; styles/figma/e2e/
file-size/dist+build boundaries PASS. Harness helper tests 6/6. Live smoke 8/8.

## I. Acceptance matrix

Dev missing-env real run, exit≠0, readiness fails, no mutation — PASS. Dev
partial-missing fails — PASS. Dev create/reuse — PASS (1 admin, 1 credential, no
rotation, hash unchanged). Prod missing/partial skip exit 0, no mutation — PASS.
Unknown env fail-closed — PASS. Cleanup: zero residual test resources — PASS.
APP1-A01-C2 verdict = PASS.

## J. Scope confirmation

No Admin UI / route protection / password toggle / A02 / Storefront / Figma /
schema / migration / OpenAPI / generated-client / styles / production-auth /
hostname change. Commit E is smoke + one justified minimal CLI observability fix
(a real defect was found). No secret printed.

## K. Evidence closure

Two new commits after `2145137`. Not pushed. `APP1-A01 = COMPLETE — CORRECTED,
DELIVERED_FOR_PRODUCT_OWNER_REVIEW`; `APP1-A01-C1/C2 = COMPLETE`;
`APP1-A02 = BLOCKED_BY_PRODUCT_OWNER_A01_REVIEW`.
