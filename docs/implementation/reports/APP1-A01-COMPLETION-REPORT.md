# APP1-A01 — Completion Report

**Checkpoint:** APP1-A01 — Admin staff login screen
**Verdict:** `DELIVERED_FOR_HUMAN_REVIEW` (one screen; approval recorded; not pushed)
**Date:** 2026-07-25

> **APP1-A01-C1 correction (2026-07-25):** The Product Owner had not accepted this
> original A01 delivery. A correction checkpoint fixed three runtime findings —
> password-visibility runtime behaviour (a dev-gateway hydration failure, not the
> component), bidirectional Admin route protection, and automatic Compose admin
> bootstrap. This report's original claims are retained as historical evidence;
> see [`APP1-A01-C1-CORRECTION-REPORT.md`](./APP1-A01-C1-CORRECTION-REPORT.md).
> Status is now `COMPLETE — CORRECTED, DELIVERED_FOR_PRODUCT_OWNER_REVIEW`.

## A. Preflight and dependency chain

- **Branch:** `production`. **Initial HEAD (before Commit A):** `be52c084b757b3b9dd60e34b573f139e74634e0c`. Working tree clean at start.
- **Dependency chain verified from Git:**
  - `APP1-D01` design — Commit A `ca611a9`, evidence `c721ae5` (report `APP1-D01-COMPLETION-REPORT.md`).
  - `APP1-B01` — original `1eeb7f3`, evidence `08a70e9`; `APP1-B01-C1` Zod correction `1724905`, evidence `c3f7026` (`COMPLETE — CORRECTED`).
  - `APP1-B02` — original `66e2854`, evidence `c99c9f4`; `APP1-B02-C1` contract correction `673f1df`, evidence `be52c08` (`COMPLETE — CORRECTED`).
- **Corrected contract baselines (unchanged by A01):** OpenAPI `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`; generated api-client tree `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`.
- **`A01_PREFLIGHT = PASS`:** no prior Admin auth frontend existed; APP1-A02 not started; no schema/migration change. `pnpm quality` = 0 pre- and post-implementation.

## B. Product Owner design approval

The Product Owner reviewed and **PASSED** the APP1 Admin login and authenticated
shell designs. This is authoritative human-review evidence; the proposed
standalone `APP1-D01-A1` checkpoint is **superseded** and was not executed.

- **Approval record (new, canonical):** `docs/design/approvals/APP1-D01-ADMIN-DESIGN-APPROVAL.md`, approval ID `FIG-APPROVAL-APP1-D01-ADMIN-001`.
- **Promoted 13 Admin rows** (`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`, evidence linked) in `FIGMA_DESIGN_INDEX.md` §4.1: 7 login (`FIG-ADMIN-LOGIN-DESKTOP-{DEFAULT,SUBMITTING,VALIDATION,AUTHFAILED,RATELIMITED}`, `FIG-ADMIN-LOGIN-MOBILE-{DEFAULT,ERROR}`) + 6 shell (`FIG-ADMIN-SHELL-DESKTOP-{DEFAULT,LOADING,SESSIONEXPIRED}`, `FIG-ADMIN-SHELL-MOBILE-{DEFAULT,NAVOPEN,SESSIONEXPIRED}`).
- **Storefront unchanged:** shell rows stay `DRAFT`, `FIG-STOREFRONT-NOTFOUND` stays `MISSING`, the reuse-map + 3 APP1-D01 annotation rows stay `REVIEW_REQUIRED`. `APP1-S01` remains `BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE`.
- **Gate:** `pnpm check:figma-design-index` PASS (33 IDs/rows); `node --test tools/check-figma-design-index.test.mjs` 19/19 (checker unchanged — no validation gap).

## C. Figma implementation sources (opened, live)

All seven login nodes were opened live via the Figma MCP (`get_design_context`)
and implemented against the approved DS tokens they reference.

