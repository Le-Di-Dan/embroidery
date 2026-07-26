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

`APP_01` write target: page **`371:3`** in `FIG-FILE-PRODUCT` (APP1 design packages).
`APP_02` write target: page **`419:3`** in `FIG-FILE-PRODUCT` (APP2 design packages).

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

### 4.2 APP1-D02 — Storefront shell & not-found (NEW, this checkpoint)

Section **`405:2224`** — [APP1-D02 · Storefront Shell & Not-found](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-2224), page **APP_01**. Standalone, implementation-ready shared shell + `/404` not-found, extracted from the approved Homepage (`183:7`/`189:266`/`191:412`) and composed from the approved DS Header/Footer/MobileMenu/Button (§6). The Product Owner reviewed this package in Figma and **PASSED** it for implementation; all seven rows are `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP1-D02-STOREFRONT-001` (`approvals/APP1-D02-STOREFRONT-DESIGN-APPROVAL.md`), recorded by `APP1-S01A`. This package **supersedes the shell-reference role** of the DRAFT Homepage rows below (which remain valid Homepage references).

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT | Storefront | / | Storefront Shell | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 405:2225 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-2225) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |
| FIG-STOREFRONT-SHELL-TABLET-DEFAULT | Storefront | / | Storefront Shell | Default | Tablet 1024 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 405:3733 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-3733) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |
| FIG-STOREFRONT-SHELL-MOBILE-DEFAULT | Storefront | / | Storefront Shell | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 405:3786 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-3786) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |
| FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN | Storefront | / | Storefront Shell | Navigation Open | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 410:2311 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=410-2311) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |
| FIG-STOREFRONT-NOTFOUND | Storefront | /404 | Not-found Boundary | Default | Desktop 1440 | boundary | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 411:2337 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=411-2337) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |
| FIG-STOREFRONT-NOTFOUND-MOBILE | Storefront | /404 | Not-found Boundary | Default | Mobile 390 | boundary | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 411:3851 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=411-3851) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |
| FIG-STOREFRONT-SHELL-NOTES | Storefront | APP1-D02 | Shell Implementation & A11y Notes | Annotation | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 412:2396 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=412-2396) | APP1-D02 | — | FIG-APPROVAL-APP1-D02-STOREFRONT-001 | 2026-07-25 |

**Superseded Homepage shell-reference rows** — the assembled hi-fi Homepage screens remain in Figma as Homepage design references; their prior double-duty as the S01 *shell* reference is superseded by the standalone D02 package above. Do not implement these as the shell.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-STOREFRONT-SHELL-DESKTOP | Storefront | / | Public Shell (Homepage) | Default | Desktop 1440 | high-fidelity | SUPERSEDED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 183:7 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=183-7) | APP1-S01 | → FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT | Homepage reference; shell role moved to standalone D02 frame | 2026-07-25 |
| FIG-STOREFRONT-SHELL-TABLET | Storefront | / | Public Shell (Homepage) | Default | Tablet 1024 | high-fidelity | SUPERSEDED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 189:266 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=189-266) | APP1-S01 | → FIG-STOREFRONT-SHELL-TABLET-DEFAULT | Homepage reference; shell role moved to standalone D02 frame | 2026-07-25 |
| FIG-STOREFRONT-SHELL-MOBILE | Storefront | / | Public Shell (Homepage) | Default | Mobile 390 | high-fidelity | SUPERSEDED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 191:412 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=191-412) | APP1-S01 | → FIG-STOREFRONT-SHELL-MOBILE-DEFAULT | Homepage reference; shell role moved to standalone D02 frame | 2026-07-25 |

### 4.3 APP2-D01 — Assets & Catalog Publication (NEW + SUPPLEMENT, this checkpoint)

