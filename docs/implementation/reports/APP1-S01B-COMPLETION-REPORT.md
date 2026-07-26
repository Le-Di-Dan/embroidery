# APP1-S01B — Completion Report

**Checkpoint:** APP1-S01B — Implement the Storefront not-found boundary
**Parent:** APP1-S01 — Storefront shell and not-found boundary (split S01A/S01B)
**Status:** `COMPLETE — PRODUCT_OWNER_ACCEPTED`
**Date:** 2026-07-25
**Design classification consumed:** APP1-D02 `SUPPLEMENT`

> **Product Owner acceptance (recorded at APP1-E01):** `APP1-S01B LIVE TEST = PASSED`
> → `APP1-S01B = COMPLETE — PRODUCT_OWNER_ACCEPTED`; with S01A accepted, the parent
> `APP1-S01 = COMPLETE — PRODUCT_OWNER_ACCEPTED`. The not-found boundary is
> additionally re-verified end-to-end by the APP1-E01 cross-layer suite (J09).

---

## A. Preflight and accepted S01A baseline

- **Initial HEAD:** `ae6206b3fb4efd0734c5aadc20823aeef146d182` (APP1-S01A Commit B).
- **Branch:** `production`; working tree clean; no dependency/schema/API change.
- **Product Owner acceptance (supplied by this checkpoint):** `APP1-S01A LIVE TEST =
  PASSED` → **`APP1-S01A` = `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (recorded as a note
  on `APP1-S01A-COMPLETION-REPORT.md`; no separate S01A approval checkpoint created).
- **Accepted chains (read from Git):**
  - APP1-D02: A `eb57ad2` (`design(app1): complete Storefront shell coverage`),
    B `f4f336a` (`docs(app1): record Storefront design supplement evidence`);
    report `APP1-D02-COMPLETION-REPORT.md`.
  - APP1-S01A: A `0b11fbb` (`feat(storefront): implement shared application shell`),
    B `ae6206b` (`docs(app1): record APP1-S01A completion evidence`);
    report `APP1-S01A-COMPLETION-REPORT.md`.
- **No custom not-found implementation existed** at preflight (`app/not-found.tsx`
  absent; the S01A boundary test asserted its absence).
- **`S01B_PREFLIGHT = PASS`:** `pnpm quality` (exit 0), `pnpm check:figma-design-index`
  (39 IDs), `node --test tools/check-figma-design-index.test.mjs` (19/19),
  `pnpm check:styles`, `pnpm check:e2e`, `git diff --check` — all clean.

## B. Approved Figma implementation sources

All `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP1-D02-STOREFRONT-001`
(`../../design/approvals/APP1-D02-STOREFRONT-DESIGN-APPROVAL.md`), section `405:2224`,
page `APP_01`, file `BQwqV8GdfUIELvsQDB1UQE`:

| Registry ID | Viewport | Node | Link |
|---|---|---|---|
| FIG-STOREFRONT-NOTFOUND | Desktop 1440 | `411:2337` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=411-2337 |
| FIG-STOREFRONT-NOTFOUND-MOBILE | Mobile 390 | `411:3851` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=411-3851 |
| FIG-STOREFRONT-SHELL-NOTES | Handoff | `412:2396` | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=412-2396 |

All three rows re-verified `APPROVED_FOR_IMPLEMENTATION`. Figma MCP required
interactive OAuth (transiently unavailable), so per CLAUDE.md §3 / prompt §3 step 5
the **accepted D02 handoff** was used: it pins the "404" code, heading, both
recovery labels, the responsive states, and the tablet interpolation. Tablet `/404`
is an interpolation annotation (Compact header, desktop type scale, ~560 centered
container, horizontal actions) — no dedicated frame — and was implemented as such.

## C. Next.js not-found architecture

- Next.js `^16.2.10` (App Router, Turbopack). Canonical special file
  `apps/storefront/src/app/not-found.tsx` — no fake catch-all route, no
  `global-not-found.tsx` (the root layout owns a body, so the built-in requirement
  for `global-not-found` does not apply).
- The framework renders the boundary and returns **HTTP 404** for any unmatched URL
  and for any future `notFound()` call. Next owns the status; nothing changes it at
  runtime (no client `window.location` / effect status hack — enforced by test).
- Ownership: root layout → `StorefrontShell` (header · `<main id="main-content">` ·
  footer) → `not-found.tsx` content. The boundary renders into the **existing**
  `<main>` slot and adds no second header/footer/main/drawer/landmark.

## D. Content and recovery behavior

- **Feature:** `apps/storefront/src/features/storefront-not-found/`
  (`components/storefront-not-found.tsx` [Server Component], `model/…-copy.ts`,
  `styles/…-not-found.scss`, `index.ts`). Route file stays thin (delegates only).
- **Copy (Vietnamese, safe):** decorative `404` (`aria-hidden`, not the a11y title),
  `<h1>` = "Không tìm thấy trang", explanation = "Trang bạn tìm có thể đã được di
  chuyển, đổi đường dẫn hoặc không tồn tại. Hãy quay về trang chủ để tiếp tục khám
  phá." The heading, code, and both action labels are pinned by the D02 handoff; the
  explanatory sentence follows the approved **safe-copy** intent — it uses "có thể"
  (may), never claims deletion, and echoes no path/request-id/stack/diagnostic. Copy
  stays valid for a mistyped URL, a stale link, a removed page, and a `notFound()`.
- **Primary recovery:** `next/link` "Về trang chủ" → canonical `STOREFRONT_HOME_ROUTE`
  (`/`), visually dominant, keyboard-focusable.
- **Secondary recovery decision:** the approved label is "Khám phá tác phẩm". The
  discovery route is **canonical but not implemented** (owned by a later phase), and
  no stable home fragment exists for it. Per §9 the smallest honest behavior was
  chosen: render it as a **clearly unavailable, non-interactive** affordance (muted
  outline + "Sắp ra mắt" tag + sr-only "Khám phá tác phẩm — chưa khả dụng.") —
  mirroring the accepted S01A nav treatment. **No** `href="#"`, invented route, alert,
  or dead link. The discovery route ships with the phase that owns that area.

## E. Shell integration and responsive behavior

- Reuses S01A `StorefrontShell`/`StorefrontHeader`/`StorefrontFooter`/
  `StorefrontMobileNav`, the `<main id="main-content">` slot, and the skip link
  unchanged. The not-found page owns the single `<h1>`; the shell keeps the only
  `<main>`. Verified landmark result: one header, one nav, one main, one h1, one
  footer (component + browser).
- **Minimal shell integration correction:** the shell public index now also exports
  `STOREFRONT_HOME_ROUTE` so the boundary reuses the single route source instead of
  re-hard-coding `/`. No shell behavior changed. The S01A shell boundary test was
  updated (it no longer asserts not-found absence; it still asserts the shell grows
  no 404 of its own).
- **Responsive (S01A breakpoints; FU-A16 preserved, no new breakpoint token):**
  desktop centered ~560 container, desktop type scale (72/40), horizontal actions,
  footer row; tablet 1024 Compact header + desktop scale + horizontal actions;
  mobile 390 Compact header, mobile scale (56/32), wrapped copy, **stacked
  full-width** actions, compact mobile footer, no horizontal overflow.

## F. Accessibility and styling

- Single page `<h1>`; the "404" code is decorative (`aria-hidden`) so it is never the
  only accessible title; `<section aria-labelledby>` names the region by the heading.
  Reading/focus order heading → primary → secondary. Visible focus on the primary
  link; action min-height 44px (`$size-touch-target-min`). No focus trap, no
  autofocus. Long Vietnamese wraps; no 390px overflow. Reduced motion honored
  (`styles.motion-safe`). The S01A skip link still targets `#main-content`.
  **Full WCAG conformance is not claimed.**
