# APP0-DEC-CODEGEN — OpenAPI Client Codegen Decision — Completion Report

**Checkpoint:** APP0-DEC-CODEGEN · **Branch:** `production` · **Verdict:** `PASS_WITH_FOLLOW_UPS`
**Selected tool:** Orval `8.22.0` (MIT), `axios-functions` mode + `mutator`.

---

## A. Preflight and B05 revalidation

- Branch `production`; initial HEAD `739b087` (verified with `git rev-parse HEAD`, not assumed); `git status --short` empty.
- `git log -15 --oneline` confirms the reported lineage C01→…→B05 (`1e03997 … 739b087`).
- B05 scope re-confirmed docs+api only via `git diff-tree --name-only -r 739b087` (30 files: `.env.example`, `apps/api/src/**`, `docs/**`) — no frontend/worker/database/Nginx.

Commands / exit codes:

| Command | Exit |
|---|---|
| `pnpm check:openapi` | 0 — "artifact is up to date" (byte-identical) |
| `pnpm --filter @embroidery/api build` | 0 |
| `pnpm --filter @embroidery/api typecheck` | 0 |
| `pnpm --filter @embroidery/api lint` | 0 |
| `pnpm quality` (Postgres up, host port 5434) | 0 — full chain incl. styles + db-manifest (78 tables) |

- B05 report present at `docs/implementation/reports/APP0-B05-COMPLETION-REPORT.md`.
- `packages/observability` runtime-loadability: compiled `apps/api/dist` has **no** `require` to it (`grep 'require(.*observability' dist` → 0 matches; only one JSDoc comment mentions it) → no `MODULE_NOT_FOUND`.
- OpenAPI artifact unchanged; working tree clean after validation.

**B05_REVALIDATION = PASS.**

## B. Candidate matrix

Metadata from the official npm registry (`npm view`):

| Candidate | Version | License | Runtime | Axios output | Freshness (modified) | Verdict |
|---|---|---|---|---|---|---|
| Orval | 8.22.0 | MIT | Node | yes (`axios`/`axios-functions`) | 2026-07-14 | **Finalist → SELECTED** |
| Hey API `@hey-api/openapi-ts` | 0.99.0 | MIT | Node | yes (axios plugin, bundled ≥0.73) | 2026-07-22 | Finalist → rejected |
| OpenAPI Generator `@openapitools/openapi-generator-cli` | 2.40.0 | Apache-2.0 | **Java** (JAR) | yes (`typescript-axios`) | 2026-07-20 | Rejected pre-spike |

OpenAPI Generator rejected before spiking: requires a Java/JAR runtime — a non-npm toolchain and larger supply-chain surface in a Node/pnpm monorepo (hard-gate preference "no Java"). No Fetch-only candidate added.

## C. Spike evidence

Both finalists installed and run in an **OS-temp** dir (`…/scratchpad/codegen-spike`, outside the repo); real input = a copy of `openapi.generated.json`; deleted after (`GONE`). No repo `package.json`/lockfile touched.

Config: Orval `client: 'axios-functions'` (no react-query); Hey API plugins `@hey-api/client-axios` + `typescript` + `sdk`. Strict compile config mirrored the repo: `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`, `@types/node@26.1.1`.

| Candidate | Version | Files | LOC | KB | Strict TS (`exactOptionalPropertyTypes`) | Deterministic (2-run) | Axios | Generated hooks | Machine-specific output |
|---|---:|---:|---:|---:|---|---|---|---|---|
| Orval | 8.22.0 | 2 | 211 | 12 | **PASS** (`tsc` exit 0) | byte-identical | yes | none | none (scan clean) |
| Hey API | 0.99.0 | 16 | 1891 | 101 | **FAIL** (`tsc` exit 2, ≥5× TS2379 in `client/utils.gen.ts`, `core/params.gen.ts`) | byte-identical | yes | none | none (scan clean) |

Verified per spike: health operation (`healthCheck`/`healthReadiness` derived from op IDs `health_check`/`health_readiness`); envelope types generated (`ApiErrorResponse`/`ApiResponseMeta` incl. `requestId`; Orval enums as `as const`, Hey union literals); ESM imports; no `localhost`/timestamp/absolute-path leakage (grep clean both); no TanStack/react-query symbols (grep clean both).

Orval runtime deps: only `axios` + local `./generated.schemas`. Hey API vendors its own runtime (`client/*`, `core/*`) into the generated tree — a second Axios wrapper that duplicates the runtime `packages/api-client` already owns.

**Custom-instance gate:** a second Orval run with `override.mutator` (`customInstance` → `axios.create`) emitted functions calling `customInstance<T>({url,method})` instead of global `axios`, and compiled clean under the strict config (`tsc` exit 0) — proving base-URL/instance ownership stays with the repo's handwritten runtime.

## D. Decision

**Selected: Orval `8.22.0`, `axios-functions` mode with a `mutator`.** Top reasons:

1. Only finalist whose output compiles under the repo-locked `exactOptionalPropertyTypes` (Hey API's vendored runtime fails it).
2. Emits **types + thin operation functions only** — no vendored runtime; the `mutator` reuses the existing `create-axios-api-client`/`normalizeApiClientError` layer, so base URL, interceptors and error-normalization stay repo-owned (preserves IMP-D009 handwritten-hooks split).
3. Minimal, deterministic footprint (2 files, one `axios` dep), MIT, Node-only (cross-platform, offline).

Rejected finalists (exact):

- **Hey API `@hey-api/openapi-ts` 0.99.0** — hard-gate #3 (strict TS): vendored `core/*` + `client/utils.gen.ts` fail `exactOptionalPropertyTypes` (`TS2379`); also bundles a competing Axios runtime into the generated tree, duplicating the owned runtime.
- **OpenAPI Generator `typescript-axios`** — hard-gate "no Java": JAR/Docker runtime, heavier supply-chain/toolchain in a pnpm monorepo.

No "least-bad" fallback needed — a candidate passed every hard gate.

## E. APP0-C02 handoff (locked)

- **Input artifact:** `packages/contracts/openapi/openapi.generated.json` (offline; never live Swagger).
- **Output package / generated source:** `packages/api-client/src/generated/` (Orval-owned, never hand-edited).
- **Handwritten runtime (preserved):** `packages/api-client/src/clients` · `/config` · `/errors`; owns base URL (browser same-origin path / server `INTERNAL_API_BASE_URL`), interceptors, retry, `NormalizedApiError`.
- **Axios injection:** Orval `override.mutator` → the existing instance factory; generated code holds no base URL/secret/instance.
- **Config file:** `orval.config.*` at `packages/api-client/` (added in C02, not now).
- **Generation command:** `orval` (wired as a package script in C02); **clean/regenerate** = delete `src/generated/` then generate.
- **Order:** generate → format (Prettier) → lint → typecheck.
- **Drift check:** generate to temp dir → same formatter → compare tracked `src/generated/` → fail with regenerate command → cleanup in `finally` → cross-platform → join root `quality`. Non-mutating; not implemented this checkpoint.
- **Runtime dependency policy:** generated code may import only `axios` + local generated/mutator modules.
- **Boundary:** `Generated = client/types only` · `Feature layer = handwritten TanStack Query hooks`.
- **Version/upgrade policy:** exact pin `8.22.0`; no automatic major upgrade; on upgrade re-review generated diff + re-run strict compile/determinism/`quality` + read migration notes; upgrade owned by the C02/api-client maintainer.

## F. Deviations and follow-ups

- **F-1 (non-blocking):** Orval default `axios-functions` (no mutator) uses the global `axios` and inlines the `/api` path prefix. C02 **must** configure the `mutator` (proven in §C) so base URL/interceptors stay repo-owned. Owner: APP0-C02.
- **F-2 (non-blocking):** current artifact has only two GET health operations (no request bodies/multipart/query params). Multipart/optional-query/error-typing behaviour re-verified in C02 when real feature operations exist. Owner: APP0-C02.
- **F-3 (informational):** freshness taken from official npm registry metadata (`npm view`), not vendor changelogs; all three within ~10 days — no staleness risk.

## G. Acceptance matrix

| Gate | Evidence | Result |
|---|---|---|
| B05 revalidation reliable | §A commands all exit 0; report + no-observability-require verified | PASS |
| Official sources; versions/freshness recorded | §B `npm view` version/license/modified | PASS |
| ≥3 candidates; ≥2 finalists spiked | §B 3 candidates; §C Orval + Hey API spiked | PASS |
| Strict TS + determinism tested | §C `tsc` exits; two-run byte-identical diff | PASS |
| Windows + Linux evaluated | Spike run on Windows; both tools Node-only, no platform binary/JAR | PASS |
| Axios gate; no generated hooks | §C axios output, hook grep clean both | PASS |
| Tool/version/mode + rejections locked | §D; IMP-D023 | PASS |
| C02 handoff / boundary / drift / upgrade locked | §E | PASS |
| Decision register + phase + docs updated | §H files | PASS |
| No source/dependency/lockfile change; no generated client; temp removed; OpenAPI unchanged | §A/§C; `git status` docs-only; spike `GONE` | PASS |

## H. Changed files

```text
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md   (add IMP-D023; resolve IMP-O011)
docs/implementation/06-OPENAPI-AND-CLIENT-CONTRACT.md        (§3.1 codegen tool locked)
docs/implementation/phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md (DEC-CODEGEN DONE; C02 READY)
docs/architecture/REPOSITORY_STRUCTURE.md                    (api-client generated/handwritten boundary)
docs/implementation/reports/APP0-DEC-CODEGEN-COMPLETION-REPORT.md (this report)
```

Docs-only. No `package.json`, `pnpm-lock.yaml`, `turbo.json`, `packages/**`, `apps/**` change.

## I. Git evidence

- Commit subject: `docs(app0): select OpenAPI client codegen tool`.
- Initial HEAD `739b087`; final HEAD = this commit; exactly one docs-only commit; working tree clean.
- **Push status: NOT PUSHED.**

## J. Verdict

**`PASS_WITH_FOLLOW_UPS`** — Orval `8.22.0` (`axios-functions` + `mutator`) selected and locked (IMP-D023). Follow-ups F-1/F-2/F-3 are non-blocking and owned by APP0-C02. APP0-C02 is READY, NOT STARTED.
