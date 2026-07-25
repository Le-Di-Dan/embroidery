# APP1-S01A — Completion Report

**Checkpoint:** APP1-S01A — Implement the Storefront shared shell and responsive navigation
**Parent:** APP1-S01 — Storefront shell and not-found boundary (split S01A/S01B)
**Status:** `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`
**Date:** 2026-07-25
**Design classification consumed:** APP1-D02 `SUPPLEMENT`

---

## A. Preflight and accepted D02 baseline

- **Initial HEAD:** `f4f336a0f4602fbde5af7bd556dc664ec4b0f285`.
- **Branch:** `production`. Working tree clean; no dependency/schema/API change.
- **APP1-A02** (`COMPLETE — PRODUCT_OWNER_ACCEPTED`): Commit A `67fd9f6`, evidence
  Commit B `9310940` (`docs/implementation/reports/APP1-A02-COMPLETION-REPORT.md`).
- **APP1-D02** (`SUPPLEMENT`): design Commit A `eb57ad2`, evidence Commit B
  `f4f336a` (`docs/implementation/reports/APP1-D02-COMPLETION-REPORT.md`); seven
  rows verified `REVIEW_REQUIRED` at preflight; Homepage shell rows `SUPERSEDED`.
- No Storefront shell or not-found implementation existed (only `layout.tsx`,
  `page.tsx`, `healthz`, `main.scss`).
- **`S01A_PREFLIGHT = PASS`** — `pnpm quality`, `pnpm --filter @embroidery/storefront test`
  (4 suites/8), `check:figma-design-index` (39 IDs), `check:styles` all green.

## B. Product Owner design approval and registry promotion

- The Product Owner reviewed the APP1-D02 package in Figma: **`APP1-D02 DESIGN
  REVIEW = PASSED`**. Recorded in the canonical approval record
  `docs/design/approvals/APP1-D02-STOREFRONT-DESIGN-APPROVAL.md`, approval ID
  **`FIG-APPROVAL-APP1-D02-STOREFRONT-001`** (recorded by APP1-S01A).
- The seven D02 rows in `docs/design/FIGMA_DESIGN_INDEX.md` §4.2 were promoted
  `REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`, evidence
  `FIG-APPROVAL-APP1-D02-STOREFRONT-001`, Last Verified `2026-07-25`:
  `FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT`, `-TABLET-DEFAULT`, `-MOBILE-DEFAULT`,
  `-MOBILE-NAVOPEN`, `-NOTES`, `FIG-STOREFRONT-NOTFOUND`, `-NOTFOUND-MOBILE`.
- No Admin (§4.1) row changed. The three `SUPERSEDED` Homepage shell-reference
  rows are unchanged. Gate: `pnpm check:figma-design-index` PASS (39 IDs);
  `node --test tools/check-figma-design-index.test.mjs` 19/19.
- The `APP1-S01` → `S01A`/`S01B` split is recorded in the phase plan.

## C. Figma implementation sources (verified)

