# APP1-D02 — Storefront Shell & Not-found Design Supplement — Completion Report

**Checkpoint:** `APP1-D02` — complete the Storefront shell and not-found design coverage
**Classification:** `SUPPLEMENT` · **Status:** `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`
**Date:** 2026-07-25 · **Design Commit A:** `eb57ad2548d120819e11b81970f7f3c412d48121`

---

## A. Preflight and accepted A02 baseline

- Branch `production`; preflight HEAD `9310940` (APP1-A02 Commit B); working tree clean.
- Accepted baseline recorded from this prompt: **`APP1-A02 LIVE TEST = PASSED` →
  `APP1-A02 = COMPLETE — PRODUCT_OWNER_ACCEPTED`.**
- Exact accepted-chain hashes (read from Git):
  - APP1-A01: A `27e57e3`, B `930d0cd`; A01-C1: C `9aabbf0`, D `2145137`;
    A01-C2: E `32a7854`, F `9f01083`.
  - APP1-A02: A `67fd9f6` (`feat(admin): implement authenticated application shell`),
    B `9310940` (`docs(app1): record APP1-A02 completion evidence`).
  - A02 report present: `docs/implementation/reports/APP1-A02-COMPLETION-REPORT.md`.
- `D02_PREFLIGHT = PASS`: `pnpm quality` (exit 0), `pnpm check:figma-design-index`,
  `node --test tools/check-figma-design-index.test.mjs` (19/19), `pnpm check:styles`,
  `pnpm check:e2e`, `git diff --check` all clean.

## B. Design audit and SUPPLEMENT classification

- Figma write access established via OAuth (`whoami`: Full seat, Pro plan). Product
  file `BQwqV8GdfUIELvsQDB1UQE` reachable; 4 pages confirmed against registry §10.
- Classified `SUPPLEMENT`: the Storefront visual language and Homepage hi-fi already
  exist; only an independently reviewable shared-shell package and the not-found
  boundary were missing. No Storefront brand/Homepage redesign performed.

## C. Existing Homepage-shell extraction

Audited approved Homepage references and DS components (screenshots reviewed):

| Node | Frame | Header | Footer |
|---|---|---|---|
| 183:7 | Homepage Desktop 1440×5416 | Header `Layout=Full` (72h) | DS Footer (327h) |
| 189:266 | Homepage Tablet 1024×5148 | Header `Layout=Compact` (72h) | DS Footer (327h) |
| 191:412 | Homepage Mobile 390×6136 | Header `Layout=Compact` (72h) | local Mobile Footer (192:530) |

Shell-extraction decisions (preserve accepted language; no one-off Homepage values
promoted to global rules): **Full header ≥1024, Compact header <1024** (mirrors the
approved Homepage tablet), DS Footer on desktop/tablet, compact **Mobile Footer** on
mobile, DS `MobileMenu` for the mobile navigation-open drawer.

## D. Created Figma package

Page **APP_01** (`371:3`), section **`APP1-D02 · Storefront Shell & Not-found`**
(`405:2224`, 3860×2760). All frames `REVIEW_REQUIRED`, composed from approved DS
remote instances; neutral `<main>` content slot (not Homepage content).

| Registry ID | Node | Dimensions | Contents |
|---|---|---|---|
| FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT | 405:2225 | 1440×1059 | Header Full · content slot · DS Footer |
| FIG-STOREFRONT-SHELL-TABLET-DEFAULT | 405:3733 | 1024×1039 | Header Compact · content slot · DS Footer |
| FIG-STOREFRONT-SHELL-MOBILE-DEFAULT | 405:3786 | 390×958 | Header Compact · content slot · Mobile Footer |
| FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN | 410:2311 | 390×844 | DS MobileMenu panel · scrim backdrop |
| FIG-STOREFRONT-SHELL-NOTES | 412:2396 | 1160×1170 | Ownership / responsive / interaction / a11y notes |

> **Location note:** the section was authored on the User Interface page, then
> **moved** (not redrawn) to page APP_01 at the Product Owner's request. Node IDs are
> stable across the page move; the registry Page column reflects `APP_01`.

## E. Storefront not-found coverage

| Registry ID | Node | Dimensions | Contents |
|---|---|---|---|
| FIG-STOREFRONT-NOTFOUND | 411:2337 | 1440×959 | Shell · 404 · "Không tìm thấy trang" · safe copy · primary "Về trang chủ" + secondary "Khám phá tác phẩm" |
| FIG-STOREFRONT-NOTFOUND-MOBILE | 411:3851 | 390×918 | Compact shell · stacked full-width recovery actions · Mobile Footer |

No technical error details; copy is safe Vietnamese. **Tablet /404** is documented as
an interpolation between desktop and mobile (Header Compact, desktop type scale,
horizontal actions in a centered ~560 container) — the smaller complete solution, no
dedicated frame (recorded in the annotations frame and §L).

## F. Responsive / interactions / accessibility

Captured in `FIG-STOREFRONT-SHELL-NOTES` (412:2396) and summarized:

- **Responsive:** Desktop ≥1024 Header Full (inline nav + search + CTA), container
  max-width ~1200, padding 24, 3-column footer; Tablet 768–1024 Header Compact + DS
  Footer; Mobile <768 Header Compact + compact Mobile Footer, padding 16–24, wrapping
  Vietnamese, no horizontal overflow. Breakpoint intent mirrors the approved Homepage;
  no global breakpoint token introduced (local, consistent with Admin FU-A16).
- **Interactions:** hamburger with `aria-expanded`/`aria-controls`; full-screen
  MobileMenu; close via ×, Escape, backdrop; scrim `ink/900 @45%` local composition
  (GAP-D02); focus enter → trap → return to trigger; body scroll lock; listener cleanup.
