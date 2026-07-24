# APP1-D01 — Completion Report

**Checkpoint:** APP1-D01 — Staff access and application-shell design package
**Verdict:** `DELIVERED_FOR_HUMAN_REVIEW` (design package + canonical registry + governance + static gate)
**Date:** 2026-07-25

## A. Preflight and DEC-AUTH revalidation

- **Branch:** `production`. **Initial HEAD:** `061c00c` (before Commit A). Working tree clean at start.
- **APP1-DEC-AUTH evidence chain (verified from Git):** Commit A `741dadd` (`docs(app1): select staff authentication architecture`), Commit B `061c00c` (`docs(app1): record authentication decision evidence`); report `reports/APP1-DEC-AUTH-COMPLETION-REPORT.md` verdict **PASS**. APP0 remains `COMPLETE`; APP1 not started; `APP1-D01` + `APP1-B01` the only `READY` checkpoints; no APP1 app/backend source exists.
- **`DEC_AUTH_REVALIDATION = PASS`:** `pnpm quality` = 0, `pnpm check:openapi` = 0, `pnpm check:api-client` = 0, `pnpm check:e2e` = 0, `node tools/check-file-size.mjs` = 0, `git diff --check` = 0.
- **Figma access proof:** authenticated via the Figma MCP plugin as the **file owner** (handle "Di Đan Lê", Pro seat) — read access to both files, **write** access to the product file (executed `use_figma` writes), page `APP_01` = `371:3` verified (name `APP_01`, empty before this checkpoint). Node IDs and deep links returned by every write.

## B. Full Figma inventory

Both canonical files enumerated in full.

- **`FIG-FILE-PRODUCT`** — `BQwqV8GdfUIELvsQDB1UQE` — https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery — **4 pages:** Information Architecture (`0:1`, IA frame `4:2` + 10 sections), APP_01 (`371:3`, write target), Wireframe (`17:55`, WF01–WF09 boards, 237 components), User Interface (`166:1457`, UI01–UI05 hi-fi **Draft**).
- **`FIG-FILE-DS`** — `hsxSjwkqQKM9vuyRgWSesU` — https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06 — **19 pages** (Cover, audits, 8 HF01 component/pattern pages). **DS catalog:** 4 variable collections (Primitives 16, Color 19 semantic mode Light, Spacing 10, Radius 5), 11 text styles (Inter ramp), 2 effect styles (Elevation/Floating, Elevation/Modal); component sets Button, Header, Chip, NavLink, SearchBar, Footer, MobileMenu, SectionHeader, EditorialMediaBlock, StudioWorkCard, Collection/Journal, MasonryFeed.

## C. Canonical registry and governance

- **Registry:** `docs/design/FIGMA_DESIGN_INDEX.md` — 10 sections (purpose/authority, usage rules, file catalog, screen registry, IA/flow, DS catalog, missing/superseded, update + approval workflows, audit metadata). **Metrics:** 33 registry IDs across 5 node tables — 16 APP1-D01 rows (`REVIEW_REQUIRED`), 3 Storefront reuse (`DRAFT`), 4 IA/wireframe (`REFERENCE_ONLY`), 7 DS catalog (`APPROVED`), 3 `MISSING`.
- **Static gate:** `tools/check-figma-design-index.mjs` (+ `.parse.mjs` parser module, `.test.mjs` — 19 tests), root script `check:figma-design-index`, wired into browser-free `pnpm quality`. No dependency added; no network call.
- **Governance updated:** `CLAUDE.md` (before design / before frontend registry rules), `docs/design/FIGMA_ARCHITECTURE.md` §21 (ownership/statuses/workflow), `07-TESTING-AND-ACCEPTANCE-GATES.md` §6.1 (`FIGMA_INDEX_CONSISTENCY = PASS`), `13-PHASE-SOURCE-MAP.md` (registry-first design classification), `FRONTEND_CONVENTIONS.md` §7 (registry-first resolution), templates (design-package / checkpoint-spec / phase-completion-report), APP1 phase plan §7a (APP1-D01 registry references).