| Registry ID | State | Node | Deep link |
|---|---|---|---|
| FIG-ADMIN-LOGIN-DESKTOP-DEFAULT | Default | 375:12 | …/embroidery?node-id=375-12 |
| FIG-ADMIN-LOGIN-DESKTOP-SUBMITTING | Submitting | 382:9 | …/embroidery?node-id=382-9 |
| FIG-ADMIN-LOGIN-DESKTOP-VALIDATION | Validation | 382:34 | …/embroidery?node-id=382-34 |
| FIG-ADMIN-LOGIN-DESKTOP-AUTHFAILED | Auth Failed | 382:59 | …/embroidery?node-id=382-59 |
| FIG-ADMIN-LOGIN-DESKTOP-RATELIMITED | Rate Limited | 382:84 | …/embroidery?node-id=382-84 |
| FIG-ADMIN-LOGIN-MOBILE-DEFAULT | Default | 380:8 | …/embroidery?node-id=380-8 |
| FIG-ADMIN-LOGIN-MOBILE-ERROR | Error | 383:9 | …/embroidery?node-id=383-9 |

File key `BQwqV8GdfUIELvsQDB1UQE`; full links in `FIGMA_DESIGN_INDEX.md` §4.1.

**Mobile-error interpretation (383:9):** the frame shows the mobile visual
language for both field-validation and generic auth failure. At runtime they
stay distinct — `400` `errors[]` → field messages; `401 STAFF_LOGIN_FAILED` →
one generic form-level alert; never both unless the backend returns both.
Recorded here, in the approval record, and in the phase handoff.

## D. Frontend architecture

- **Route:** `apps/admin/src/app/login/page.tsx` — thin Server Component; sets `noindex`/`nofollow` metadata + Vietnamese title; renders `StaffLoginScreen`.
- **Screen:** `features/staff-auth/components/staff-login-screen.tsx` — Server Component; static editorial brand panel (`staff-login-brand-panel.tsx`) beside the auth card; only the form is a Client Component (smallest client boundary).
- **Feature (`features/staff-auth/`):** `components/` (screen, brand panel, form, field, alert, password toggle), `hooks/` (`use-staff-login-mutation`, `use-retry-countdown`), `services/` (`staff-login.service`), `model/` (`staff-login-form` validation, `staff-login-errors` mapping, `staff-login-display` resolution, `staff-login-copy` catalog), `styles/staff-login.scss`, `index.ts` (exports `StaffLoginScreen` only).
- **Provider:** `providers/app-providers.tsx` — one browser `QueryClient` per mount (retry disabled); client boundary in `app/layout.tsx`; root layout stays a Server Component.
- **API-client boundary:** `staffSessionCreate` + `StaffLoginRequest` are used via the `@embroidery/api-client` public export (added this checkpoint); the browser Axios instance is built once in `config/browser-api-client.ts` from `NEXT_PUBLIC_API_BASE_PATH`. No `fetch`, no deep generated import, no ad-hoc Axios, no manual URL, no cookie/token storage.

## E. State and error behavior

| State | Backend | UI |
|---|---|---|
| Default | — | Two-column (desktop) / stacked (mobile); approved copy. |
| Submitting | in-flight | Button `Đang đăng nhập…`, disabled, `aria-busy`; fields disabled+dimmed; duplicate submit blocked. |
| Client-invalid | — (no call) | Field messages, `aria-invalid`, focus to first invalid; API not called. |
| Field errors | `400` `errors[]` | Messages mapped to `email`/`password`; unknown field → safe form-level fallback; no raw payload/requestId. |
| Auth failed | `401 STAFF_LOGIN_FAILED` | One generic form-level alert; no account enumeration. |
| Rate limited | `429` + `Retry-After` | Warning alert with parsed duration; button disabled with bounded countdown; re-enables at 0 without reload; invalid/absent header → safe non-countdown fallback; never auto-resubmits. |
| Network/system | offline/timeout/5xx | Safe fallback `Hiện chưa thể đăng nhập. Vui lòng thử lại.`; retry on user action. |
| Success | `204` | `router.replace('/')` + `router.refresh()`; cookie owned by browser; shell is APP1-A02. |

