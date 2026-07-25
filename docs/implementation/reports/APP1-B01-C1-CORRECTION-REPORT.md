# APP1-B01-C1 — Canonical Zod Validation Correction — Report

**Checkpoint:** APP1-B01-C1 (correction) · **Verdict:** `COMPLETE` ·
**Date:** 2026-07-25 · **Not pushed.**

## A. Preflight and original B01 revalidation

- Branch `production`. Initial HEAD: `08a70e9` (`docs(app1): record APP1-B01
  completion evidence`).
- Original B01 chain: implementation `1eeb7f3` (`feat(api): add staff session
  authentication`), evidence `08a70e9`; report
  `docs/implementation/reports/APP1-B01-COMPLETION-REPORT.md`.
- **Original finding:** the B01 prompt required "Use Zod validation through the
  canonical global pipe"; the implementation instead shipped a hand-written
  `parseStaffLoginRequest` and deferred Zod as a follow-up (report §K). This
  contradicts the checkpoint contract and would seed a one-off validation
  architecture before the first real feature API — corrected here.
- Exactly two B01 endpoints; APP1-B02 not started; no Admin frontend started;
  working tree clean; no unrelated changes. The hand-written validator and its
  sole call site (the staff-session controller) and test were identified. No
  Zod dependency or global pipe existed.
- `B01_ORIGINAL_REVALIDATION = PASS` — the `08a70e9` baseline passed `pnpm
  quality` at B01 close on this byte-identical tree; the auth/session baseline
  is sound and unchanged by this correction.

## B. Canonical validation implementation

- Dependency: **`zod@4.4.3` (MIT)**, exact pin, direct dependency of
  `@embroidery/api`. Node 22 / TypeScript strict / Windows + Linux compatible.
  No `class-validator`, `class-transformer`, or `nestjs-zod` added.
- Ownership: the reusable pipeline lives in the **API platform layer**
  `apps/api/src/platform/validation/`: `ZodValidationPipe`, `createZodDto`
  (schema-backed metatype), `mapZodError` (issue → `errors[]`), and
  `ValidationModule` registering the pipe globally via `APP_PIPE`.
- Boundary decision: it is **not** placed in `@embroidery/validation`, which is a
  source-only package boundary (`main → ./src/index.ts`); a runtime pipe there
  would recreate the IMP-D018 loadability problem. The shared package stays a
  future home for cross-app schemas; this correction is not broadened into a
  package-build project (per checkpoint §7).
- Global registration through `AppModule` means the runtime bootstrap, the
  OpenAPI generator (`createApiApplication`), and the T01
  `createApiIntegrationContext` all receive identical behaviour from one place.

## C. Staff-login migration

- Feature-owned strict schema `StaffLoginSchema` (`z.object(...).strict()`):
  - email: `string` → trim → NFKC → lowercase, then refinements for non-empty
    (`REQUIRED`), ≤254 UTF-8 bytes (`TOO_LONG`), and address shape (`INVALID`);
    output is the canonical lookup form.
  - password: `string`, non-empty (`REQUIRED`), ≤4096 UTF-8 bytes (`TOO_LONG`),
    **no transform** — the password service keeps ownership of NFKC (no double
    normalization).
  - unknown fields rejected (`UNKNOWN_FIELD`) — locked and tested.
- The controller declares `@Body() body: StaffLoginRequestDto` and passes the
  typed, validated output to the use case; it contains no field-validation
  branch. A source-boundary test asserts the controller invokes no
  parser/`safeParse`.
- Removed: `parseStaffLoginRequest` and its bespoke tests; the duplicate email
  normalization in `authenticate-staff.use-case`. No dead/deprecated code left.

## D. Error-contract evidence

- `mapZodError` produces the canonical envelope `{ success:false, code:
  'BAD_REQUEST', message, errors:[{field,code,message}], meta:{requestId} }`
  through the existing exception filter — the public contract is unchanged.
- Codes are an allowlist (`REQUIRED`, `TOO_LONG`, `INVALID`, `UNKNOWN_FIELD`);
  messages are fixed and safe; nested paths join with `.`; order is
  deterministic (sorted by field then code). No raw received value, no raw Zod
  issue/object, no schema internal, no stack is exposed (asserted in tests).
- `meta.requestId` retained (integration-verified).

## E. Runtime / OpenAPI / client integrity

- The Swagger request DTO (`StaffLoginRequest`, `@ApiBody`) is retained purely
  for documentation; a unit contract test asserts it documents exactly the Zod
  schema fields, so OpenAPI and runtime validation cannot drift.
- OpenAPI generated twice, byte-identical. SHA-256 **before and after**:
  `3e7c739510c4c32091b4feb2a6749227b4e82520a059cee1e5968f02893acbdc` (unchanged).