## D. Existing-design audit

- **Storefront REUSE:** the public shell exists only inside **DRAFT** hi-fi Homepage screens (`183:7` desktop, `189:266` tablet, `191:412` mobile) — no standalone approved "Storefront Shell" artifact. The shell primitives (`Header`, `Footer`, `MobileMenu`, `NavLink`, `SearchBar`, `Button`) are approved DS library components. **No shell-level 404/error boundary exists** (`FIG-STOREFRONT-NOTFOUND`, `MISSING`).
- **Approved:** DS foundation/components (evidence: `DESIGN_SYSTEM_FOUNDATION.md` Approved Foundation, `FIGMA_ARCHITECTURE.md` Approved Architecture, WF07/WF08 validation matrices, published-library confirmation).
- **Wireframes** WF01–WF09: `REFERENCE_ONLY` (parallel to DRAFT hi-fi; none `APPROVED_FOR_IMPLEMENTATION`). **No conflicting duplicate canonical entry** for any APP1-D01 composite.

## E. APP1-D01 design delivery

Page `APP_01` (`371:3`), section **`375:11`** — "APP1-D01 · Staff Access & Application Shells". 16 frames, full-screen layouts (not floating cards — corrected after review, see §K).

- **Admin login** (two-column editorial brand panel + form panel): Desktop Default / Submitting / Validation Error (400 + errors[]) / Auth Failed (uniform `STAFF_LOGIN_FAILED`, no enumeration) / Rate Limited (429 + Retry-After); Mobile Default / Error.
- **Admin shell** (app bar + brand + current-staff identity + logout, side nav region with future-features note, content slot empty-state — not a dashboard): Desktop Default / Current-Staff Loading / Session Expired; Mobile Default / Navigation Open (drawer) / Session Expired. Session-expired keeps the shell visible under a light scrim with only a re-login popup.
- **Annotations:** Storefront reuse map, responsive & interaction notes, implementation annotations.

## F. Figma node evidence

| Registry ID | Screen/state | Viewport | Node | Direct URL | Status |
|---|---|---|---|---|---|
| FIG-ADMIN-LOGIN-DESKTOP-DEFAULT | Login / Default | Desktop | 375:12 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=375-12 | REVIEW_REQUIRED |
| FIG-ADMIN-LOGIN-DESKTOP-SUBMITTING | Login / Submitting | Desktop | 382:9 | …?node-id=382-9 | REVIEW_REQUIRED |
| FIG-ADMIN-LOGIN-DESKTOP-VALIDATION | Login / Validation Error | Desktop | 382:34 | …?node-id=382-34 | REVIEW_REQUIRED |
| FIG-ADMIN-LOGIN-DESKTOP-AUTHFAILED | Login / Auth Failed | Desktop | 382:59 | …?node-id=382-59 | REVIEW_REQUIRED |
| FIG-ADMIN-LOGIN-DESKTOP-RATELIMITED | Login / Rate Limited | Desktop | 382:84 | …?node-id=382-84 | REVIEW_REQUIRED |
| FIG-ADMIN-LOGIN-MOBILE-DEFAULT | Login / Default | Mobile | 380:8 | …?node-id=380-8 | REVIEW_REQUIRED |
| FIG-ADMIN-LOGIN-MOBILE-ERROR | Login / Error | Mobile | 383:9 | …?node-id=383-9 | REVIEW_REQUIRED |
| FIG-ADMIN-SHELL-DESKTOP-DEFAULT | Shell / Default | Desktop | 385:10 | …?node-id=385-10 | REVIEW_REQUIRED |
| FIG-ADMIN-SHELL-DESKTOP-LOADING | Shell / Loading | Desktop | 387:11 | …?node-id=387-11 | REVIEW_REQUIRED |
| FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED | Shell / Session Expired | Desktop | 387:40 | …?node-id=387-40 | REVIEW_REQUIRED |
| FIG-ADMIN-SHELL-MOBILE-DEFAULT | Shell / Default | Mobile | 389:14 | …?node-id=389-14 | REVIEW_REQUIRED |
| FIG-ADMIN-SHELL-MOBILE-NAVOPEN | Shell / Navigation Open | Mobile | 390:14 | …?node-id=390-14 | REVIEW_REQUIRED |
| FIG-ADMIN-SHELL-MOBILE-SESSIONEXPIRED | Shell / Session Expired | Mobile | 396:15 | …?node-id=396-15 | REVIEW_REQUIRED |
| FIG-APP1D01-REUSE-MAP | Storefront reuse map | — | 391:15 | …?node-id=391-15 | REVIEW_REQUIRED |
| FIG-APP1D01-RESPONSIVE-NOTES | Responsive & interaction notes | — | 392:15 | …?node-id=392-15 | REVIEW_REQUIRED |
| FIG-APP1D01-IMPL-ANNOTATIONS | Implementation annotations | — | 393:15 | …?node-id=393-15 | REVIEW_REQUIRED |

