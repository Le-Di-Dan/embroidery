# APP1-B02-C1 — Require Current-Staff Success Data — Correction Report

**Checkpoint:** APP1-B02-C1 (contract correction) · **Verdict:** COMPLETE — DELIVERED_FOR_HUMAN_REVIEW
**Scope:** make `data` required on the `GET /api/staff/me` `200` contract. No runtime, auth, endpoint, schema or dependency change.

---

## A. Preflight and original B02 revalidation

- Branch: `production`. Initial HEAD (before correction): `c99c9f4` (APP1-B02 evidence commit).
- B02 chain from Git:
  - B02 impl: `66e2854183ddba8b701360e1f3ee97ea08ee18cf` — `feat(api): add current staff endpoint`.
  - B02 evidence: `c99c9f4e69ae057cf2f8ed0755ba5c9091fd9f20` — `docs(app1): record APP1-B02 completion evidence`.
  - Report present: `docs/implementation/reports/APP1-B02-COMPLETION-REPORT.md`.
- Confirmed at start: `GET /api/staff/me` is the only B02 endpoint; operation ID `staffSelf_get`; runtime integration returns a body with `data`; generated `StaffSelfGet200` had `data?:`; no frontend started; working tree clean; no migration/dependency.
- **Original defect:** `StaffSelfGet200 = ApiSuccessResponse & { data?: CurrentStaffResponse }` — `data` optional for a success response that always carries it.
- `B02_ORIGINAL_REVALIDATION = PASS` — HEAD `c99c9f4` is the point where `pnpm quality` last passed; tree clean; the B02 integration already asserts a non-empty `data` on every `200`, so runtime always returns data (not a wider defect).

## B. Root cause and authoritative fix

- **Cause (verified):** the controller's `@ApiOkResponse` `allOf` override member declared `properties.data` but omitted `required`/`type`:
  ```
  allOf: [ {$ref ApiSuccessResponse}, { properties: { data: {$ref CurrentStaffResponse} } } ]
  ```
  The shared `ApiSuccessResponse` legitimately lists `data` as required generically; but Orval types the operation from the specific override member, and a member without `required: ['data']` yields `data?:`. Endpoint-local — the generic envelope helper was **not** at fault, so no reusable-helper change was made (§9 endpoint-local fix).
- **Fix:** added `type: 'object'` and `required: ['data']` to the override member in
  `apps/api/src/modules/identity/presentation/staff-self.controller.ts`. Corrected `200` schema:
  ```json
  { "allOf": [
    { "$ref": "#/components/schemas/ApiSuccessResponse" },
    { "type": "object", "required": ["data"],
      "properties": { "data": { "$ref": "#/components/schemas/CurrentStaffResponse" } } }
  ] }
  ```
- No generated TypeScript hand-edit; no post-generation string replacement — the fix originates in the API OpenAPI source and flows through `openapi:generate` + `api-client:generate`.

## C. Generated contract evidence