Section **`423:3`** — [APP2-D01 · Assets & Catalog Publication](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=423-3), page **APP_02** (`419:3`). Admin asset intake / product draft / catalog / publication are `NEW`; Storefront product list and detail are `SUPPLEMENT` over the existing Storefront visual language. The Storefront frames are **clones of the approved APP1-D02 shells** (`405:2225` / `405:3733` / `405:3786`) — the approved APP1 frames themselves are unmodified, and **no APP1 row is superseded by this package**. All rows are `REVIEW_REQUIRED` pending Product Owner design approval; none may be implemented yet.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-ADMIN-ASSETS-DESKTOP-DEFAULT | Admin | Asset library | Asset Library | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 426:13 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=426-13) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-ASSETS-DESKTOP-EMPTY | Admin | Asset library | Asset Library | Empty | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 429:6 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=429-6) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-ASSETS-DESKTOP-UPLOADING | Admin | Asset library | Asset Library | Uploading | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 429:89 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=429-89) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-ASSETS-DESKTOP-PROCESSING | Admin | Asset library | Asset Library | Processing | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 430:12 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=430-12) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-ASSETS-DESKTOP-REJECTED | Admin | Asset library | Asset Library | Rejected | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 430:98 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=430-98) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-ASSETS-MOBILE-DEFAULT | Admin | Asset library | Asset Library | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 432:18 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=432-18) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-ASSETS-MOBILE-UPLOAD | Admin | Asset library | Asset Library | Upload | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 433:19 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=433-19) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT | Admin | Product draft | Product Draft | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 434:20 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=434-20) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION | Admin | Product draft | Product Draft | Validation Error | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 436:37 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=436-37) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING | Admin | Product draft | Product Draft | Saving | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 436:140 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=436-140) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT | Admin | Product draft | Product Draft | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 438:90 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=438-90) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP | Admin | Product draft | Media Select Dialog | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 437:73 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=437-73) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-CATALOG-DESKTOP-DEFAULT | Admin | Product catalog | Product Catalog | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 439:100 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=439-100) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-CATALOG-DESKTOP-EMPTY | Admin | Product catalog | Product Catalog | Empty | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 440:102 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=440-102) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-CATALOG-MOBILE-DEFAULT | Admin | Product catalog | Product Catalog | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 440:191 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=440-191) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-DESKTOP-READY | Admin | Product publication | Publication | Ready | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 441:106 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=441-106) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-DESKTOP-BLOCKED | Admin | Product publication | Publication | Blocked | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 442:110 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=442-110) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-DESKTOP-CONFIRM-UNPUBLISH | Admin | Product publication | Publication | Confirm Unpublish | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 442:205 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=442-205) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-MOBILE | Admin | Product publication | Publication | Ready | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 443:121 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=443-121) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-LIST-DESKTOP | Storefront | Public product list | Product List | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 444:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=444-204) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-LIST-TABLET | Storefront | Public product list | Product List | Default | Tablet 1024 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 445:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=445-204) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-LIST-MOBILE | Storefront | Public product list | Product List | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 445:210 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=445-210) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-LIST-EMPTY | Storefront | Public product list | Product List | Empty | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 446:223 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=446-223) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-DETAIL-DESKTOP | Storefront | Public product detail | Product Detail | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 447:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=447-204) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-DETAIL-TABLET | Storefront | Public product detail | Product Detail | Default | Tablet 1024 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 448:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=448-204) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-DETAIL-MOBILE | Storefront | Public product detail | Product Detail | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 448:210 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=448-210) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-DETAIL-MEDIA-STATE | Storefront | Public product detail | Product Detail | Media Fallback | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 449:357 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=449-357) | APP2-D01 | — | — | 2026-07-26 |
| FIG-APP2-ASSET-CATALOG-NOTES | Shared | APP2-D01 | Assets & Catalog Notes / Handoff | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 450:404 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=450-404) | APP2-D01 | — | — | 2026-07-26 |
| FIG-APP2-REUSE-MAP | Shared | APP2-D01 | Reuse & Supersession Map | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 451:404 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=451-404) | APP2-D01 | — | — | 2026-07-26 |

**Open product parameters affecting these frames** — deliberately *not* invented by this
package: maximum image bytes, original-file retention, non-image source inclusion, and
uploaded-SVG handling. The frames therefore show **supported formats only (PNG/JPEG/WebP)
and no numeric size limit**. Additionally the public product **URL pattern**
(`/san-pham/<slug>` as drawn) is a **proposal only** — the repository locks the API path
(`/api/public/products/{slug}`) but no page route; Product Owner confirmation is required
before `APP2-S02` implements it.

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

### 6.1b APP2 design-system supplements (product file, not the DS library)