Full deep links (file key `BQwqV8GdfUIELvsQDB1UQE`) are in `FIGMA_DESIGN_INDEX.md` §4.1.

## G. Design-system evidence

- **Reused as remote instances (no detach):** `Button` (Primary/Disabled/Ghost), `Header`, `Footer`, `MobileMenu`, `NavLink`, `SearchBar`.
- **Imported variables/styles:** semantic colors `background/*`, `text/*`, `border/*`, `action/*`, `status/{error,warning}`; `radius/{md,lg}`; text styles `Heading/M·S`, `Body/L·M·S`, `Caption`; effects `Elevation/{Floating,Modal}`. All colours/typography bound to DS tokens/styles.
- **Local composition (recorded gaps):** `FIG-DS-INPUT` (GAP-D01, no Input component → composed from `background/secondary` + `border/primary` + `radius/md` + `Body/M` + `text/tertiary`, per SearchBar); `FIG-DS-SCRIM-TOKEN` (GAP-D02, no scrim token → overlay uses `ink/900` primitive @45% node-opacity). No DS-file mutation.

## H. Visual, responsive and accessibility review

- **Screenshots reviewed** at each increment: login default, 5-state contact sheet, full-screen split, mobile login, shell desktop, session-expired (desktop+mobile), nav-open drawer, full-section contact sheet. No overlap, no text clipping (mobile popup title set to wrap), no detached/missing fonts (Inter), no unresolved instances, error states visible via icon+text+border (not colour-only).
- **Responsive:** Auto Layout throughout; breakpoints Desktop 1440 / Mobile 390×844 per `FIGMA_ARCHITECTURE.md` §15; login 2-col ≥1024 → stacked <1024; shell sidebar ≥1024 → drawer <1024; content slot FILL; long Vietnamese text wraps.
- **Accessibility (annotated, not a WCAG claim):** persistent labels, focus order, non-colour error state, ≥44px touch targets, aria-live error announcement intent, password-toggle name/state, session-expired focus → modal, reduced-motion loading. **FU-A14** (first interactive-screen a11y verification) routed to `APP1-A01`.

## I. Missing / duplicate / superseded findings

- **MISSING:** `FIG-STOREFRONT-NOTFOUND` (no shell-level 404/error frame), `FIG-DS-INPUT` (GAP-D01), `FIG-DS-SCRIM-TOKEN` (GAP-D02).
- **DRAFT (not implementable):** Storefront shell `183:7 / 189:266 / 191:412`.
- **REFERENCE_ONLY:** IA `4:2`, wireframes WF01/WF02/WF08. No duplicate canonical composite.

## J. Validation matrix

| Command | Result |
|---|---|
| `pnpm check:figma-design-index` | PASS (33 IDs, 33 rows, 5 tables) |
| `node --test tools/check-figma-design-index.test.mjs` | PASS (19/19) |
| `pnpm quality` | PASS (exit 0; includes the new gate; test tier 66/66) |
| `pnpm check:openapi` / `check:api-client` / `check:e2e` | PASS (0) |
| `node tools/check-file-size.mjs` | PASS (0 hard violations) |
| `git diff --check` | clean |