Field validation and generic auth failure are separate states; a new submit
clears stale form-level errors; editing a field clears only that field's error.

## F. Responsive and accessibility

- **Responsive:** mobile-first SCSS; two-column editorial ≥ local 1024px breakpoint, stacked below (design defers breakpoint tokens — recorded as a local implementation decision, not a new global token). No 390px horizontal overflow; card grows with errors; long Vietnamese copy wraps; touch targets ≥ 44px.
- **Styling:** SCSS-only, shared `@embroidery/styles` tokens, one `main.scss` entry via `@use`; feature-scoped class names; no inline style / CSS Module / Tailwind / CSS-in-JS. `pnpm check:styles` PASS.
- **Accessibility (`FU-A14`, addressed):** single page `h1` (form title); persistent labels; `email`/`current-password` autocomplete; `aria-invalid` + `aria-describedby` on errored fields; `role="alert"` form message that receives focus when the submit button disables; password toggle is a `type="button"` with `aria-pressed` and a changing accessible name; visible focus rings; reduced-motion-safe transition; countdown not announced on each tick. Not a full WCAG claim.

## G. Tests and visual review

- **Suites/tests:** `@embroidery/admin` **10 suites / 50 tests** PASS (run twice, stable). Coverage: staff-auth **100%** stmts across components/hooks/model (errors/display/form), providers 100%; `config`/`services` are thin injected seams (build- and E2E-covered). `@embroidery/api-client` 3 suites / 7 tests PASS (public-boundary smoke extended for `staffSessionCreate`).
- **Coverage of behaviors:** rendering/semantics, no self-service affordances, interaction (type, toggle, button + Enter submit, duplicate-submit block, pending), success navigation, client validation, backend field errors, unknown-field fallback, auth failure, rate-limit countdown + re-enable + fallback, network fallback + retry, and a source-boundary suite (no `fetch`/storage/cookie/inline-style/deep generated import). No live network.
- **Browser visual verification (temporary, non-committed screenshots, removed before Commit A):** Admin app served from the production build; reviewed at 1440×900 and 390×844 — desktop default, desktop validation, desktop form-level alert (real, via a failing POST), mobile default, mobile validation. Split layout, spacing, form width, alert placement, red-bordered error fields with icon+text, and no 390px overflow all matched the approved nodes. `401`/`429` exact-copy states were verified against the live Figma design context and the component tests.

## H. Contract and security evidence

- **Generated operation:** `staffSessionCreate(body, options?)` → `204`; verified reachable via the public boundary. `pnpm check:openapi` and `pnpm check:api-client` PASS — OpenAPI `ae015dd6…` and client tree `89c1aace…` **unchanged** (no backend/generated edit).
- **Security:** no password/cookie/token/`Authorization`/personal email in source or tests (safe fixtures `admin@example.test`); the browser never reads/writes the session cookie; no analytics on inputs; `returnTo` not introduced. Secret scan clean.

## I. Commit A evidence

- **Commit A:** `27e57e3535fb2732c2b580bad59d8de7ac8dc4aa` — `feat(admin): implement staff login screen` — **31 files** (+2070/-15): approval record, registry promotion, api-client public export (+smoke test), `layout.tsx`, `main.scss`, login route, `config/browser-api-client.ts`, `providers/app-providers.tsx`, full `features/staff-auth/**`, and `apps/admin/test/**` (component/model/boundary/support).
- **Dependency status:** no new dependency; no `pnpm-lock.yaml` change.