- Generated client regenerated, tree SHA-256 **before and after**:
  `9189d7c3a2c74ac6aa12167d07a1f171bfa39247d707fad2cfca980aeb548b16` (unchanged).
- Operation IDs preserved: `staffSession_create`, `staffSession_delete`. No new
  endpoint, no `GET /api/staff/me`, no generated hooks.
- Plain-Node smoke: `zod` resolves from `dist`, the pipe normalizes/validates a
  login body, passes non-Zod params through, throws 400 on invalid input, and
  `AppModule` boots with the pipe registered globally.

## F. Test and database evidence

- API suite: **77 suites / 878 tests pass** (was 75 / 864). New: pipe unit tests
  (pass-through, parse, multiple issues, unknown field, nested path,
  deterministic order, safe payload, no value leak); staff-login schema tests
  (all §10/§11 cases + Swagger drift); controller source-boundary test;
  integration cases (unknown field → 400, over-byte password → 400,
  deterministic order, request-id in meta).
- Real integration via T01 `AppModule` on disposable PostgreSQL (labels
  `b01-http`, `b01-cascade`, `b01-persistence`); all canonical migrations
  applied; 78-table baseline, fingerprint `4ca56a59…`; cleanup on success and
  failure; persistent `embroidery` database refused by the harness guard and
  unchanged. Invalid structural input returns 400 before any scrypt/rate-limit/
  session/audit work; valid wrong credential remains uniform 401; logout 204;
  415/403 unchanged; health routes unchanged.

## G. Correction Commit C evidence

- Commit C: `1724905c8a697ecad3fc4b30f7d059836990e085` —
  `fix(api): adopt canonical Zod validation pipeline`.
- 16 files: `apps/api/package.json` (+`zod@4.4.3`), `pnpm-lock.yaml` (zod only),
  `bootstrap/app.module.ts`, `platform/validation/**` (5 new), identity
  `presentation/schemas/staff-login.request.ts` (+spec),
  `presentation/staff-session.controller.ts` (+boundary spec),
  `application/authenticate-staff.use-case.ts`, the HTTP integration spec, and
  `docs/development/BACKEND_CONVENTIONS.md`. No `packages/database`/
  `persistence`, no schema/migration, no OpenAPI/client artifact change.

## H. Validation matrix

| Command | Exit | Result |
|---|---|---|
| `pnpm quality` | 0 | PASS (all gates) |
| `pnpm --filter @embroidery/api test` | 0 | 77 suites / 878 tests |
| `pnpm --filter @embroidery/api typecheck` | 0 | clean |
| `pnpm --filter @embroidery/api lint` | 0 | clean |
| `pnpm --filter @embroidery/api build` | 0 | dist built |
| `node tools/check-api-dist-boundary.mjs` | 0 | 311 files, no test code |
| `pnpm check:openapi` | 0 | up to date (hash unchanged) |
| `pnpm check:api-client` | 0 | up to date (tree hash unchanged) |
| `pnpm --filter @embroidery/api-client test` | 0 | pass |
| login validation integration ×2 | 0 | deterministic |
| production plain-Node boot + pipe smoke | 0 | pass |
| secret/redaction scan | 0 | no secret in src/dist/diff |
| `git diff --check` | 0 | clean |

## I. Acceptance matrix

- Zod pinned/direct; no competing framework; canonical reusable pipe; global in
  all app-creation paths incl. T01; feature-owned schema; typed output; email/
  password rules; unknown-field policy; stable `errors[]`; request id; no raw
  input/Zod object; controller no manual parse; hand-written validator removed;
  invalid input short-circuits before scrypt/rate-limit/session/audit; login
  204+cookie; enumeration-safe failures; logout 204; health unchanged; two
  endpoints; operation IDs; OpenAPI/client deterministic; dist boundary; plain-
  Node load; original tests preserved; disposable DB cleanup: **all satisfied**.

## J. Scope confirmation

No APP1-B02 work, no Admin/Storefront UI, no customer auth, no role/permission
code, no schema/migration, no auth/session/cookie/rate-limit behaviour change,
no worker/gateway/Figma change, no new endpoint.

## K. Evidence closure

- Correction Commit C: `1724905c8a697ecad3fc4b30f7d059836990e085`.
- Correction Commit D (this evidence): `docs(app1): record APP1-B01 validation
  correction` — this report, a correction-history note in the B01 report, and
  phase/roadmap/traceability/README status only.
- Pre-Commit-D tree: clean; exactly two new commits since `08a70e9`.
- Push status: **NOT PUSHED**.
- Final status: **APP1-B01 = COMPLETE — CORRECTED**; **APP1-B02 = READY, NOT
  STARTED**.