## K. Deviations and follow-ups

- **DEV-1 (human-review correction, applied):** the first login pass rendered only a centred card; reviewer required full-screen layouts. Redesigned login as a two-column editorial layout and rebuilt all states; shell built full-layout from the start.
- **DEV-2 (human-review correction, applied):** session-expired initially used an opaque scrim (near-black). Reviewer required keeping the shell visible with only a popup; scrim reduced to 20% node-opacity (drawer 35%) and a **mobile** session-expired frame added.
- **DEV-3 (tooling split):** `tools/check-figma-design-index.mjs` exceeded the 400-line hard limit after formatting; parsing helpers extracted to `tools/check-figma-design-index.parse.mjs` (split by responsibility, CLAUDE.md §6). Both are part of the Commit A checker scope.
- **DEV-4 (verification limit):** post-commit Figma node re-read (§30.13) was blocked by a transient MCP disconnect; all 16 nodes were verified at creation (screenshots) and enumerated before Commit A, and the registry records exact IDs.
- **Follow-ups:** promote APP1-D01 rows to `APPROVED_FOR_IMPLEMENTATION` at human review; design `FIG-STOREFRONT-NOTFOUND` and promote Storefront shell before `APP1-S01`; consider adding an `Input` component and a scrim token to the DS (GAP-D01/GAP-D02).

## L. Acceptance matrix

- DEC-AUTH chain verified; APP0 `COMPLETE`; APP1 not started — **PASS**.
- Both files accessible, product writable, `371:3` verified, all pages enumerated — **PASS**.
- Screen/state + IA/flow + DS catalog + duplicate/stale/missing audit complete — **PASS**.
- Canonical `FIGMA_DESIGN_INDEX.md` created; stable IDs; exact deep links; status rules locked — **PASS**.
- Governance integrated (CLAUDE.md, Figma architecture, phase-source-map, acceptance gate, frontend conventions, templates, phase plan) — **PASS**.
- Static checker + tests + wired into `pnpm quality`; no dependency — **PASS**.
- Login (default/submitting/validation/generic/rate-limit + mobile) and shell (desktop/mobile) + loading/session-expired/logout/nav states designed; no feature/role UI — **PASS**.
- Storefront reuse map with exact links; missing approval blocks S01 (not hidden) — **PASS**.
- DS components/variables/styles reused; no wireframe-derived palette; accessibility + responsive + visual review recorded — **PASS**.
- Every new frame registered `REVIEW_REQUIRED`; nothing self-approved — **PASS**.

## M. Scope confirmation

No application, API, database schema, generated-client, or OpenAPI source changed. No auth dependency installed. No new npm dependency. Changes are docs + registry + static-tooling only. `apps/**`, `packages/**`, `database/**`, `infrastructure/**`, lockfile, `turbo.json`, OpenAPI artifact, and generated client are untouched.

## N. Evidence closure

- **Commit A:** `ca611a9ff6672091dce9695b065e654d441e489e` — `design(app1): deliver staff access and shell design package` (14 files: registry, checker + parser + tests, `package.json`, CLAUDE.md, Figma architecture, 07/13, frontend conventions, phase plan, 3 templates).
- **Commit B (this evidence):** `docs(app1): record APP1-D01 design evidence`.
- **Pre-Commit-B tree state:** clean except this report and the APP1 status pointers.
- **Push status:** **NOT PUSHED.**
- **Design-delivery status:** `APP1-D01 = DELIVERED_FOR_HUMAN_REVIEW`.
- **Frontend-gate status:** `APP1-A01 = BLOCKED_BY_DESIGN_APPROVAL`, `APP1-A02 = BLOCKED_BY_DESIGN_APPROVAL`, `APP1-S01 = BLOCKED_BY_DESIGN_APPROVAL` (also pending Storefront shell promotion + `FIG-STOREFRONT-NOTFOUND`). `APP1-B01 = READY, NOT STARTED` (independent). New Figma entries remain `REVIEW_REQUIRED` — not approved.