`FIG-FILE-DS` is **read-only** for this project, so a genuinely missing DS primitive is
supplemented inside `FIG-FILE-PRODUCT` and flagged for DS adoption rather than written
into the library. One supplement was activated by `APP2-D01` (`GAP-D01`); it is
`REVIEW_REQUIRED` and is **not** an adopted DS library component.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-DS-INPUT-APP2 | DS Supplement | Forms | Input (Default/Focus/Filled/Error/Disabled) | Catalog | All | component-set | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 424:35 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=424-35) | APP2-D01 | — | — | 2026-07-26 |

Bound to approved DS tokens only (`background/{surface,secondary}`, `text/{primary,secondary,tertiary}`,
`border/{primary,secondary}`, `action/primary`, `status/error`, `radius/md`; text styles
`Body/S`, `Body/M`, `Caption`). Label→field and field→help/error relationships are
expressed structurally by named layers (`Label`, `Field`, `Value`, `Help text` /
`Error message`) for the frontend to wire as `<label for>` / `aria-describedby`.

**Not adopted from the DS by APP2** (audited, semantically wrong for asset status):
`Chip` (`f9aab114…`), `StudioWorkCard` (`1b85776d…`), `EditorialMediaBlock` (`c3bbf6ec…`).
Asset/product status badges are local compositions; a semantic status-badge component is
recorded as a future DS gap candidate, **not** activated here.

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
| FIG-DS-INPUT | DS | Forms | Input / TextField / Password component | Missing | — | component | MISSING | — | — |  | — | APP1-D01 | — | GAP-D01 — still absent from the DS library (re-confirmed via search_design_system 2026-07-26). APP2-D01 supplements it in the product file as FIG-DS-INPUT-APP2 (§6.1b); the library gap itself remains open until DS owners adopt it | 2026-07-26 |
| FIG-DS-SCRIM-TOKEN | DS | Tokens | Scrim / dark-surface semantic token | Missing | — | variable | MISSING | — | — |  | — | APP1-D01 | — | GAP-D02 — still no dark/scrim semantic token (re-confirmed 2026-07-26); APP2 dialogs reuse the APP1-D02 local composition ink/900 @45% | 2026-07-26 |

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

- **Audit date:** 2026-07-25 (APP1-D01; supplemented at APP1-D02), re-audited
  **2026-07-26** (APP2-D01). **Auditor tooling:** Figma MCP plugin API.
- **Files enumerated:** 2/2 — `FIG-FILE-PRODUCT` (**5 pages**) + `FIG-FILE-DS` (19 pages).
- **Product pages:** Information Architecture (`0:1`), APP_01 (`371:3` — Admin
  APP1-D01 section `375:11` + Storefront APP1-D02 section `405:2224`), **APP_02
  (`419:3` — APP2-D01 section `423:3`)**, Wireframe (`17:55`, WF01–WF09), User
  Interface (`166:1457`, UI01–UI05).
- **DS catalog:** 4 variable collections (Primitives 16 / Color 19 / Spacing 10 /
  Radius 5), 11 text styles, 2 effect styles, component sets across 8 HF01 pages.
- **Registry coverage:** 16 APP1-D01 rows (12 `APPROVED_FOR_IMPLEMENTATION` +
  3 annotation `REVIEW_REQUIRED`), 7 APP1-D02 Storefront shell/not-found rows (all
  `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP1-D02-STOREFRONT-001`),
  **29 APP2-D01 rows (all `REVIEW_REQUIRED`)**, **1 APP2 DS-supplement row
  (`REVIEW_REQUIRED`)**, 3 Homepage shell-reference rows (`SUPERSEDED` → APP1-D02),
  4 IA/flow rows (`REFERENCE_ONLY`), 7 DS catalog rows (`APPROVED`), 2
  `MISSING`/gap rows. **Total 69 registry IDs.**
- **Gaps:** GAP-D01 (no DS Input — supplemented for APP2 as `FIG-DS-INPUT-APP2`, DS
  library gap still open), GAP-D02 (no scrim token — still local `ink/900 @45%`).
  The former `FIG-STOREFRONT-NOTFOUND` gap is closed by APP1-D02 (now
  `APPROVED_FOR_IMPLEMENTATION`, §4.2). APP2-D01 supersedes **no** APP1 row.
- **Consistency gate:** `pnpm check:figma-design-index` — see
  `tools/check-figma-design-index.mjs`.