- **SCSS only**, via `@embroidery/styles` tokens, composed through the existing
  `apps/storefront/src/styles/main.scss` `@use`. Colour/type/radius/spacing/motion/
  control-size are tokens; documented local literals: `$content-measure: 560px`,
  `$bp-wide: 768px` (reuses the shell footer threshold). No inline style, CSS
  Modules, Tailwind, CSS-in-JS, styled-jsx, or hard-coded DS colour. `packages/styles`
  untouched. GAP-D02 / FU-A16 not expanded here.

## G. Tests, visual review, and gateway live smoke

- **Storefront Jest:** 11 suites / 53 tests pass; coverage 99.35% overall,
  **not-found feature 100%** (stmts/branch/funcs/lines). New suites:
  `storefront-not-found-content` (content, honest recovery, thin route, focus order),
  `storefront-not-found-integration` (single landmarks inside the shell, skip link,
  drawer available), `storefront-not-found-source` (node-env boundary: no
  fetch/API/storage/inline-style/dead-anchor/`window.location`/Figma/Server-Component
  + canonical-route wiring). Not-found focused suites ran **twice** (3 suites/20
  tests, stable) pre- and post-commit.
- **Browser visual review (Playwright, Chromium via gateway `http://embroidery.local`):**
  desktop 1440, tablet 1024, mobile 390 all match the approved states; mobile drawer
  opens from the 404, Escape closes it and **returns focus to the trigger** with
  scroll-lock released; primary is a focusable `<a href="/">`; a long invalid URL at
  390 shows no horizontal overflow and **no path echo**.