- OpenAPI `200` schema now requires `data` (semantic test asserts the override member's `required` contains `data` and references `CurrentStaffResponse`).
- `CurrentStaffResponse` requires exactly `id`, `email`, `displayName`; no `credential`/`session`/`sessionId`/`token`/`role`/`permissions` property (semantic test).
- Generated type is now:
  ```ts
  export type StaffSelfGet200 = ApiSuccessResponse & { data: CurrentStaffResponse };
  ```
- Compile-time proof in `staff-self-operations.test.ts`: `IsOptional<StaffSelfGet200,'data'>` is `false`; `StaffSelfGet200['data']` extends `CurrentStaffResponse`; and a `@ts-expect-error` fixture proves omitting `data` fails to type-check.
- Method signature unchanged: `staffSelfGet(options?)` — no cookie/token/session argument; no TanStack hook; operation ID `staffSelf_get`.

## D. Runtime and security regression

- Runtime endpoint unchanged. B02 focused integration (real AppModule, disposable PostgreSQL) run twice — 12/12 both runs: `200`, canonical envelope, `data.{id,email,displayName}` present, no sensitive fields, `Cache-Control: no-store`, no `Set-Cookie`.
- Preserved: missing/malformed/duplicate/unknown/revoked/idle/absolute/LOCKED/DISABLED → `401`; login `204`; logout `204`; global Zod validation; no ordinary-read audit; single session/account lookup.
- Secret/redaction scan of the diff: clean (only `*@example.test` fixtures).

## E. Artifact integrity

- **OpenAPI SHA-256:** old `faf7a47b30a68993b8196ff80a7e867b439bb23ec63ede64ef647808556b635e` → new `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`. Generated twice, byte-identical.
- **Generated-client tree SHA-256:** old `f9c27d13f794615ad0288aea4a224e3bb42621192942c9db550422d6d37126dc` → new `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`. Generated twice, identical.
- Both hashes changed as expected (`required` metadata added; `data?` → `data`). `check:openapi` and `check:api-client` pass against the committed artifacts.

## F. Correction Commit C evidence

- **Commit C:** `673f1dff39b735e5c184e520d24098088895aba2` — `fix(contracts): require current staff response data`.
- 5 files (contracts/tests only; no docs; no `package.json`/lockfile; no schema/migration):
  - `apps/api/src/modules/identity/presentation/staff-self.controller.ts` (required-data override)
  - `apps/api/src/openapi/build-openapi-document.spec.ts` (OpenAPI semantic tests)
  - `packages/api-client/src/clients/staff-self-operations.test.ts` (compile-time contract)
  - `packages/api-client/src/generated/embroidery-api.schemas.ts` (regenerated)
  - `packages/contracts/openapi/openapi.generated.json` (regenerated)

## G. Validation matrix

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @embroidery/api typecheck` | 0 | clean |
| `pnpm --filter @embroidery/api lint` | 0 | clean |
| `pnpm --filter @embroidery/api build` | 0 | built |
| `node tools/check-api-dist-boundary.mjs` | 0 | clean: 319 files |
| `pnpm --filter @embroidery/api test` | 0 | 82 suites / 910 tests (was 82 / 907) |
| B02 integration ×2 | 0 | 12 / 12 both runs |
| `pnpm openapi:generate` ×2 | 0 | deterministic (`ae015dd6…`) |
| `pnpm check:openapi` | 0 | up to date |
| `pnpm api-client:generate` ×2 | 0 | deterministic (`89c1aace…`) |
| `pnpm check:api-client` | 0 | up to date |
| `pnpm --filter @embroidery/api-client typecheck` | 0 | clean (`@ts-expect-error` fired) |
| `pnpm --filter @embroidery/api-client lint` | 0 | clean |
| `pnpm --filter @embroidery/api-client test` | 0 | 7 suites / 35 tests |
| `pnpm quality` | 0 | **PASS** (all gates) |

## H. Acceptance matrix (grouped)

- **Contract (5–13):** `200` requires `data` · `CurrentStaffResponse` requires id/email/displayName · no sensitive fields · `StaffSelfGet200.data` non-optional · compile-time assertion passes · omitting data fails typecheck · method signature unchanged · no cookie/token arg · operation ID unchanged — PASS.
- **Stability (14–20, 27–28):** B01 operation IDs unchanged · no new endpoint · login/logout `204` · `401` unchanged · Zod unchanged · cache/no-cookie unchanged · no success audit · no dependency/schema/auth/session/UI/Figma/worker/infra change — PASS.
- **Artifacts (21–26):** OpenAPI + client generated twice deterministically · drift checks pass · integration ×2 · API/client tests pass · `pnpm quality` pass — PASS.
- **Evidence (29–35):** Commit C contracts-only · Commit D evidence-only · report cites Commit C · ≤180 lines · exactly two new commits · clean tree · not pushed — PASS.

## I. Scope confirmation

No endpoint added; no auth/session/cookie/rate-limit change; no `AuthenticatedAdminGuard` change; no schema/migration; no admin/storefront/worker/infra change; no Figma/registry change; no dependency/lockfile change. Correction is confined to the OpenAPI `200` `data` requirement and its regenerated artifacts + tests.

## J. Evidence closure

- **Commit C:** `673f1dff39b735e5c184e520d24098088895aba2` — `fix(contracts): require current staff response data`.
- **Commit D (this evidence):** `docs(app1): record APP1-B02 contract correction`.
- Pre-Commit-D tree: clean; exactly one contracts commit since `c99c9f4`.
- **Push status:** NOT PUSHED.
- **Final status:** `APP1-B02 = COMPLETE — CORRECTED`. Frontend unchanged: `APP1-A01/A02` `BLOCKED_BY_DESIGN_APPROVAL`, `APP1-S01` `BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE`; Admin registry rows remain `REVIEW_REQUIRED`.