Product file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_01` (`371:3`), section `405:2224`.
Node access verified against the accepted D02 evidence (the live Figma MCP
connection was unavailable this session — see §M); the nodes are unchanged since
D02 Commit A (design tree untouched, working tree clean).

| Registry ID | State | Viewport | Node | Link |
|---|---|---|---|---|
| FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT | Default | Desktop | 405:2225 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-2225 |
| FIG-STOREFRONT-SHELL-TABLET-DEFAULT | Default | Tablet | 405:3733 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-3733 |
| FIG-STOREFRONT-SHELL-MOBILE-DEFAULT | Default | Mobile | 405:3786 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-3786 |
| FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN | Nav open | Mobile | 410:2311 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=410-2311 |
| FIG-STOREFRONT-SHELL-NOTES | Handoff notes | Reference | 412:2396 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=412-2396 |

Compared against Homepage references `183:7` / `189:266` / `191:412`; Homepage
content was not used as shell content.

## D. Storefront shell architecture

- **Layout owner:** `apps/storefront/src/app/layout.tsx` (root layout) stays a
  Server Component and wraps every route in `StorefrontShell`.
- **Feature:** `apps/storefront/src/features/storefront-shell/` —
  `components/` (`storefront-shell`, `-header`, `-brand`, `-primary-nav`,
  `-search-affordance`, `-mobile-nav`, `-mobile-drawer`, `-footer`),
  `hooks/` (`use-focus-trap`, `use-scroll-lock`), `model/`
  (`storefront-navigation`, `storefront-shell-copy`), `styles/storefront-shell.scss`,
  `index.ts` (only `StorefrontShell` is public).
- Ownership: `layout → StorefrontShell → StorefrontHeader → <main id="main-content"> → StorefrontFooter`.
- **Client boundary limited to interaction:** the sole `'use client'` island is
  `StorefrontMobileNav` (trigger + drawer + hooks). Header, footer, brand, nav,
  search, and the shell itself are Server Components. No new provider, no
  TanStack Query provider, no Zustand store.
- The existing home page is wrapped once (its `<main>` removed so the shell owns
  the single `<main>` landmark; scaffold content preserved). `/` remains static
  (server-prerendered) in the build.

## E. Responsive header/navigation/footer behavior

- **Header:** one responsive component. Full inline layout (brand · primary nav ·
  search) above 1024px; Compact layout (brand · mobile trigger) at ≤1024px. Local
  breakpoints `$bp-nav: 1025px` (Full above 1024; Compact at 1024 and below, so
  both approved Compact frames — mobile 390 and tablet 1024 — match) and
  `$bp-footer: 768px`. No global breakpoint token (FU-A16).
- **Footer:** desktop/tablet row composition ≥768px; compact stacked composition
  <768px. Brand wordmark + approved tagline + rights only.
- Content width ~1200px, centered; 16px horizontal padding, 24px ≥768px.

## F. Mobile drawer and accessibility

- Semantic `role="dialog" aria-modal="true"`, labelled; trigger is a real button
  with `aria-expanded` + `aria-controls="storefront-mobile-drawer"`.
- Focus enters on open (first focusable), Tab/Shift+Tab trapped, Escape and
  backdrop close, explicit close button, **focus returns to the trigger**
  (restored synchronously in the close handler — deterministic across browsers),
  body scroll locked, listeners/scroll-lock cleaned on unmount.
- Scrim: local `ink/900 @45%` composition (GAP-D02 / FIG-DS-SCRIM-TOKEN preserved).
- Skip link → `#main-content`; `<header>/<nav>/<main>/<footer>` landmarks; the
  shell creates no page `<h1>`; ≥44px targets; `prefers-reduced-motion` honored;
  long Vietnamese copy wraps without overflow. Full WCAG conformance is not claimed.

## G. Search/navigation capability boundaries

- **Navigation:** brand links to the canonical home route `/` only. The five
  approved primary-nav labels (Khám phá / Bộ sưu tập / Studio / Đặt thêu / Nhật ký)
  are rendered as **non-interactive** text (`aria-disabled`, visible "Sắp ra mắt"
  tag in the drawer, screen-reader "chưa khả dụng") because their routes are not
  built — no dead anchors, no invented routes. Decision: visual preservation of
  the approved header without fabricating capability.
- **Search:** no canonical search route/backend exists, so the affordance is
  presentational — not an `<input>`, not focusable, submits nowhere, calls no API;
  an accessible note announces it is unavailable (§10 honest behavior).

## H. Styling and metadata

- SCSS-only via `@embroidery/styles`; single `main.scss` entry `@use`s the feature
  leaf. Tokens for colour/type/spacing/radius/motion/control sizes; only approved
  shell-specific composition values are local literals (documented inline). No
  inline styles, CSS Modules, Tailwind, CSS-in-JS. `packages/styles` unchanged.
- Metadata/SSR preserved: `lang="vi"`, existing storefront title/description
  unchanged, no global `noindex`, no client-only metadata. Favicon absence noted
  (§M follow-up).

## I. Tests, visual review, and live smoke

- **Component/boundary tests:** 8 suites / 34 tests (was 4/8). New: render/structure,
  drawer, footer, source-boundary (+ not-found exclusion). Coverage: overall
  99.22% stmts; `features/storefront-shell` components 100%, hooks 96%
  (uncovered = defensive null guards). Focused shell+drawer suites ran **twice**,
  14/14 both runs.
- **Browser visual review** (Playwright MCP, temporary, removed before Commit A) at
  1440/1024/390 + drawer open: desktop Full nav+search; tablet 1024 Compact
  (hamburger); mobile 390 Compact + stacked footer; drawer panel + scrim; no 390px
  horizontal overflow; visible focus; content not duplicated.
- **Live gateway smoke:** `http://embroidery.local/` (Chromium via the dev Compose
  gateway). Root 200; existing content renders inside the shell; header/footer at
  all three viewports; drawer opens/closes; Escape closes and returns focus to the
  trigger; brand→home; **0 console errors** after the hydration fix; no hydration
  failure; static assets load through the gateway. No credentials (public shell).

## J. Build/security/boundary evidence

- `pnpm --filter @embroidery/storefront build` succeeds; `/` static, `/healthz`
  dynamic; `/_not-found` is Next's framework default (no custom file added).