- **Gateway live smoke (`http://embroidery.local`):**

  | Check | Result |
  |---|---|
  | Invalid path `/__app1-s01b-not-found-smoke__` | **HTTP 404** |
  | Approved heading visible | "Không tìm thấy trang" ✓ |
  | Shared header/footer visible | ✓ |
  | Primary recovery → `/` | navigates to home (200), home `<h1>` renders ✓ |
  | Valid `/` | **200** (not noindex, not the 404) |
  | Valid `/healthz` | **200** (unchanged) |
  | Static asset (main.scss chunk) | **200** |
  | Mobile drawer + Escape | works ✓ |
  | Console errors | 2 benign only — the document's own 404 status and the pre-existing missing `favicon.ico`; **no hydration/app-code error** |

  A brand-new App Router special file required one storefront dev-container restart
  to be registered (before it, the built-in `__next_builtin__not-found` served) —
  same class as the S01A stale-compile gotcha; not a code defect. The smoke path is
  **not** a real route.

## H. Build / security / boundary evidence

- `pnpm --filter @embroidery/storefront build` clean; route table lists `○ /_not-found`
  using the custom boundary. `node tools/check-frontend-build-boundary.mjs` clean
  (2404 built files, no test code). `node tools/check-frontend-test-boundaries.mjs`
  clean. `node tools/check-file-size.mjs` PASS (no new file near threshold).
- **Security scan** (source/tests): no password/secret/token/cookie/credential/email/
  filesystem-path/stack-trace. The arbitrary invalid path is never echoed in the page.
- `pnpm check:openapi` — artifact up to date (unchanged). `pnpm check:api-client` —
  generated client up to date (tree hash `89c1aace…`, unchanged). `pnpm check:e2e`
  clean. `pnpm check:styles` clean. `pnpm check:figma-design-index` PASS (39 IDs).
  `git diff --check` clean.

## I. Commit A evidence

