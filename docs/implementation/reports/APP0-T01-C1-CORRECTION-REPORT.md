# APP0-T01-C1 — Keep Integration Harness Outside Production Source — Correction Report

**Checkpoint:** APP0-T01-C1 · **Branch:** `production` · **Verdict:** `PASS`
**Correction commit:** `2f7f274f6e4a6b02af414c2e2e6562dc6f9ba1e7` — `test(api): isolate integration harness from production source`

---

## A. Preflight

- Initial HEAD `c062b74` (`docs(app0): record APP0-T01 completion evidence`); working tree clean.
- Original T01: implementation `7bc3793a6826b50c7c4eed11b2e81ed079fdffc2`, evidence `c062b74bf46647506b3d175d2ca0de77c5d39af5`.
- Original `src/tests` T01 inventory (the flagged files): `apps/api/src/tests/support/api-integration-context.ts`, `…/support/recording-log-sink.ts`, `…/integration/api-integration-context.integration.spec.ts`, `…/integration/api-integration-context.failure.spec.ts`.
- **Original build-artifact finding:** `tsconfig.build.json` already excluded `src/**/*.spec.ts` / `src/**/tests/**`, so the compiled `dist/*.js`/`*.d.ts` never contained the harness code. **But** (a) the files were physically inside the production source tree `apps/api/src/**` — the boundary violation — and (b) the incremental build-info `dist/tsconfig.build.tsbuildinfo` referenced `supertest/*.d.ts` (an auto-included ambient `@types` package), so `dist` was not test-code-free by string.

## B. Human-review findings

1. **Production-source boundary violation** — test-only files lived under `apps/api/src/tests/**`, outside the T01-locked `apps/api/test/**`, relying only on a build exclusion.
2. **Missing direct schema/fingerprint proof** — the adapter did not itself prove that a database it provisions passes canonical schema/fingerprint verification.

## C. Correction implementation

- **Physical separation.** `git mv` moved all four T01 files to `apps/api/test/support/**` and `apps/api/test/integration/**`. No T01 support/spec file remains under `apps/api/src/**` (the empty `src/tests/support` directory was removed). Cross-tree imports rewritten to `../../src/...`. The pre-existing DB8/DB9/DB10 suites under `src/tests/**` were **not** touched (out of scope).
- **Jest / TypeScript.** `jest.config.mjs` roots → `['<rootDir>/src', '<rootDir>/test']`; `tsconfig.json` `include` adds `test/**/*` so strict typecheck and type-aware lint still cover the moved support. `tsconfig.build.json` keeps `include: ["src/**/*"]` (test/ is never built) and now pins `types: ["node"]`, so test-type packages (`@types/supertest`, `@types/jest`) are excluded from the production compilation and its build-info.
- **Production artifact boundary.** Added `tools/check-api-dist-boundary.mjs` — scans `apps/api/dist` (paths + `.js`/`.d.ts`/`.map` content) for `api-integration-context`, `recording-log-sink`, `supertest`, `createApiIntegrationContext`, `*.spec`, `src/tests`, `test/integration`, `test/support`, `t01-`; exits non-zero on any hit. Reproducible command: `pnpm --filter @embroidery/api build && node tools/check-api-dist-boundary.mjs`.
- **Direct schema/fingerprint proof.** Added a focused test that provisions a disposable DB **through the adapter**, runs the canonical `verifySchemaBaseline` once against it, asserts migration/table counts and the frozen fingerprint, then closes through the adapter and proves the DB is dropped. No schema/fingerprint logic reimplemented.
- **`maxWorkers` retained** at `50%`: full `pnpm quality` is green with every suite closing cleanly and **zero** residual databases (§E), so it is a shared-container capacity policy, not a leak workaround.
- **Architecture unchanged:** `@embroidery/database/testing` → `@embroidery/test-utils` `CleanupStack` → `apps/api/test/support` adapter → real `AppModule` + disposable PostgreSQL. Still the only database harness.

## D. Correction Commit A evidence

