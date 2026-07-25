# FIGMA_DESIGN_INDEX.md

**Status:** Canonical Figma registry — authoritative
**Owner:** Design governance (created at `APP1-D01`, 2026-07-25)
**Consistency gate:** `pnpm check:figma-design-index` (static, in `pnpm quality`)

---

## 1. Purpose and authority

This file is the **single canonical registry** of every Figma artifact the project
implements against. It is not a one-time audit — it is a living index that every
future **design** and **frontend** checkpoint must read before work and update
within the same checkpoint.

Authority:

- It is the authoritative map from a product/route/state/viewport to the **exact
  Figma node** that a frontend checkpoint may implement, and to that node's
  **approval status**.
- It does **not** override product, business, lifecycle, database, or design-token
  authority (see `../implementation/README.md` §2). Wireframes never override
  approved tokens or product behavior.
- Design tokens/components authority remains the **DS – Core Components (WF06)**
  file (`FIG-FILE-DS`); this index points to it, it does not restate it.

## 2. Mandatory usage rules

**Before any design checkpoint**

1. Read this index; audit existing canonical/missing entries for the surface.
2. Create or modify Figma inside the approved page/section.
3. Update this index in the **same** checkpoint with exact node IDs and deep links.
4. New frames enter as `REVIEW_REQUIRED`; never self-approve.

**Before any frontend UI checkpoint**

1. Read this index; resolve the exact approved screen/state/viewport entry.
2. Open that exact Figma node; read its design-system references.
3. **Block** implementation when the entry is missing, stale, superseded, or not
   `APPROVED_FOR_IMPLEMENTATION`.
4. Record the registry IDs used in the completion report.

**Link rules**

- Every non-`MISSING` row carries a File Key, Page, Node (Figma colon form) and an
  exact node **deep link** (`…?node-id=<hyphen-form>`).
- The URL's file key and node id must match the row's `File Key` and `Node`.
- No temporary `t=` tracker parameter, access token, or personal identity in links.
- `MISSING` rows carry **no** node or link. `SUPERSEDED` rows point to a replacement.

## 3. Canonical file catalog

| Registry ID | File | File Key | Purpose | File URL | Write Authority | Content Class |
|---|---|---|---|---|---|---|
| FIG-FILE-PRODUCT | embroidery | BQwqV8GdfUIELvsQDB1UQE | Product screens, IA, wireframes, and the `APP_01` staff-access designs | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery | Write | Product screens / IA / wireframes |
| FIG-FILE-DS | DS – Core Components (WF06) | hsxSjwkqQKM9vuyRgWSesU | Design system: variable collections, component sets, text/effect styles | https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06 | Read-only (repair only via reported deviation) | Design-system library |

`APP_01` write target: page **`371:3`** in `FIG-FILE-PRODUCT`.

## 4. Screen and state registry

### 4.1 APP1-D01 — Staff access & application shells (NEW, this checkpoint)

Section **`375:11`** — [APP1-D01 · Staff Access & Application Shells](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=375-11). All rows are `REVIEW_REQUIRED` pending human design approval.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-ADMIN-LOGIN-DESKTOP-DEFAULT | Admin | /login | Login | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 375:12 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=375-12) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-LOGIN-DESKTOP-SUBMITTING | Admin | /login | Login | Submitting | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 382:9 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-9) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-LOGIN-DESKTOP-VALIDATION | Admin | /login | Login | Validation Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 382:34 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-34) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-LOGIN-DESKTOP-AUTHFAILED | Admin | /login | Login | Auth Failed | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 382:59 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-59) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-LOGIN-DESKTOP-RATELIMITED | Admin | /login | Login | Rate Limited | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 382:84 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-84) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-LOGIN-MOBILE-DEFAULT | Admin | /login | Login | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 380:8 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=380-8) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-LOGIN-MOBILE-ERROR | Admin | /login | Login | Error | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 383:9 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=383-9) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-SHELL-DESKTOP-DEFAULT | Admin | / | Shell | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 385:10 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=385-10) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-SHELL-DESKTOP-LOADING | Admin | / | Shell | Current-Staff Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 387:11 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=387-11) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED | Admin | / | Shell | Session Expired | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 387:40 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=387-40) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-SHELL-MOBILE-DEFAULT | Admin | / | Shell | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 389:14 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=389-14) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-SHELL-MOBILE-NAVOPEN | Admin | / | Shell | Navigation Open | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 390:14 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=390-14) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-ADMIN-SHELL-MOBILE-SESSIONEXPIRED | Admin | / | Shell | Session Expired | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 396:15 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=396-15) | APP1-D01 | — | FIG-APPROVAL-APP1-D01-ADMIN-001 | 2026-07-25 |
| FIG-APP1D01-REUSE-MAP | Admin | APP1-D01 | Storefront Reuse Map | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 391:15 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=391-15) | APP1-D01 | — | — | 2026-07-25 |
| FIG-APP1D01-RESPONSIVE-NOTES | Admin | APP1-D01 | Responsive & Interaction Notes | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 392:15 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=392-15) | APP1-D01 | — | — | 2026-07-25 |
| FIG-APP1D01-IMPL-ANNOTATIONS | Admin | APP1-D01 | Implementation Annotations | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 393:15 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=393-15) | APP1-D01 | — | — | 2026-07-25 |