- **Commit A `f45821b546a883f818763ad3f1279913cdb09b5a`** —
  `feat(storefront): add not-found boundary`. **11 files:**
  - New: `app/not-found.tsx`; `features/storefront-not-found/`
    (`index.ts`, `components/storefront-not-found.tsx`,
    `model/storefront-not-found-copy.ts`, `styles/storefront-not-found.scss`);
    tests `test/boundary/storefront-not-found-source.test.ts`,
    `test/components/storefront-not-found-content.test.tsx`,
    `test/components/storefront-not-found-integration.test.tsx`.
  - Modified: `features/storefront-shell/index.ts` (export `STOREFRONT_HOME_ROUTE`),
    `styles/main.scss` (`@use` not-found), `test/boundary/storefront-shell-source.test.ts`
    (scope-guard update).
- No completion report, no schema/infra/dependency/generated-client change. Commit A
  frozen before report creation; not amended afterward.

## J. Validation matrix

| Gate | Result |
|---|---|
| `pnpm quality` | **PASS (exit 0)** |
| storefront typecheck / lint | PASS / PASS |
| storefront test (11 suites / 53 tests) | PASS |
| storefront coverage (not-found 100%) | PASS |
| storefront build (`/_not-found` custom) | PASS |
| not-found focused suites ×2 | PASS (stable) |
| frontend build-/test-boundary, file-size | PASS |
| check:styles / check:figma-design-index (+unit ×19) | PASS |
| check:openapi / check:api-client (unchanged) | PASS |
| check:e2e / git diff --check | PASS |
| gateway 404 smoke + valid-route regression | PASS |

## K. Deviations / follow-ups

- **Secondary recovery** rendered as honestly-unavailable (not a link): the discovery
  route is unbuilt (§D). It becomes a link in the phase that ships discovery.
- **Figma via handoff, not live MCP** (interactive OAuth unavailable): the accepted
  D02 handoff pinned heading/code/labels/layout; the explanatory sentence follows the
  approved safe-copy intent (§B, §D). No fabricated node.
- **Dev-container restart** needed once to register the new special file (§G) —
  environment behavior, no code change.
- **Not-found metadata:** no custom `metadata` export; the boundary inherits the
  generic title and Next's automatic 404 `noindex`. Valid-page metadata baseline
  unchanged (verified: `/` is not noindex).

## L. Acceptance matrix

All 45 acceptance criteria (§29) met: D02/S01A chains verified; PO S01A acceptance
recorded; approved desktop/mobile/notes nodes verified; canonical `app/not-found.tsx`;
no fake catch-all; unmatched URL → 404; valid `/` and `/healthz` remain 200; renders
inside the existing shell; no duplicate header/footer/main/drawer; one page `<h1>`;
approved Vietnamese copy; no technical detail/path echo; primary → `/`; secondary
honestly unavailable; no dead/invented route; desktop/tablet/mobile match; no 390
overflow; shell/drawer unchanged; skip link valid; visible focus + 44px targets;
SCSS-only/tokens; no prohibited styling; no API/client/storage/cookie; component and
route/status coverage ×2; browser review complete; gateway 404 + recovery; 0
hydration errors; build/boundary pass; figma checker/OpenAPI/client unchanged; secret
scan clean; `pnpm quality` passes; Commit A implementation-only; Commit B
evidence-only; report cites exact Commit A; two commits; tree clean; not pushed; E01
not started.

## M. Scope confirmation

No `apps/admin/**`, `apps/api/**`, `apps/worker/**`, `infrastructure/**`,
`packages/**`, database schema/migrations, Figma files, or Figma registry/approval
status changed. No Homepage/business capability, no new API endpoint, no dependency
change. Only the Storefront not-found route/feature, its SCSS wiring, a minimal shell
export, and tests.

## N. Evidence closure

- **APP1-S01A = COMPLETE — PRODUCT_OWNER_ACCEPTED**; **APP1-S01B = APP1-S01 =
  DELIVERED_FOR_PRODUCT_OWNER_REVIEW.**
- **APP1-E01 = BLOCKED_BY_APP1_S01_PRODUCT_OWNER_REVIEW.** **APP1-X01 = NOT_STARTED.**
- Two commits (A implementation `f45821b`, B evidence); clean tree; **not pushed**.
