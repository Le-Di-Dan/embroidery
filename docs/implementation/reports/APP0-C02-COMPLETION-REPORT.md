# APP0-C02 — Deterministic OpenAPI TypeScript/Axios Client Foundation — Completion Report

**Checkpoint:** APP0-C02 · **Branch:** `production` · **Verdict:** `PASS_WITH_FOLLOW_UPS`
**Implementation commit:** `ef6152e1cd7d889c321e907f7f3b2391def36716` — `feat(api-client): add deterministic Orval generation`

---

## A. Preflight

- Initial HEAD `55a055d` (`docs(app0): select OpenAPI client codegen tool`, APP0-DEC-CODEGEN); working tree clean; C01→DEC-CODEGEN all present in `git log`.
- Decision commit verified: `55a055d` subject as above. Decision report `docs/implementation/reports/APP0-DEC-CODEGEN-COMPLETION-REPORT.md` present, verdict `PASS_WITH_FOLLOW_UPS`, locking Orval `8.22.0` / `axios-functions` / custom mutator (IMP-D023).
- `pnpm check:openapi` PASS (artifact up to date). Artifact SHA-256 `8a365626e7a345331b5fff191d57f841f69006095633f0d69e98adacfba0dd7e`.
- `packages/api-client` baseline: JIT source package (no build step); handwritten Axios runtime in `src/clients`/`config`/`errors`; **no** `src/generated` existed. No unrelated user changes.

## B. Locked implementation

- **Tool/mode:** Orval `8.22.0`, `mode: split`, `client: 'axios-functions'`, exact-pinned **devDependency** (`orval` absent from `dependencies`; `axios` is the only generated runtime dep).
- **Input:** committed `packages/contracts/openapi/openapi.generated.json` (no live URL).
- **Output:** `packages/api-client/src/generated/` (`embroidery-api.ts` + `embroidery-api.schemas.ts`), tool-owned, never hand-edited, cleaned atomically each run.
- **Mutator/runtime:** generated operations route through `src/clients/api-request.mutator.ts` (`apiRequest`), which forwards to a **caller-supplied** Axios instance and returns the response body. No new Axios singleton (the runtime creates instances per environment); base URL/interceptors/`normalizeApiClientError` unchanged; no client-side `X-Request-ID` injection.
- **Boundary/config:** single `orval.config.ts` (env-redirectable target/mutator); `src/index.ts` re-exports only the operation functions, generated transport types, and `ApiRequestOptions`.
- **Scripts:** `generate` / `check:generated` (package); `api-client:generate` / `check:api-client` (root); `check:api-client` added to `quality` after `check:openapi`.

## C. Implementation commit evidence

- Hash `ef6152e1cd7d889c321e907f7f3b2391def36716`; parent `55a055d`; subject `feat(api-client): add deterministic Orval generation`.
- 19 files, +1586/−52. Changed files:
  `package.json`, `pnpm-lock.yaml`, `packages/api-client/{README.md, eslint.config.mjs, package.json, tsconfig.json, orval.config.ts}`, `packages/api-client/scripts/{orval-config.mjs, generated-tree.mjs, generate-client.mjs, check-generated-client.mjs, generated-tree.test.mjs}`, `packages/api-client/src/index.ts`, `packages/api-client/src/clients/{api-request.mutator.ts, api-request.mutator.test.ts}`, `packages/api-client/src/{generated-client.contract.test.ts, public-api.smoke.test.ts}`, `packages/api-client/src/generated/{embroidery-api.ts, embroidery-api.schemas.ts}`.
- Dependency change: `orval@8.22.0` added to api-client `devDependencies` (exact pin); `pnpm-lock.yaml` updated by pnpm (no manual edit). No other package touched.

## D. Generated artifact evidence

- OpenAPI SHA-256 `8a365626…dd7e` (unchanged; `check:openapi` PASS).
- Files: **2** (`embroidery-api.ts` 28 lines/1180 B; `embroidery-api.schemas.ts` 170 lines/4924 B). Tree: **198 lines / 6104 bytes**.
- Operations: `healthCheck`, `healthReadiness` (from operation ids `health_check`, `health_readiness`).
- Types: `ApiSuccessResponse`/`ApiErrorResponse`/`ApiResponseMeta`(+`requestId`)/`ApiFieldError`/`ApiPaginationMeta`, `HealthStatusResponse`, `ReadinessStatusResponse`, `DatabaseHealthResponse`, `DatabasePoolResponse`.
- Determinism: run-1 and run-2 tree hash **`3ca2b2e39eaab0f970f620cea932e7cee15463a6e755a66db7b9686b056f6b75`** (identical).
- Forbidden-content scan: no `localhost`/IP, no absolute machine path, no ISO timestamp, no `tanstack`/`react-query`/`useQuery`/`swr`, no global `axios.*` call, no `fetch(` — asserted in tests and by grep.