- **Accessibility:** `<header>/<nav>/<main id=main-content>/<footer>` landmarks; single
  page `<h1>` owned by page content (not-found owns its `<h1>`); skip-link to
  `#main-content`; icon-button accessible names; touch targets ≥44px; recovery focus
  order heading → primary → secondary; reduced-motion honored. **Full WCAG conformance
  is not claimed** — contrast to be verified during S01.

## G. Design-system reuse and gaps

- **Remote instances actually used** (FIG-FILE-DS): Header Full (`3014ae96…`) + Compact
  (`fc1272c6…`), Footer (`f38e2450…`), MobileMenu (`5d824103…`), Button Primary
  (`23e53f1d…`) + Secondary (`834213e1…`).
- **Local product compositions** (not remote instances): content-slot placeholder,
  scrim rectangle (GAP-D02), mobile-footer clone mirroring approved Mobile Footer
  (192:530).
- **Catalog references** (not instantiated): NavLink (40:14), SearchBar (40:16) —
  embedded inside Header/MobileMenu.
- **Gaps:** GAP-D01 (no DS Input — not required for the shell), GAP-D02 (no DS scrim
  token — local `ink/900 @45%`). No new global Input or scrim token introduced.

## H. Registry and supersession updates

`docs/design/FIGMA_DESIGN_INDEX.md`:

- §4.2 rewritten: 6 new `REVIEW_REQUIRED` shell/not-found rows + `FIG-STOREFRONT-SHELL-
  NOTES`; `FIG-STOREFRONT-NOTFOUND` moved out of §7 (MISSING → REVIEW_REQUIRED, node
  411:2337).
- Three prior Homepage shell rows → `SUPERSEDED` with explicit `Supersedes/By`
  pointers to the standalone D02 rows; Homepage frames preserved as references
  (history not deleted).
- §10 coverage summary updated (39 registry IDs). Admin (APP1-D01) approved rows
  unchanged. Every non-missing row carries file key, page, node, and exact deep link;
  no `t=` tracker, no secret, no personal email.

## I. APP1-S01 implementation handoff

Phase plan `docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md` §7: the S01
REUSE note is replaced by the D02 SUPPLEMENT handoff — exact shell/not-found registry
IDs and nodes, desktop/tablet/mobile states, mobile drawer behavior, header/footer
ownership, `<main>` page-content slot, `/404` recovery, SCSS/token + accessibility
expectations, and browser verification. **S01 scope:** shared shell + responsive
navigation + not-found boundary only — never Homepage or business capabilities. S01
stays blocked pending Product Owner promotion of the REVIEW_REQUIRED rows.

## J. Commit A evidence

- **Commit A `eb57ad2548d120819e11b81970f7f3c412d48121`** —
  `design(app1): complete Storefront shell coverage`.
- Files (2): `docs/design/FIGMA_DESIGN_INDEX.md`,
  `docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md`. No completion report,
  no source/schema/infra/dependency/generated-client change.

## K. Validation matrix

| Gate | Result |
|---|---|
| `pnpm check:figma-design-index` | PASS (39 registry IDs, 39 rows, 6 tables) |
| `node --test tools/check-figma-design-index.test.mjs` | PASS (19/19) |
| `pnpm check:styles` | PASS |
| `pnpm check:e2e` | PASS |
| `node tools/check-file-size.mjs` | PASS (no new violation) |
| `git diff --check` | clean |
| `pnpm quality` | PASS (exit 0) |
| Final nodes re-read | all 7 frames + section resolve; children inside section bounds |
| Screenshots reviewed | desktop/tablet/mobile shell, nav-open, desktop/mobile not-found, annotations, full section |

## L. Deviations / follow-ups

- **Tablet /404** delivered as interpolation annotation, not a dedicated frame
  (smaller complete solution, §5.7).
- **Page location** changed post-authoring: section moved from User Interface to
  APP_01 at PO request (move only; no redraw). Storefront designs now co-locate with
  Admin on APP_01.
- Figma MCP required interactive OAuth once (attempt 1 succeeded); no fabricated nodes.

## M. Acceptance matrix

All 30 acceptance criteria met: A02 chain verified + PO acceptance recorded; SUPPLEMENT
classification; Homepage nodes audited; shared shell extracted without redesign;
desktop/tablet/mobile shells + mobile nav-open + desktop/mobile not-found created;
tablet not-found documented; nodes re-read + screenshots reviewed; no scratch frames;
ownership/responsive/a11y annotations complete; DS reuse accurate; no invented
routes/features; Homepage rows superseded accurately; `FIG-STOREFRONT-NOTFOUND` no
longer MISSING; stable IDs + full links; D02 rows `REVIEW_REQUIRED`; no Storefront row
approved; Admin rows unchanged; checker/tests pass; S01 handoff exact; no
frontend/backend/schema/infra/dependency change; `pnpm quality` passes; Commit A
design/registry-only; report ≤260 lines cites exact Commit A.

## N. Scope confirmation

No `apps/**`, `packages/**`, database, infrastructure, OpenAPI, generated client, or
dependency changes. No Admin Figma node modified. Only Figma product-file mutations
(new D02 section) + two design/docs files.

## O. Evidence closure

- **APP1-A02 = COMPLETE — PRODUCT_OWNER_ACCEPTED.**
- **APP1-D02 = DELIVERED_FOR_PRODUCT_OWNER_REVIEW.**
- **APP1-S01 = BLOCKED_BY_PRODUCT_OWNER_APP1_D02_REVIEW.**
- **APP1-E01 = BLOCKED.** **APP1-X01 = NOT_STARTED.**
- Two commits (A design/registry, B evidence); clean tree; **not pushed**.