### 4.2 Storefront public shell (REUSE target for APP1-S01)

Assembled hi-fi screens are **DRAFT** in Figma (named "Draft"); the shell is
composed from the approved DS Header/Footer/MobileMenu (§6). APP1-S01 is blocked
until these are promoted to `APPROVED_FOR_IMPLEMENTATION` and a shell-level
not-found/error boundary is added (`FIG-STOREFRONT-NOTFOUND`, §7).

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-STOREFRONT-SHELL-DESKTOP | Storefront | / | Public Shell (Homepage) | Default | Desktop 1440 | high-fidelity | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 183:7 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=183-7) | APP1-S01 | — | — | 2026-07-25 |
| FIG-STOREFRONT-SHELL-TABLET | Storefront | / | Public Shell (Homepage) | Default | Tablet 1024 | high-fidelity | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 189:266 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=189-266) | APP1-S01 | — | — | 2026-07-25 |
| FIG-STOREFRONT-SHELL-MOBILE | Storefront | / | Public Shell (Homepage) | Default | Mobile 390 | high-fidelity | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 191:412 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=191-412) | APP1-S01 | — | — | 2026-07-25 |

## 5. IA and user-flow registry

Flow/IA/wireframe nodes are indexed as `REFERENCE_ONLY` — they inform, but do not
authorize, implementation. Wireframes are not token authority.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-IA-SITEMAP | Shared | IA | Information Architecture | Reference | Desktop | ia | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | Information Architecture | 4:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=4-2) | — | — | — | 2026-07-25 |
| FIG-WF-GLOBALNAV | Storefront | / | WF01 Global Layout & Navigation | Reference | Desktop | wireframe | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | Wireframe | 19:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=19-2) | — | — | — | 2026-07-25 |
| FIG-WF-HOMEPAGE | Storefront | / | WF02 Homepage | Reference | Desktop | wireframe | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | Wireframe | 34:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=34-2) | — | — | — | 2026-07-25 |
| FIG-WF-COMPONENTS | DS | Components | WF08 Core Components | Reference | Desktop | wireframe | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | Wireframe | 114:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=114-2) | — | — | — | 2026-07-25 |

## 6. Design-system catalog

Full DS library `FIG-FILE-DS`. Component sets, variable collections and styles are
consumed by APP1-D01 as **remote instances / imported variables & styles** (never
detached). Approval evidence: `DESIGN_SYSTEM_FOUNDATION.md` (Approved Foundation),
`FIGMA_ARCHITECTURE.md` (Approved Architecture), and the WF07/WF08 validation
matrices, plus published-library status confirmed via `search_design_system`.

### 6.1 Component sets (implementation-usable)

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-DS-BUTTON | DS | Actions | Button (Primary/Secondary/Ghost × Default/Hover/Focus/Disabled) | Catalog | All | component-set | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Actions | 39:27 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=39-27) | — | — | Approved Foundation + WF08 validation matrix; published library | 2026-07-25 |
| FIG-DS-HEADER | DS | Navigation | Header (Layout = Full / Compact) | Catalog | All | component-set | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Navigation | 54:27 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=54-27) | — | — | Approved Foundation + WF08 validation matrix; published library | 2026-07-25 |
| FIG-DS-FOOTER | DS | Navigation | Footer | Catalog | All | component | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Navigation | 45:15 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=45-15) | — | — | Approved Foundation + WF08 validation matrix; published library | 2026-07-25 |
| FIG-DS-MOBILEMENU | DS | Navigation | MobileMenu | Catalog | Mobile | component | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Navigation | 53:15 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=53-15) | — | — | Approved Foundation + WF08 validation matrix; published library | 2026-07-25 |
| FIG-DS-NAVLINK | DS | Actions | NavLink (Default / Active) | Catalog | All | component-set | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Actions | 40:14 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=40-14) | — | — | Approved Foundation + WF08 validation matrix; published library | 2026-07-25 |
| FIG-DS-SEARCHBAR | DS | Navigation | SearchBar | Catalog | All | component | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Actions | 40:16 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=40-16) | — | — | Approved Foundation + WF08 validation matrix; published library; login Input pattern source | 2026-07-25 |
| FIG-DS-FOUNDATIONS | DS | Tokens & Styles | Foundations board (Color, Type, Spacing, Radius) | Catalog | All | foundation | APPROVED | hsxSjwkqQKM9vuyRgWSesU | HF01 · Foundations | 37:3 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=37-3) | — | — | Approved Foundation (DESIGN_SYSTEM_FOUNDATION.md §4–7); WF07 token matrix | 2026-07-25 |

### 6.2 Variable collections, styles (panel-level, no canvas node)

Consumed by APP1-D01 via `importVariableByKeyAsync` / `importStyleByKeyAsync`:

- **Primitives** (16): `white`, `sand/50·100·25`, `ink/900`, `gray/400·500`, `stone/200·300`, `rose/500·600·700`, `green/600`, `amber/600`, `red/600`, `blue/600`.
- **Color** (19 semantic, mode Light): `background/{primary,secondary,surface,elevated}`, `text/{primary,secondary,tertiary,inverse}`, `border/{primary,secondary,strong}`, `action/{primary,hover,active,disabled}`, `status/{success,warning,error,info}`.
- **Spacing** (10): `space/4…128`. **Radius** (5): `radius/{xs,sm,md,lg,xl}` = 8/12/16/24/32.
- **Text styles** (11): `Display/{XL,L,M}`, `Heading/{XL,L,M,S}`, `Body/{L,M,S}`, `Caption` — Inter.
- **Effect styles** (2): `Elevation/Floating`, `Elevation/Modal`.

### 6.3 Design-system references used per APP1-D01 screen

- **Login (all states):** DS `Button` (Primary/Disabled), composed **Input** (see gap `FIG-DS-INPUT`) styled from `SearchBar`; text styles `Heading/M·S`, `Body/L·S·M`, `Caption`; colors `background/{primary,secondary,surface}`, `text/{primary,secondary,tertiary,inverse}`, `border/primary`, `action/primary`, `status/{error,warning}`; `radius/{md,lg}`; `Elevation/Floating`.
- **Shell (all states):** DS `Button` (Ghost = logout, Primary = re-login), text/color/radius tokens as above; `Elevation/Modal` on the session-expired popup; overlay scrim uses `ink/900 @45%` (gap `FIG-DS-SCRIM-TOKEN`).
- **Reuse map / notes / annotations:** text + color + radius tokens only.

## 7. Missing / duplicate / superseded registry

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-STOREFRONT-NOTFOUND | Storefront | /404 | Shell-level not-found / error boundary | Missing | — | boundary | MISSING | — | — |  | — | APP1-S01 | — | No shell-level 404/error frame exists in the product file (audit 2026-07-25) | 2026-07-25 |
| FIG-DS-INPUT | DS | Forms | Input / TextField / Password component | Missing | — | component | MISSING | — | — |  | — | APP1-D01 | — | GAP-D01 — absent from DS (search_design_system 2026-07-25); composed from primitives per §6.3 | 2026-07-25 |
| FIG-DS-SCRIM-TOKEN | DS | Tokens | Scrim / dark-surface semantic token | Missing | — | variable | MISSING | — | — |  | — | APP1-D01 | — | GAP-D02 — no dark/scrim semantic token; overlay uses ink/900 @45% | 2026-07-25 |

**Duplicate/stale findings:** UI01–UI05 (`User Interface`) and WF01–WF09 (`Wireframe`)
are parallel hi-fi (DRAFT) and wireframe (REFERENCE_ONLY) renditions of the public
surfaces; no wireframe is `APPROVED_FOR_IMPLEMENTATION`. No conflicting duplicate
canonical entry exists for any APP1-D01 composite key.

## 8. Update workflow

1. Do Figma work in the approved page/section; return every created/mutated node ID.
2. Add/patch one row per canonical state/viewport with the exact node + deep link.
3. Set new rows `REVIEW_REQUIRED`; record DS references (§6.3).
4. Run `pnpm check:figma-design-index` (and the tool tests) until clean.
5. Confirm the owning phase plan references only registry IDs that exist here.

## 9. Approval workflow

- New design lands `REVIEW_REQUIRED`. A human reviewer promotes to
  `APPROVED_FOR_IMPLEMENTATION` (with evidence) in a later evidence update.
- Only `APPROVED_FOR_IMPLEMENTATION` entries may be implemented by a frontend
  checkpoint. `APPROVED` marks a stable reference asset (e.g. DS components).
- Superseded designs move to `SUPERSEDED` with a pointer; obsolete ones to
  `OBSOLETE`. Historical nodes are recorded, never deleted in a design checkpoint.

## 10. Audit metadata and coverage summary

- **Audit date:** 2026-07-25 (APP1-D01). **Auditor tooling:** Figma MCP plugin API.
- **Files enumerated:** 2/2 — `FIG-FILE-PRODUCT` (4 pages) + `FIG-FILE-DS` (19 pages).
- **Product pages:** Information Architecture (`0:1`), APP_01 (`371:3`), Wireframe
  (`17:55`, WF01–WF09), User Interface (`166:1457`, UI01–UI05).
- **DS catalog:** 4 variable collections (Primitives 16 / Color 19 / Spacing 10 /
  Radius 5), 11 text styles, 2 effect styles, component sets across 8 HF01 pages.
- **Registry coverage:** 16 APP1-D01 rows (all `REVIEW_REQUIRED`), 3 Storefront
  reuse rows (`DRAFT`), 4 IA/flow rows (`REFERENCE_ONLY`), 7 DS catalog rows
  (`APPROVED`), 3 `MISSING`/gap rows.
- **Gaps:** GAP-D01 (no Input component), GAP-D02 (no scrim token),
  `FIG-STOREFRONT-NOTFOUND` (no shell-level error boundary).
- **Consistency gate:** `pnpm check:figma-design-index` — see
  `tools/check-figma-design-index.mjs`.