- Hash `2f7f274f6e4a6b02af414c2e2e6562dc6f9ba1e7`; parent `c062b74`; subject `test(api): isolate integration harness from production source`.
- 9 files, +143/−10: 4 renames `apps/api/src/tests/{support,integration}/… → apps/api/test/{support,integration}/…` (R100/R095/R081/R071), `apps/api/jest.config.mjs`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `docs/development/BACKEND_CONVENTIONS.md`, `tools/check-api-dist-boundary.mjs` (new). No production module, schema, migration, OpenAPI or generated-client change.

## E. PostgreSQL evidence

- **Schema/fingerprint proof (adapter-provisioned DB):** name `embroidery_db7_t01_schema_proof_<pid>`; `verifySchemaBaseline` → 7/7 stages pass; migrations **31**; public tables **78**; fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f`; dropped after close (catalog confirms absence).
- **Cleanup / isolation:** two sequential contexts (`t01-run-a`, `t01-run-b`) distinct + dropped; forced `app.close()` failure still drops the DB (AggregateError); idempotent close; env `DATABASE_URL`/`NODE_ENV` restored.
- **Persistent DB (read-only) before and after the full run:** database `embroidery`, **31** migrations, **0** `%t01_%`, **0** `embroidery_db7_%`/`embroidery_db10_%` leftovers. Unchanged.
- **Orphan accounting:** pre-validation catalog leftovers = `[]` (the two `db10_*` orphans from an earlier interrupted durability run were already dropped during APP0-T01 and reported there). This correction created and dropped only `t01_*` databases; none remained.

## F. Validation matrix

| Command | Exit | Suites / tests / result |
|---|---:|---|
| `pnpm --filter @embroidery/test-utils typecheck` / `lint` / `test` | 0 / 0 / 0 | 1 suite / **5** |
| `pnpm --filter @embroidery/api typecheck` / `lint` | 0 / 0 | clean (covers `test/**`) |
| `pnpm --filter @embroidery/api test` | 0 | **64** suites / **779** (+1 schema proof) |
| `pnpm --filter @embroidery/api build` (clean) | 0 | `nest build` ok |
| `node tools/check-api-dist-boundary.mjs` | 0 | 257 built files, no test code |
| `pnpm --filter @embroidery/database test` / `persistence test` | 0 / 0 | 152 / 88 |
| `pnpm check:openapi` / `check:api-client` | 0 / 0 | artifact byte-identical; tree hash `3ca2b2e…` unchanged |
| `node tools/check-file-size.mjs` / `git diff --check` | 0 / 0 | clean |
| `pnpm quality` (PostgreSQL up) | 0 | full chain green (api 779; db-manifest 78 tables) |

## G. Acceptance matrix

| Gate | Evidence | Result |
|---|---|---|
| No T01 test/support under `apps/api/src/**`; lives under `apps/api/test/**` | §C, §D | PASS |
| Clean API build; `dist` free of harness/spec/support code (incl. build-info); reproducible gate | §A, §C, §F | PASS |
| Jest/typecheck/lint cover moved support | §C, §F | PASS |
| Real `AppModule` integration still passes | §E, §F | PASS |
| Canonical harness remains the only one; `verifySchemaBaseline` run on adapter DB | §C, §E | PASS |
| Migration/table/fingerprint recorded; success+failure cleanup; no residual DB; persistent unchanged; env restored | §E | PASS |
| `maxWorkers` retained with evidence | §C, §E, §F | PASS |
| OpenAPI + generated client unchanged; no schema/migration/production change | §D, §F | PASS |

## H. Scope and follow-ups

No second database harness; no schema/migration; no production test code (physically separated + gated); no frontend/worker/Nginx change; APP0-DEC-COMPONENT-TEST not started. Follow-up (informational): the pre-existing DB8/DB9/DB10 suites still live under `src/tests/**`; they are excluded from the build and out of this checkpoint's scope, but a future cleanup could migrate them to `apps/api/test/**` for consistency.

## I. Evidence closure

- Correction Commit A `2f7f274f6e4a6b02af414c2e2e6562dc6f9ba1e7` (frozen; build + dist scan + contract checks re-run PASS after commit).
- Evidence commit subject: `docs(app0): record APP0-T01-C1 correction evidence`.
- Working tree before the evidence commit: clean except the staged phase doc + T01 report note and the untracked correction report.
- Push status: **NOT PUSHED**.
- **Final APP0-T01 verdict: `PASS` (corrected).**
