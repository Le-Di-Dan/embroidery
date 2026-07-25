# APP1-A02 — Completion Report

**Checkpoint:** APP1-A02 — Authenticated Admin application shell
**Verdict:** `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`
**Date:** 2026-07-25

## A. Preflight and accepted dependency chain

- **Branch:** `production`. **Initial HEAD (before Commit A):** `9f01083c0cbc1e25b54a2899f0aa76658b99911c`. Working tree clean at start.
- **Product Owner acceptance (supplied by this checkpoint prompt):** `APP1-A01 LIVE TEST = PASSED`. A01 route protection, gateway hydration, API base-path fix, Compose bootstrap and environment policy are accepted baseline and were not reopened.
- **Accepted dependency chain (verified from Git):**
  - APP1-A01 Commit A `27e57e3535fb2732c2b580bad59d8de7ac8dc4aa`, Commit B `930d0cd28df0559b59abcbbfc304967d7ff05649`.
  - APP1-A01-C1 Commit C `9aabbf066fef05e6b7c222645f3f30f053e09c1c`, Commit D `2145137101353df82bee79c85068a08480950262`.
  - APP1-A01-C2 Commit E `32a7854490e79a75c7cdc71c43ce9070cfa4a2b3`, Commit F `9f01083c0cbc1e25b54a2899f0aa76658b99911c`.
  - APP1-B01 `1eeb7f322b2c6662afdd2ce69a2b8fc1aaf4301a`; B01-C1 `1724905c8a697ecad3fc4b30f7d059836990e085`.
  - APP1-B02 `66e2854183ddba8b701360e1f3ee97ea08ee18cf`; B02-C1 `673f1dff39b735e5c184e520d24098088895aba2`.
- **Required reports present:** `APP1-A01-COMPLETION-REPORT.md`, `APP1-A01-C1-CORRECTION-REPORT.md`, `APP1-A01-C2-CORRECTION-REPORT.md`, `APP1-B01-C1-CORRECTION-REPORT.md`, `APP1-B02-C1-CORRECTION-REPORT.md`.
- **Corrected artifacts unchanged:** OpenAPI SHA-256 `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`; generated API-client tree SHA-256 `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`. Required generated operations `staffSelfGet` / `staffSessionDelete` present.
- **`A02_PREFLIGHT = PASS`:** `pnpm quality` = 0; `pnpm check:openapi` / `check:api-client` / `check:styles` / `check:figma-design-index` / `check:e2e` = 0; protected route group + root placeholder + `/login` authenticated redirect + server resolver + QueryClient provider all pre-exist; no prior shell implementation; no schema/migration change; working tree clean.

## B. Approved Figma implementation sources