## J. Validation matrix

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @embroidery/admin typecheck` | 0 | clean |
| `pnpm --filter @embroidery/admin lint` | 0 | clean |
| `pnpm --filter @embroidery/admin test` (×2) | 0 | 10 suites / 50 tests |
| `pnpm --filter @embroidery/admin test:coverage` | 0 | staff-auth 100% |
| `pnpm --filter @embroidery/admin build` | 0 | `/login` prerendered |
| `pnpm check:styles` | 0 | pass |
| `pnpm check:figma-design-index` + tool test | 0 | 33 IDs; 19/19 |
| `pnpm check:openapi` / `check:api-client` | 0 | hashes unchanged |
| `pnpm check:e2e` | 0 | boundary clean |
| `node tools/check-frontend-test-boundaries.mjs` | 0 | clean |
| `node tools/check-frontend-build-boundary.mjs` | 0 | 2273 files, no test code |
| `node tools/check-file-size.mjs` | 0 | no hard violation |
| `git diff --check` | 0 | clean |
| `pnpm quality` | 0 | PASS |

## K. Deviations and follow-ups

- **DEV-1 (scope, justified):** `packages/api-client/src/index.ts` (+ smoke test) was modified — outside the literal §29 file list but required by §14/§26 (feature code must not deep-import the generated tree). It only re-exports `staffSessionCreate` + `StaffLoginRequest`; generated files, OpenAPI and the client tree hash are unchanged.
- **DEV-2 (scope, justified):** `apps/admin/src/config/browser-api-client.ts` places the shared browser Axios factory at app-shared scope (narrowest valid scope for infrastructure reused by every future feature), a natural location not enumerated in §29.
- **FU-A15 (token gaps):** `@embroidery/styles` lacks `$color-text-inverse` (#ffffff) and `$color-action-disabled` (#d6d3d1); A01 maps them to the value-identical `$color-surface-primary` / `$color-border-secondary` rather than hard-coding hex, and does not modify the locked styles package. Adding the tokens is deferred.
- **FU-A16 (local breakpoint):** login uses a local 1024px layout breakpoint (design system defers breakpoint tokens); revisit when a shared breakpoint scale is introduced.

## L. Acceptance matrix

- Dependency chain + corrected contract hashes verified — **PASS**.
- Product Owner approval recorded; exactly 13 Admin rows promoted; 0 Storefront rows — **PASS**.
- Seven login nodes opened; mobile-error interpretation recorded — **PASS**.
- `/login` implemented; thin route; feature-first; public api-client import; `staffSessionCreate`; no fetch/manual URL/token storage; handwritten mutation; no credential retry — **PASS**.
- Default/submitting/validation/auth/rate-limit/network/success behavior + Retry-After + safe fallback + success redirect; no shell built — **PASS**.
- SCSS-only + shared tokens; no prohibited styling; responsive; no 390px overflow; a11y labels/focus/errors/alerts; `FU-A14` addressed — **PASS**.
- Component tests pass (no live network); browser visual verification complete; Admin build + `.next` boundary + figma-index + OpenAPI/client checks — **PASS**.
- No backend/schema/generated-client/Figma modification; no real secret; `pnpm quality` 0 — **PASS**.

## M. Scope confirmation

No change to `apps/api/**`, `apps/storefront/**`, `apps/worker/**`, `packages/database/**`, `packages/persistence/**`, `packages/styles/**`, `packages/contracts/**`, generated api-client, OpenAPI artifact, database schema/migrations, infrastructure, or Figma files. No dependency/lockfile change. APP1-A02, S01, E01, X01 not started.

## N. Evidence closure

- **Commit A (implementation + approval):** `27e57e3535fb2732c2b580bad59d8de7ac8dc4aa`.
- **Commit B (this evidence):** `docs(app1): record APP1-A01 completion evidence`.
- **Pre-Commit-B tree:** clean except this report and the APP1 status/phase pointers.
- **Push status:** **NOT PUSHED.**
- **Status after A01:** `APP1-D01 = COMPLETE — ADMIN DESIGN APPROVED`, `APP1-A01 = COMPLETE`, `APP1-A02 = READY, NOT STARTED`, `APP1-S01 = BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE`, `APP1-E01/X01 = NOT_STARTED`.