## E. Validation matrix

| Command | Exit | Result |
|---|---:|---|
| `pnpm check:openapi` | 0 | artifact byte-identical |
| `pnpm api-client:generate` (×2) | 0 | tree hash `3ca2b2e…` both runs |
| `pnpm check:api-client` | 0 | up to date; non-mutating |
| `pnpm --filter @embroidery/api-client typecheck` | 0 | strict incl. generated + `orval.config.ts` |
| `pnpm --filter @embroidery/api-client lint` | 0 | generated ignored, scripts linted |
| `pnpm --filter @embroidery/api-client test` | 0 | Jest 29 + node:test 7 = **36** |
| `node tools/check-file-size.mjs` | 0 | no new file over limit |
| `pnpm format:check` | 0 | all files Prettier-clean |
| `git diff --check` | 0 | clean |
| `pnpm quality` (PostgreSQL up, port 5434) | 0 | full chain incl. `check:api-client`, db-manifest (78 tables) |

## F. Drift and boundary evidence

- **Drift design:** `check-generated-client.mjs` regenerates into an OS temp dir mirroring `src/{generated,clients}` (so the generated `../clients/api-request.mutator` import is byte-identical), formats with the repo Prettier config (resolved from a stable in-repo anchor), and compares deterministic tree hashes via the pure `diffTrees`. Temp removed in `finally`; workspace fixed to the package root so TypeScript-version detection (helper-type emission) matches real generation.
- **Drift tests (node:test):** identical→in-sync; changed/missing/unexpected→fail; one real `checkGeneratedClient()` integration asserts in-sync, tracked tree hash unchanged (non-mutating), and temp-dir count restored (cleanup); `listGeneratedFiles` normalizes to forward-slash relative paths (Windows).
- **Mutator tests (Jest):** routes through the injected instance, merges per-call config, injects no `X-Request-ID`/`X-Correlation-ID`, throws without an instance.
- **Public-export smoke (Jest):** imports `healthCheck` via the package index and resolves against a mocked instance with no network; generated response types compile under strict TS.
- **Runtime-loadability:** api-client is Next-transpiled / ts-jest (not plain Node); generated code imports only `axios` + the local mutator.

## G. Deviations / follow-ups

- **F-1 (non-blocking, owner APP0-C02→feature phases):** the artifact declares `X-Request-ID` as an optional header parameter, but Orval `axios-functions`+mutator does not surface it as an operation argument. This matches IMP-D020 (gateway/API own request-ID; the client must not generate one); callers may still set it via `options.config.headers`. Re-verify when feature operations with required/body params enter the artifact.
- **F-2 (non-blocking, owner APP0-C02):** current artifact has only two GET health operations. Multipart / pagination / request-body / error-typing ergonomics are re-verified when the first feature operations enter the artifact (§16). No test-only operations were added to the canonical artifact.
- **F-3 (informational, §17):** `packages/contracts` runtime guards (`isApiResponseEnvelope`) are already consumed by the handwritten error-normalizer; api-client is not plain-Node-loaded, so no contracts-package refactor was needed or performed.

## H. Acceptance matrix

| Gate group | Evidence | Result |
|---|---|---|
| Decision honored (Orval 8.22.0 exact devDep, axios-functions, mutator, offline input, output under src/generated) | §B, §C | PASS |
| Generated correctness (op names, envelope + request-id types, no hooks, no global axios, no embedded URL/secret, no client request-id) | §D, §F | PASS |
| Determinism + drift (two-run equal, non-mutating check, stale/missing/unexpected fixtures, cross-platform) | §D, §E, §F | PASS |
| Package integrity (strict TS, lint, 36 tests, public smoke, formatted, artifact unchanged) | §E, §F | PASS |
| Quality integration (`check:api-client` in root quality; full quality PASS) | §E | PASS |
| Scope (no app integration, no hooks, no API/OpenAPI/worker/db/Nginx change) | §I | PASS |

## I. Scope confirmation

No frontend app integration; no TanStack/React hooks; no API controller or OpenAPI-artifact change; no auth/token handling; no request-ID generator; no server-envelope change; no business logic; no worker/database/Nginx change. APP0-T01 not started.

## J. Evidence closure

- Implementation commit `ef6152e1cd7d889c321e907f7f3b2391def36716` (frozen; gates re-run PASS after commit).
- Evidence commit subject: `docs(app0): record APP0-C02 completion evidence`.
- Working tree before the evidence commit: clean (only the untracked report + staged phase doc).
- Push status: **NOT PUSHED**.
- Verdict: **`PASS_WITH_FOLLOW_UPS`** (F-1/F-2/F-3 non-blocking).