Registry `docs/design/FIGMA_DESIGN_INDEX.md` §4.1, all six rows `APPROVED_FOR_IMPLEMENTATION`, evidence `FIG-APPROVAL-APP1-D01-ADMIN-001`, file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_01` (`371:3`), section `375:11`:

| Registry ID | State | Viewport | Node | Link |
|---|---|---|---|---|
| FIG-ADMIN-SHELL-DESKTOP-DEFAULT | Default | Desktop | `385:10` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=385-10 |
| FIG-ADMIN-SHELL-DESKTOP-LOADING | Current-staff loading | Desktop | `387:11` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=387-11 |
| FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED | Session expired | Desktop | `387:40` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=387-40 |
| FIG-ADMIN-SHELL-MOBILE-DEFAULT | Default | Mobile | `389:14` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=389-14 |
| FIG-ADMIN-SHELL-MOBILE-NAVOPEN | Navigation open | Mobile | `390:14` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=390-14 |
| FIG-ADMIN-SHELL-MOBILE-SESSIONEXPIRED | Session expired | Mobile | `396:15` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=396-15 |

Design handoff was taken from the canonical registry, the approval record (`docs/design/approvals/APP1-D01-ADMIN-DESIGN-APPROVAL.md`) and the D01 completion report §E–H (shell composition, states, scrim opacities, DS reuse, breakpoints, accessibility). A live re-read of the exact nodes via the Figma MCP was blocked by a transient disconnect (as in APP1-D01 DEV-4); fidelity was confirmed against the documented handoff and the live browser render (§J). See §N.

## C. Protected-layout and shell architecture

- Shell lives in the protected route-group layout `apps/admin/src/app/(protected)/layout.tsx`: `requireServerStaffSession()` → `<AdminShell initialStaff={staff}>{children}</AdminShell>`. Every future protected page inherits the shell automatically; the root page `(protected)/page.tsx` is thin (`<AdminHomePlaceholder />`).
- Feature `apps/admin/src/features/admin-shell/` (feature-first): `components/` (shell, app-bar, brand, identity, logout-button, primary-nav, mobile-drawer, session-expired-dialog, shell-status, home-placeholder), `hooks/` (current-staff query, logout mutation, return-to-login, focus-trap, scroll-lock), `services/` (staff-self, staff-logout), `model/` (copy, nav, session-expiry), `styles/admin-shell.scss`. One component per file; largest source file 83 lines.
- Accepted A01-C1 route protection is preserved unchanged: `proxy.ts` cookie-presence routing, `server/**` authoritative `GET /api/staff/me` validation, `(protected)/layout.tsx` gate, `/login` authenticated redirect. No new guard/provider/API client/auth model introduced; the session token is never parsed or exposed to the client.

## D. Initial staff resolution and query hydration

- The protected layout performs the single authoritative `GET /api/staff/me` server-side. `AdminShell` seeds `useCurrentStaffQuery` with that identity via `initialData` and a bounded `staleTime` (`STAFF_SELF_STALE_TIME_MS = 30_000`), so the query does **not** refetch on mount — exactly one initial backend call per navigation.
- Query key `['staff','self']`; `retry:false`, `refetchOnWindowFocus:true`, `refetchOnReconnect:true`, `refetchInterval:false`. Focus/reconnect re-validation is available after the short freshness window; there is no polling, no renew call, and no keep-alive.
- One QueryClient (the existing `AppProviders`); no second client, no duplicate global staff store, no Zustand/localStorage/sessionStorage. The client cache holds only `id`/`email`/`displayName` (`CurrentStaffResponse`); no role/permission is fabricated and no cookie/session object is passed to client props.

## E. Authenticated shell states

- **Default** (desktop/mobile): app bar (brand, identity, logout, mobile nav trigger), desktop sidebar nav, main content slot, thin placeholder.
- **Loading** (`FIG-ADMIN-SHELL-DESKTOP-LOADING`): a single polite `role="status"` region announces a background current-staff refetch and preserves shell geometry; the animated bar is `aria-hidden` and disabled under `prefers-reduced-motion`. Because the layout resolves staff before render, normal navigation shows no anonymous flash.
- **Session expired**: see §G. Initial server 401 remains owned by the route resolver (redirect to `/login`) and never renders the modal; initial network/5xx surfaces to the protected error boundary, not the modal.

## F. Logout behavior

- `useStaffLogoutMutation` over `staffSessionDelete` (no body, no credential header, no token argument, `retry:false`). The service maps a `401` to success (session already gone) and a `204` to success; both run the shared `useReturnToLogin` (cancel + remove the staff-self query, `router.replace('/login')`, `router.refresh()`).
- A genuine dependency failure (network/timeout/5xx) rejects: the shell stays visible, the cache is untouched, no automatic retry occurs, and a safe non-technical alert with a manual retry is shown — never a raw backend/Axios error. Duplicate activation is blocked (pending guard + `disabled`).

## G. Session-expiry behavior

- The approved modal appears **only** when the shell was already authenticated and a later client refetch returns `401` (`deriveSessionExpiry` reads `error ?? failureReason`, so a data-present background failure is detected). It never appears for the initial server 401, network failure, 5xx, render error, or logout success.
- A later network/5xx refetch yields a `reconnecting` status (shell stays fully usable), not the modal.
- The modal is an `alertdialog` (`aria-modal`, labelled title + description). Focus moves in and is trapped; the already-authenticated shell stays recognizable beneath a non-opaque scrim; background scroll is locked. It cannot be dismissed into the stale shell — Escape is swallowed and the backdrop has no dismiss handler. The single action clears the staff query and returns to `/login`; there is no renew endpoint and no keep-alive polling.

## H. Responsive drawer and accessibility

- **Drawer** (`FIG-ADMIN-SHELL-MOBILE-NAVOPEN`): semantic `role="dialog"` with `aria-modal`; a real trigger button reports `aria-expanded` and `aria-controls`. Focus enters the drawer, Tab/Shift+Tab cycle within it (fully managed), Escape/backdrop/close-button all close it, focus returns to the trigger, body scroll is locked, and the drawer is unmounted on close so no listener leaks.
- **Semantics:** `header`/`nav`/`main` landmarks; a single page-level heading in the placeholder; a keyboard skip link to `#admin-main`; the current location is static text with `aria-current="page"` (no dead anchors); ≥44px touch targets on the nav trigger, logout, close, and re-login controls. FU-A14 accessibility follow-through recorded (no full WCAG claim).

## I. Styling and design fidelity

- SCSS-only, one Admin `main.scss` entry, feature stylesheet `features/admin-shell/styles/admin-shell.scss` composed via `@use`; all colour/type/radius/spacing from `@embroidery/styles` tokens. No inline styles, CSS Modules, Tailwind, CSS-in-JS or wireframe-derived palette.
- Reuses the A01 local `1024px` breakpoint (FU-A16 shared-breakpoint gap preserved, not re-introduced). Token gaps handled per approved guidance: `text/inverse`/`action/disabled` map to value-identical existing tokens (FU-A15); the scrim (GAP-D02 / `FIG-DS-SCRIM-TOKEN`) is a local composition derived from the approved ink text token (drawer 0.35, expiry 0.20). `packages/styles` unchanged.

## J. Tests, browser review, and live smoke

- **Admin:** 23 suites / 141 tests pass (deterministic across two consecutive runs); `admin-shell` feature coverage ~99–100% statements. New suites cover architecture/initial-data (no duplicate `staffSelfGet`, cache seeded, safe fields only, no storage), render (landmarks, exact display name/email, static actor label, no role/permission/session/id, single H1, no fake business features), logout (once, duplicate-blocked, pending, 204/401→login, network keeps shell + retry, no auto-retry, no raw error), session expiry (initial vs later 401, network≠modal, focus trap, Escape/backdrop non-dismiss, re-login clears + navigates, no poll), drawer (open/close by button/Escape/backdrop, focus enter/cycle/return, scroll lock + cleanup), services (real normalizer paths), model, and a source-boundary suite (no fetch/storage/token/bearer/handwritten path/second QueryClient/polling/generated deep import).
- **api-client:** 38 jest tests pass; public-boundary smoke asserts `staffSessionDelete` and `CurrentStaffResponse` are exported.
- **Browser visual review** (real production dev stack, Chromium via the canonical gateway): desktop default, mobile default and mobile drawer-open captured and compared to the documented handoff — app bar/brand/identity/logout, sidebar + future note, thin placeholder, drawer as a dialog with a light scrim and the shell visible beneath, no 390px overflow, identity truncates without breaking the header. Temporary screenshots and the throwaway verification script were removed before Commit A (no PNG committed).
- **Live real-stack smoke** through `http://admin.embroidery.local` (bounded feature smoke, not E01; credentials read from env, never printed):

  | Check | Result |
  |---|---|
  | Anonymous `/` | redirects to `/login` |
  | Login | `204`; cookie name `adm_session` |
  | Shell render | brand `Xưởng Thêu`, static actor `Quản trị viên` |
  | Identity match (UI + `GET /api/staff/me` 200) | `true` |
  | Refresh `/` | remains authenticated |
  | Mobile drawer | opens; closes on Escape |
  | Logout | `204`; redirects to `/login` |
  | Direct `/` after logout | redirects to `/login` |
  | Authenticated `/login` | redirects to `/` |

  Recorded only: browser (Chromium), URL, HTTP status, cookie **name**, route results, identity match = true, logout result. No password, cookie value, session token or credential hash was recorded. Real forced-expiry through the full stack remains APP1-E01 scope; the client expiry state machine and modal are proven in the browser (jsdom) tests (§31).

## K. Contract/security/build evidence

- `pnpm quality` = **PASS** (exit 0). OpenAPI SHA-256 `ae015dd6…` and generated client tree SHA-256 `89c1aace…` **UNCHANGED**. `check:figma-design-index` passes unchanged (33 IDs). `check:styles`, `check:e2e`, file-size, `check:frontend-boundaries`, and the frontend build-boundary (no test code in `.next`) all pass. `git diff --check` clean.
- **Security scan:** no password, raw cookie value, session token, credential hash, bearer/Authorization header, database credential, or real personal email in source, tests or the report. Safe fixture `admin@example.test`. No identity logging, analytics or persistence; the server-only API base URL is not exposed to client code.
- **Dependencies:** none added; no lockfile change. No backend/schema/migration/Figma/registry/Storefront/Compose change.

## L. Commit A evidence

- **Commit A:** `67fd9f60b6989dcaa6a57eaf1c86f9a8b18b878f` — `feat(admin): implement authenticated application shell`.
- **Changed files (37):** 24 under `features/admin-shell/**` (12 components/hooks split, 3 services, 3 model, 1 style, index); `(protected)/layout.tsx` + `page.tsx`; `styles/main.scss`; 10 admin test files (+ updated `smoke/home-page.test.tsx`); `packages/api-client/src/index.ts` + `public-api.smoke.test.ts`.
- **Routes/ownership:** route `/` (protected group, no URL segment); shell owns app-bar/nav/drawer/identity/logout/status/expiry; the layout owns server session resolution; the page owns only the placeholder.
- **API operations used:** `staffSelfGet` (server resolver + client query), `staffSessionDelete` (logout). Types: `CurrentStaffResponse`.

## M. Validation matrix

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/admin typecheck` / `lint` | PASS |
| `pnpm --filter @embroidery/admin test` (×2) | PASS (23 suites / 141 tests) |
| `pnpm --filter @embroidery/admin test:coverage` | PASS (admin-shell ~99–100%) |
| `pnpm --filter @embroidery/admin build` | PASS |
| `pnpm --filter @embroidery/api-client typecheck` / `lint` / `test` | PASS (38 tests) |
| `pnpm check:styles` / `check:figma-design-index` / `check:e2e` | PASS |
| `pnpm check:openapi` / `check:api-client` | PASS (hashes unchanged) |
| `node tools/check-frontend-test-boundaries.mjs` / `check-frontend-build-boundary.mjs` / `check-file-size.mjs` | PASS |
| `git diff --check` | clean |
| `pnpm quality` | PASS (exit 0) |
| Live smoke (`admin.embroidery.local`) | PASS (9/9 route checks) |

## N. Deviations/follow-ups

- **DEV-1 (verification limit):** live Figma node re-read blocked by a transient Figma MCP disconnect (as in APP1-D01 DEV-4). Fidelity confirmed against the approved registry, the approval record, the D01 handoff (§E–H) and the live browser render. No design/registry change was made.
- **DEV-2 (test update):** the pre-existing `test/smoke/home-page.test.tsx` was updated because the root page now renders the thin placeholder inside the shell (the `<main>` moved to the shell layout).
- **DEV-3 (mounted-observer cache assertion):** under mocked navigation the shell never unmounts, so the query observer re-seeds `initialData` after a clear; cache-clear intent is asserted via a `removeQueries` spy. In the real app the redirect unmounts the shell (verified live).
- **Preserved follow-ups:** FU-A14 (a11y verification), FU-A15 (token gaps), FU-A16 (shared breakpoint), GAP-D02/`FIG-DS-SCRIM-TOKEN` (scrim token), FU-A17 (repo-wide `/api` base reconcile).

## O. Acceptance matrix

All PASS: baseline chains + PO acceptance recorded; six shell rows approved; shell in the protected layout inherited by future pages; thin root page; A01 route protection preserved; exactly one initial `staffSelfGet`, query seeded, no mount duplicate, one QueryClient, no duplicate store, no storage, no token/cookie client prop; approved desktop/mobile/loading states; exact display name/email + static actor label; no fabricated role/permission or fake business features; logout via `staffSessionDelete` (204/401→login, network keeps shell + retry, no auto-retry); expiry modal only on later 401, focus-trapped, non-dismissible, re-login clears + navigates, no renew/poll; drawer open/close/focus/scroll-lock/cleanup; semantic landmarks; 390px no overflow; SCSS-only shared tokens; reused local breakpoint; browser review + real login→shell→refresh→logout smoke + redirect matrix; build/figma/openapi/api-client boundaries; secret scan; `pnpm quality`; two commits (implementation-only + evidence-only); report cites Commit A; ≤300 lines; not pushed; E01 not started.

## P. Scope confirmation

No `apps/api`, `apps/storefront`, `apps/worker`, `infrastructure/**`, `packages/database`, `packages/persistence`, `packages/contracts/openapi`, `packages/api-client/src/generated`, or `packages/styles` change. No database schema/migration, Figma file, Figma registry, A01 bootstrap policy, A01 route-protection semantics, or canonical hostname change. No dependency/lockfile change. The only `packages/api-client` change is two public-boundary re-exports (`index.ts`) + its smoke test; the generated tree and OpenAPI artifact are unchanged.

## Q. Evidence closure

- **Commit A:** `67fd9f60b6989dcaa6a57eaf1c86f9a8b18b878f` — implementation + tests only.
- **Commit B (this evidence):** `docs(app1): record APP1-A02 completion evidence` — report + status pointers only, no implementation source.
- **Status after A02:** `APP1-A01 = COMPLETE — CORRECTED — PRODUCT_OWNER_ACCEPTED`; `APP1-A01-C1 = COMPLETE`; `APP1-A01-C2 = COMPLETE`; `APP1-A02 = DELIVERED_FOR_PRODUCT_OWNER_REVIEW`; `APP1-S01 = BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE`; `APP1-E01 = BLOCKED_BY_APP1_A02_PRODUCT_OWNER_REVIEW_AND_APP1_S01`; `APP1-X01 = NOT_STARTED`.
- **Push status:** **NOT PUSHED.**