- `node tools/check-frontend-build-boundary.mjs` clean (no test code in `.next`);
  `node tools/check-frontend-test-boundaries.mjs` clean; `node tools/check-file-size.mjs`
  pass (no new file over threshold); `git diff --check` clean.
- Shell source uses no `fetch`, no api-client, no cookie/token/storage, no new
  QueryClient/store/Axios, no `href="#"`, no not-found reference (boundary tests).

## K. Commit A evidence

**Commit A:** `0b11fbb0d2202cb4fe477b8fc26408079f67ed8d`
`feat(storefront): implement shared application shell`

Files (26): approval record; `FIGMA_DESIGN_INDEX.md`; phase plan; storefront
`next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `styles/main.scss`; the
`features/storefront-shell/**` tree (17 files); four test files
(`test/boundary`, `test/components/*`, `test/smoke/home-page.test.tsx`).

## L. Validation matrix

| Gate | Result |
|---|---|
| `pnpm quality` (all sub-checks) | PASS (exit 0) |
| storefront typecheck / lint | PASS |
| storefront test / coverage | 34/34; 99.22% |
| focused suites ×2 | 14/14 both |
| storefront build | PASS |
| check:styles | PASS |
| check:figma-design-index + test | PASS (39 IDs) / 19 |
| check:openapi / check:api-client | PASS (unchanged) |
| check:e2e / spike-boundaries | PASS |
| frontend build/test boundary, file-size, diff-check | PASS |
| live gateway smoke (1440/1024/390 + drawer) | PASS, 0 console errors |

## M. Deviations / follow-ups

1. **`next.config.ts allowedDevOrigins`** (dev-only): the storefront lacked the
   gateway-host allow-list that Admin gained in APP1-A01-C1; without it the client
   never hydrated through `embroidery.local` and the drawer was inert. Added
   `allowedDevOrigins: [STOREFRONT_HOST ?? 'embroidery.local']`; ignored by
   production builds. Necessary for the checkpoint's live-smoke acceptance; in-app,
   not a prohibited path; no infrastructure/compose change (fallback default used).
2. **1024 boundary:** §6 overlaps at 1024; the approved tablet frame (1024) is
   Compact and Full clips at 1024 (D02 finding), so 1024 renders Compact and Full
   begins above 1024.
3. **Live Figma re-read unavailable:** the Figma MCP server was disconnected this
   session; node verification relied on the accepted D02 evidence (unchanged nodes,
   clean tree) rather than a live re-read.
4. **Content follow-ups (non-blocking):** footer link columns (policy/contact/
   social) and a storefront favicon await canonical brand content; omitted rather
   than invented. `FU-A16` (shared breakpoint scale) remains open.

## N. Acceptance matrix

All 47 acceptance criteria met: A02/D02 chains verified; PO approval recorded;
seven rows promoted; no Admin row changed; Homepage `SUPERSEDED` preserved; split
documented; five nodes verified; shell in the canonical layout; content wrapped
once; server-first; client boundary limited to the drawer; desktop/tablet/mobile
and drawer match the approved design; landmarks + skip link; no global `h1`; only
canonical navigation; no dead/fake routes; honest search; no invented footer data;
drawer focus/Escape/backdrop/return/scroll-lock; no 390 overflow; SCSS-only/tokens;
metadata/SSR preserved; tests pass twice; browser + gateway smoke pass; no
hydration/console error; build/boundary pass; Figma checks pass; OpenAPI/client
unchanged; no backend/schema/infra/Figma/package-style/dependency change; no
not-found; `pnpm quality` passes; two commits; tree clean; not pushed; S01B/E01
not started.

## O. Scope confirmation

Delivered: shared shell, responsive header/nav/footer, mobile drawer, `<main>`
slot, shell semantics. **Not** delivered (out of scope): not-found screen, Homepage
redesign/business sections, product listing/detail, search backend, cart, wishlist,
checkout, customer account/auth, tracking, chatbot, Design Studio, new API
endpoints, database/schema changes.

## P. Evidence closure

- **APP1-D02** → `COMPLETE — PRODUCT_OWNER_ACCEPTED`.
- **APP1-S01** → `IN_PROGRESS`; **APP1-S01A** → `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`.
- **APP1-S01B** → `BLOCKED_BY_APP1_S01A_PRODUCT_OWNER_REVIEW` (not started).
- **APP1-E01** → `BLOCKED`; **APP1-X01** → `NOT_STARTED`.
- Two commits (A `0b11fbb` implementation/approval; B evidence). Working tree
  clean; **not pushed**. S01B not started.
