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
4. New frames enter as `REFERENCE_ONLY`; never self-approve.

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
`APP_03` write target: page **`592:3`** in `FIG-FILE-PRODUCT` (APP3 design packages).
`APP_04` write target: page **`620:3`** in `FIG-FILE-PRODUCT` (APP4 design packages).
`APP_05` write target: page **`641:3`** in `FIG-FILE-PRODUCT` (APP5 design packages).
`APP_06` write target: page **`678:3`** in `FIG-FILE-PRODUCT` (APP6 design packages).
`APP_07` write target: page **`726:3`** in `FIG-FILE-PRODUCT` (APP7 design packages).
`APP_08` write target: page **`766:3`** in `FIG-FILE-PRODUCT` (APP8 design packages).
`APP_09` write target: page **`766:2`** in `FIG-FILE-PRODUCT` (APP9 design packages).
`APP_10` write target: page **`825:3`** in `FIG-FILE-PRODUCT` (APP10 design packages).
`APP_11` write target: page **`853:2`** in `FIG-FILE-PRODUCT` (APP11 design packages).

## 4. Screen and state registry

### 4.1 APP1-D01 — Staff access & application shells (NEW, this checkpoint)

Section **`375:11`** — [APP1-D01 · Staff Access & Application Shells](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=375-11). All rows are `REFERENCE_ONLY` pending human design approval.

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
| FIG-APP1D01-REUSE-MAP | Admin | APP1-D01 | Storefront Reuse Map | Annotation | Desktop | annotation | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 391:15 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=391-15) | APP1-D01 | — | — | 2026-07-25 |
| FIG-APP1D01-RESPONSIVE-NOTES | Admin | APP1-D01 | Responsive & Interaction Notes | Annotation | Desktop | annotation | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | APP_01 | 392:15 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=392-15) | APP1-D01 | — | — | 2026-07-25 |
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

Section **`423:3`** — [APP2-D01 · Assets & Catalog Publication](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=423-3), page **APP_02** (`419:3`).

> **Product Owner ruling (2026-07-26), applied by `APP2-D01-C1`.**
> **Admin = `PRODUCT_OWNER_APPROVED — FROZEN`.** The Admin rows below are approved and
> must not be mutated.
> **Storefront Product List = `REJECTED_BY_PRODUCT_OWNER`.** The four APP2 card-grid
> frames were **deleted from Figma** in `APP2-D01-C1` and their registry rows are
> **removed** — see §4.3.1. `APP2-S01` authority is now **UI02 – Discover Feed** (§4.4).
> **Storefront Product Detail = `NOT_APPROVED — WITHHELD_PENDING_UI03_RECONCILIATION`.**
> Those four frames are untouched but are **not implementation authority** (§4.4).

> **`APP2-D02` reconciliation (2026-07-27) — Admin Assets =
> `PRODUCT_OWNER_APPROVED — FROZEN — D02_RECONCILED`.**
> Until `APP2-D02` the seven Admin Assets rows still read `REVIEW_REQUIRED` with an empty
> evidence cell while the ruling above said they were approved and frozen; the `APP2-A01`
> implementation audit surfaced that divergence. The rows now carry
> `APPROVED_FOR_IMPLEMENTATION` under **`FIG-APPROVAL-APP2-D01-ADMIN-001`**
> ([`approvals/APP2-D01-ADMIN-ASSETS-DESIGN-APPROVAL.md`](./approvals/APP2-D01-ADMIN-ASSETS-DESIGN-APPROVAL.md)).
> The same checkpoint closed the two gaps that blocked `APP2-A01` — cursor continuation
> (`Tải thêm tài sản`, never infinite scroll, never silent truncation, no total-count copy)
> and server-backed identity (media-format label + `{size} · {createdAt}`; the original
> filename stays transient local upload state and no backend field is added) — as in-place
> amendments to the same approved nodes, plus one new annotation node
> `FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY` (`484:272`). §6.2 of the APP2 phase plan carried
> a stale `BLOCKED_BY_APP2_D01_PRODUCT_OWNER_APPROVAL` gate line; it is superseded there.
> The Admin Product Draft / Catalog / Publication rows keep the ruling's `FROZEN` status
> but stay `REVIEW_REQUIRED` here — `APP2-D02` reconciled Assets only, and A02–A04 must
> record their own approval evidence before implementing.

> **`APP2-D03` reconciliation (2026-07-31) — Admin Product List =
> `PRODUCT_OWNER_APPROVED — D03_RECONCILED`.**
> `APP2-A02` blocked as `BLOCKED_BY_CATALOG_LIST_DESIGN_CONTRADICTION`: the canonical A02
> scope locks **filters** and pagination, but the three frozen Catalog nodes contained no
> filter control, and their row actions (`Chỉnh sửa`, `Xuất bản`, `Gỡ xuất bản`) plus the
> `Tạo sản phẩm` CTA belong to `APP2-A03`/`APP2-A04`, whose routes do not exist yet.
> `APP2-D03` reconciles the three nodes in place: it **adds** the `Trạng thái` and
> `Danh mục` filters (desktop side-by-side, mobile stacked full-width) and the
> `Tải thêm sản phẩm` continuation control reusing the `APP2-D02` cursor pattern, and
> **removes** every create/edit/publication control so A02 ships a truthful read-only list.
> `APP2-A03` restores create/edit and `APP2-A04` adds publish/unpublish as supplements that
> never redefine the base layout. **Price and search are excluded from A02** — no price
> column is added, and no search control exists. The three rows are now
> `APPROVED_FOR_IMPLEMENTATION` under **`FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`**
> ([`approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md`](./approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md)),
> and one annotation node was added (`498:272`). **The Product Draft and Publication rows
> are deliberately not promoted** — `APP2-A03` and `APP2-A04` must still record their own
> approval evidence. This checkpoint also corrects the **A02/A03 label inversion**: the
> handoff annotation `450:404` previously read A02 → Product Draft and A03 → Catalog, which
> contradicted the canonical checkpoint map (§6.1 of the APP2 phase plan). Canonical
> ownership is **A02 = Admin Product List (Catalog nodes)**, **A03 = Admin Product
> Form/Detail (Product Draft nodes)**, **A04 = Publication Interaction**.

> **`APP2-A03-G01` — Product Form reconciled to the delivered B02 contract (2026-07-31).**
> The mandatory `APP2-A03` pre-code audit proved the five Product Draft nodes could not be
> implemented truthfully: all five were a single **`Sản phẩm mới`** create screen with one
> atomic `Lưu bản nháp`, yet `adminProduct_create` is `.strict()` and accepts only
> `categorySlug`, `name` and `description` — so the screen's media selection required a
> second PATCH, and `Phiên bản & SKU` had **no field in any B02 operation**. There was also
> **no edit/detail design at all**, leaving `adminProduct_detail`, `adminProduct_update`
> and `basePriceAmount` without an approved surface. `APP2-A03-G01` reconciles the five
> existing nodes in place into an explicit **two-mode capability**: a minimal create
> (`/products/new`, three POST fields, `Tạo bản nháp`, redirect to detail) and an
> edit/detail screen (`/products/{productId}`, `Lưu thay đổi`, adding `Giá cơ bản` and
> read-only slug/status, keeping ordered media). Variants/SKU and the publication-readiness
> rail are removed; media identity switches from fabricated filenames to the B01/D02 server
> identity; keyboard media ordering replaces drag-only. The five rows are now
> `APPROVED_FOR_IMPLEMENTATION` under **`FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`**
> ([`approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md`](./approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md)),
> and one annotation node was added (`521:284`). **No `APP2-D04` exists or may be created**,
> and the Publication and Storefront rows are deliberately not promoted.

Admin asset intake / product draft / catalog / publication are `NEW`. The remaining
Storefront Product Detail frames are clones of the approved APP1-D02 shells
(`405:2225` / `405:3733` / `405:3786`) — the approved APP1 frames themselves are
unmodified, and **no APP1 row is superseded by this package**. No Storefront row here is
implementable.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-ADMIN-ASSETS-DESKTOP-DEFAULT | Admin | Asset library | Asset Library | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 426:13 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=426-13) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-DESKTOP-EMPTY | Admin | Asset library | Asset Library | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 429:6 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=429-6) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-DESKTOP-UPLOADING | Admin | Asset library | Asset Library | Uploading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 429:89 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=429-89) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-DESKTOP-PROCESSING | Admin | Asset library | Asset Library | Processing | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 430:12 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=430-12) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-DESKTOP-REJECTED | Admin | Asset library | Asset Library | Rejected | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 430:98 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=430-98) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-MOBILE-DEFAULT | Admin | Asset library | Asset Library | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 432:18 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=432-18) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-MOBILE-UPLOAD | Admin | Asset library | Asset Library | Upload | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 433:19 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=433-19) | APP2-D01 | — | FIG-APPROVAL-APP2-D01-ADMIN-001 | 2026-07-27 |
| FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY | Admin | Asset library | Asset Library Continuation & Identity | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 484:272 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=484-272) | APP2-D02 | — | — | 2026-07-27 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT | Admin | Product form | Product Form | Edit/Detail — Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 434:20 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=434-20) | APP2-D01 | Reconciled by APP2-A03-G01 | FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001 | 2026-07-31 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION | Admin | Product form | Product Form | Edit/Detail — Validation Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 436:37 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=436-37) | APP2-D01 | Reconciled by APP2-A03-G01 | FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001 | 2026-07-31 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING | Admin | Product form | Product Form | Edit/Detail — Saving | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 436:140 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=436-140) | APP2-D01 | Reconciled by APP2-A03-G01 | FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001 | 2026-07-31 |
| FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT | Admin | Product form | Product Form | Edit/Detail — Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 438:90 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=438-90) | APP2-D01 | Reconciled by APP2-A03-G01 | FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001 | 2026-07-31 |
| FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP | Admin | Product form | Media Select Dialog | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 437:73 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=437-73) | APP2-D01 | Reconciled by APP2-A03-G01 | FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001 | 2026-07-31 |
| FIG-ADMIN-CATALOG-DESKTOP-DEFAULT | Admin | Admin product list | Product List | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 439:100 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=439-100) | APP2-D01 | Reconciled by APP2-D03 | FIG-APPROVAL-APP2-D03-CATALOG-LIST-001 | 2026-07-31 |
| FIG-ADMIN-CATALOG-DESKTOP-EMPTY | Admin | Admin product list | Product List | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 440:102 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=440-102) | APP2-D01 | Reconciled by APP2-D03 | FIG-APPROVAL-APP2-D03-CATALOG-LIST-001 | 2026-07-31 |
| FIG-ADMIN-CATALOG-MOBILE-DEFAULT | Admin | Admin product list | Product List | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 440:191 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=440-191) | APP2-D01 | Reconciled by APP2-D03 | FIG-APPROVAL-APP2-D03-CATALOG-LIST-001 | 2026-07-31 |
| FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF | Admin | Admin product list | Product List Filters, Staged Actions & Handoff | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 498:272 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=498-272) | APP2-D03 | — | — | 2026-07-31 |
| FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF | Admin | Product form | Product Form Create/Edit Contract Handoff | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 521:284 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=521-284) | APP2-A03-G01 | — | — | 2026-07-31 |
| FIG-ADMIN-PUBLICATION-DESKTOP-READY | Admin | Product publication | Publication | Ready | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 441:106 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=441-106) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-DESKTOP-BLOCKED | Admin | Product publication | Publication | Blocked | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 442:110 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=442-110) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-DESKTOP-CONFIRM-UNPUBLISH | Admin | Product publication | Publication | Confirm Unpublish | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 442:205 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=442-205) | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PUBLICATION-MOBILE | Admin | Product publication | Publication | Ready | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 443:121 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=443-121) | APP2-D01 | — | — | 2026-07-26 |
| FIG-STOREFRONT-PRODUCT-DETAIL-DESKTOP | Storefront | Public product detail | Product Detail | Default | Desktop 1440 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 447:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=447-204) | APP2-D01 | — | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** (retired by APP2-S02-G01; authority is §4.5) | 2026-08-02 |
| FIG-STOREFRONT-PRODUCT-DETAIL-TABLET | Storefront | Public product detail | Product Detail | Default | Tablet 1024 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 448:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=448-204) | APP2-D01 | — | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** (retired by APP2-S02-G01; authority is §4.5) | 2026-08-02 |
| FIG-STOREFRONT-PRODUCT-DETAIL-MOBILE | Storefront | Public product detail | Product Detail | Default | Mobile 390 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 448:210 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=448-210) | APP2-D01 | — | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** (retired by APP2-S02-G01; authority is §4.5) | 2026-08-02 |
| FIG-STOREFRONT-PRODUCT-DETAIL-MEDIA-STATE | Storefront | Public product detail | Product Detail | Media Fallback | Desktop 1440 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 449:357 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=449-357) | APP2-D01 | — | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** (retired by APP2-S02-G01; authority is §4.5) | 2026-08-02 |
| FIG-APP2-ASSET-CATALOG-NOTES | Shared | APP2-D01 | Assets & Catalog Notes / Handoff | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 450:404 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=450-404) | APP2-D01 | — | — | 2026-07-26 |
| FIG-APP2-REUSE-MAP | Shared | APP2-D01 | Reuse & Supersession Map | Annotation | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 451:404 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=451-404) | APP2-D01 | — | — | 2026-07-26 |

**Open product parameters affecting these frames** — deliberately *not* invented by this
package: maximum image bytes, original-file retention, non-image source inclusion, and
uploaded-SVG handling. The frames therefore show **supported formats only (PNG/JPEG/WebP)
and no numeric size limit**. Additionally the public product **URL pattern**
(`/san-pham/<slug>` as drawn) is a **proposal only** — the repository locks the API path
(`/api/public/products/{slug}`) but no page route; Product Owner confirmation is required
before `APP2-S02` implements it.

**Route authority is repository/Product Owner authority, never a Figma label
(`APP2-S01-G01`, IMP-D038, 2026-08-02).** The Product Owner has since locked the
Storefront **Discover** route as **`/kham-pha`** (`/` stays Homepage-owned) with category
state `?category=<slug>`; that decision came from the repository governance set and
changed nothing in Figma.

> **Superseded by `APP2-S02-G01` (IMP-D039, 2026-08-02) — Product Detail route resolved.**
> The paragraph above previously closed by recording `/san-pham/<slug>` as a proposal and
> `APP2-S02` as blocked. The Product Owner has since locked the Product Detail route as
> **`/san-pham/[slug]`**, rendered `/san-pham/<server-owned-product-slug>`. The four
> `APP2-D01` Product Detail rows below are **not** promoted by that decision: they are
> retired to `REFERENCE_ONLY` — `HISTORICAL_DRAFT_SOURCE`, and implementation authority
> moves to the reconciled section in §4.5. The route itself still did not come from a
> Figma label; it came from the Product Owner.

### 4.3.1 Removed by APP2-D01-C1 — rejected Storefront Product List (historical record)

`APP2-D01` originally created a **uniform, equal-height ecommerce card grid** for the
Storefront Product List. The Product Owner **rejected that direction**: it conflicts with
the established Pinterest-inspired, image-led masonry discovery language that already
exists in **UI02 – Discover Feed**. The regression was one of *authority*, not execution —
an already-covered capability was redesigned from scratch because its existing registry
title did not literally read "Product List".

`APP2-D01-C1` **deleted the four frames from Figma** and **removed their registry rows**.
They carry no node id and no deep link because the nodes no longer exist; keeping a link
would be a dangling reference to deleted content.

| Removed registry ID | Deleted node | Frame name at deletion | Size | Descendants removed |
|---|---|---|---|---|
| FIG-STOREFRONT-PRODUCT-LIST-DESKTOP | `444:204` | APP2-D01 / Storefront / Product List / Desktop / 1440 | 1440×1505 | 90 |
| FIG-STOREFRONT-PRODUCT-LIST-TABLET | `445:204` | APP2-D01 / Storefront / Product List / Tablet / 1024 | 1024×1507 | 63 |
| FIG-STOREFRONT-PRODUCT-LIST-MOBILE | `445:210` | APP2-D01 / Storefront / Product List / Mobile / 390 | 390×2162 | 50 |
| FIG-STOREFRONT-PRODUCT-LIST-EMPTY | `446:223` | APP2-D01 / Storefront / Product List / Desktop / Empty | 1440×920 | 57 |

Recorded evidence of the rejected pattern (captured before deletion): a single
`WRAP` container named `Product grid (published only)` per frame, holding **uniform
equal-height cards** — desktop 6 × `365×394`, tablet 4 × `414×419`, mobile 4 × `350×371`.

**These four registry IDs are retired.** They must not be re-created, and there is no
active handoff path from `APP2-S01` to them. `APP2-S01` reads UI02 (§4.4).

## 4.4 Capability → design-authority map (APP2 Storefront)

Canonical since `APP2-D01-C1`. This map, not a screen title, decides which Figma nodes a
frontend checkpoint reads.

| Capability | Primary authority | Supporting authority | Reuse policy | Implementation status |
|---|---|---|---|---|
| **APP2-S01** Storefront Product List / Discover | **UI02 – Discover Feed** `208:538` — desktop `208:2002`, tablet `224:871`, mobile `226:1038` | UI01 Homepage `183:7`, `189:266`, `191:412`; APP1-D02 approved shell (§4.2) | `REUSE_AND_SUPPLEMENT_ONLY` | Blocked on backend prerequisites; rejected APP2 card-grid nodes removed (§4.3.1) |
| **APP2-S02** Storefront Product Detail | **APP2-S02-G01 / Reconciled** `529:2224` — desktop `529:2225`, tablet `529:2431`, mobile `529:2575` (§4.5) | UI03 draft `261:1290` as `HISTORICAL_DRAFT_SOURCE`; UI01/UI02 visual language where documented; APP1-D02 approved shell (§4.2) | `REUSE_AND_SUPPLEMENT_ONLY` | `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001` (IMP-D039) |

**Reconciliation history for this row.** Until `APP2-S02-G01` this row read
`SEPARATE_RECONCILIATION_REQUIRED` / `NOT_APPROVED`, with UI03 as primary authority and the
four `APP2-D01` frames `447:204`, `448:204`, `448:210`, `449:357` withheld. Those four are
now `REFERENCE_ONLY` — `HISTORICAL_DRAFT_SOURCE`, and the UI03 draft roots keep their
historical status in §4.5.2. Neither set may be implemented.

### 4.4.1 UI02 authority registry rows

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-UI02-DISCOVER-SECTION | Storefront | Discovery authority (APP2-S01) | UI02 Discover Feed | Section | All | section | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 208:538 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=208-538) | APP2-D01-C1 | — | Visual/structural authority for APP2-S01; content maturity is DRAFT (§4.4.2) | 2026-07-26 |
| FIG-UI02-DISCOVER-DESKTOP | Storefront | Discovery authority (APP2-S01) | UI02 Discover Feed | Default | Desktop 1440 | high-fidelity | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 208:2002 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=208-2002) | APP2-D01-C1 | — | 5-column masonry authority (measured: 5 × 237px columns) | 2026-07-26 |
| FIG-UI02-DISCOVER-TABLET | Storefront | Discovery authority (APP2-S01) | UI02 Discover Feed | Default | Tablet 1024 | high-fidelity | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 224:871 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=224-871) | APP2-D01-C1 | — | 3-column masonry authority (measured: 3 × 293px columns) | 2026-07-26 |
| FIG-UI02-DISCOVER-MOBILE | Storefront | Discovery authority (APP2-S01) | UI02 Discover Feed | Default | Mobile 390 | high-fidelity | DRAFT | BQwqV8GdfUIELvsQDB1UQE | User Interface | 226:1038 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=226-1038) | APP2-D01-C1 | — | 2-column masonry authority (measured: 2 × 163px columns) | 2026-07-26 |

UI02 and UI01 nodes are **read-only** for APP2. `APP2-D01-C1` mutated none of them.

### 4.4.2 Status vocabulary: visual authority vs content maturity

These are **independent** axes. A screen may carry draft copy or placeholder imagery while
its visual architecture, responsive behaviour and interaction direction are the **required**
implementation authority.

| Axis | Meaning | Example |
|---|---|---|
| **Approval status** | Has a human approved this for build? | APP2 Admin = approved; APP2 Product Detail = not approved |
| **Visual authority** | Does this define the look? | UI02 = REQUIRED for APP2-S01 |
| **Structural / interaction authority** | Does this define layout, responsive strategy and behaviour? | UI02 = REQUIRED for APP2-S01 |
| **Content / asset maturity** | Are copy and imagery final? | UI02 = DRAFT (its 59 cards are named `StudioWorkCard · TEMP_ASSET`) |
| **Reuse policy** | What may a checkpoint do with it? | `REUSE_AND_SUPPLEMENT_ONLY` |

> **`DRAFT` never means "ignore this design and create a new screen."** `DRAFT` describes
> content maturity only. Redesigning a capability that an existing draft already covers —
> because its title does not literally match a new checkpoint's vocabulary — is a
> governance failure. That is precisely what `APP2-D01-C1` corrected.

### 4.4.3 Locked visual invariants for APP2-S01

```text
Storefront discovery is image-led and Pinterest-inspired.
Desktop: 5-column masonry direction from UI02.
Tablet:  3-column masonry direction from UI02.
Mobile:  2-column masonry direction from UI02.
Cards:   varying image/card heights; editorial rhythm; artwork dominates;
         minimal catalog chrome.
Accessibility: masonry is visual presentation only; DOM/source reading order
         must remain logical and linear.
```

UI02 additionally governs: discovery-first interaction, chip/filter treatment, loading and
progressive-continuation treatment, empty/error visual language, and reuse of the existing
masonry feed + `StudioWorkCard` patterns.

**Explicitly forbidden for APP2-S01:**

```text
equal-height ecommerce card grid;
3-column uniform retail cards on desktop;
2-column uniform retail cards on tablet;
single-column full-width retail cards on mobile;
generic marketplace/catalog visual treatment;
redesigning an already covered capability merely because its registry title
does not literally contain "Product List";
treating DRAFT content status as absence of visual authority.
```

**Permitted APP2 supplements** (must preserve UI02's architecture, never replace it with a
generic catalog): published-only data, product title and product-detail link, approved
derivative image rules, product-specific empty/loading/media-fallback data, and exclusion
of modules outside APP2 implementation scope.

**Clarification (`APP2-S01-G01`, IMP-D038).** "Product title and product-detail link"
above lists *permissible* supplements — it was never a mandate to fabricate a route. No
Product Detail browser route exists, so `APP2-S01` uses the Product **title** and
**withholds** the detail link: its cards are staged, explicitly non-interactive semantic
articles (no `href`, click handler, button role, pointer cursor or hover affordance). This
is a truthful interim state, not an unmet supplement. `APP2-S02` may convert that card
wrapper into a link once UI03 reconciliation approves a detail route — without changing
the masonry architecture.

## 4.5 APP2-S02-G01 — Storefront Product Detail, reconciled (NEW, this checkpoint)

Section **`529:2224`** — [APP2-S02-G01 / Storefront Product Detail / Reconciled](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=529-2224),
page **User Interface** (`166:1457`), a **sibling** of UI01–UI05 at `x = 26180, y = 0`.

> **What this gate did.** `APP2-S02` was `BLOCKED_BY_UI03_RECONCILIATION`. The UI03 draft is
> a rich studio-work narrative; the delivered `APP2-B04` `publicProductDetail` contract
> returns only `slug`, `name`, `description?`, `category`, `price`, `isDisplayOutOfStock`,
> `media[]` and `seo`. Most of what UI03 drew — year, technique, dimensions, collection,
> three separate story fields, materials, craft taxonomy, a four-step process, related
> works, save/favourite and the commission CTA/sticky bar — **has no field and no operation
> behind it**. This gate reconciles the two by *removing* what the contract cannot feed
> rather than by inventing backend requirements, and locks the route the Product Owner
> supplied. Price and `isDisplayOutOfStock` **are** returned and are still **not displayed**:
> `APP2-S02` is a studio Work Detail, not an ecommerce PDP.

**Route (IMP-D039).** `/san-pham/[slug]`, rendered `/san-pham/<server-owned-product-slug>`.
The slug comes only from `APP2-B04`, is immutable and server-owned; no Product UUID, no
query-mode detail route, no trailing-slash authority. `/product/*`, `/products/*`,
`/catalog/*`, `/tac-pham/*` and `/kham-pha/*` are **rejected** as detail aliases, and
`/kham-pha` remains Discover.

**Contract handoff** is recorded on-canvas at `537:3`, state authority at `537:38`.

### 4.5.1 Reconciled authority registry rows

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-S02-PRODUCT-DETAIL-SECTION | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Section | All | section | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 529:2224 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=529-2224) | APP2-S02-G01 | Reconciles UI03 261:1290 | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-DESKTOP | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 529:2225 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=529-2225) | APP2-S02-G01 | Reconciles UI03 262:1291 | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-TABLET | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Default | Tablet 1024 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 529:2431 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=529-2431) | APP2-S02-G01 | Reconciles UI03 273:1409 | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-MOBILE | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 529:2575 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=529-2575) | APP2-S02-G01 | Reconciles UI03 279:1504 | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-MEDIA-EMPTY | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Media Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 532:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=532-3) | APP2-S02-G01 | — | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-MEDIA-ERROR | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Media Error | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 532:105 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=532-105) | APP2-S02-G01 | — | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-LIGHTBOX-DESKTOP | Storefront | /san-pham/[slug] | Product Detail Lightbox | Open | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 533:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=533-3) | APP2-S02-G01 | — | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-LIGHTBOX-MOBILE | Storefront | /san-pham/[slug] | Product Detail Lightbox | Open | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 533:26 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=533-26) | APP2-S02-G01 | — | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-CONTRACT-HANDOFF | Storefront | /san-pham/[slug] | Product Detail Contract Handoff | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 537:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=537-3) | APP2-S02-G01 | — | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |
| FIG-S02-PRODUCT-DETAIL-STATE-AUTHORITY | Storefront | /san-pham/[slug] | Product Detail State Authority | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | User Interface | 537:38 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=537-38) | APP2-S02-G01 | — | FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 | 2026-08-02 |

### 4.5.2 UI03 draft roots — historical draft source

`HISTORICAL_DRAFT_SOURCE` / `NOT_IMPLEMENTATION_AUTHORITY`. The draft section keeps all
sixteen of its children unmodified — three viewport frames plus boards `00`, `04`–`11`
(hero/gallery `283:1528`, related `290:1533`, loading/empty/error `291:1567`, responsive
`292:1568`, accessibility `292:1582`, DS audit `293:1568`, content/asset audit `294:1568`,
placement audit `294:1588`), each audited live by this gate. They record the original
design intent and the deferred sections; **none of them may be implemented.** They are
recorded here, never deleted (§9).

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-UI03-WORK-DETAIL-SECTION | Storefront | Product Detail draft source | UI03 Studio Work Detail | Section | All | section | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | User Interface | 261:1290 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=261-1290) | APP2-D01 | Reconciled by APP2-S02-G01 → FIG-S02-PRODUCT-DETAIL-SECTION | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** | 2026-08-02 |
| FIG-UI03-WORK-DETAIL-DESKTOP | Storefront | Product Detail draft source | UI03 Studio Work Detail | Draft | Desktop 1440 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | User Interface | 262:1291 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=262-1291) | APP2-D01 | Reconciled by APP2-S02-G01 → FIG-S02-PRODUCT-DETAIL-DESKTOP | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** | 2026-08-02 |
| FIG-UI03-WORK-DETAIL-TABLET | Storefront | Product Detail draft source | UI03 Studio Work Detail | Draft | Tablet 1024 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | User Interface | 273:1409 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=273-1409) | APP2-D01 | Reconciled by APP2-S02-G01 → FIG-S02-PRODUCT-DETAIL-TABLET | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** | 2026-08-02 |
| FIG-UI03-WORK-DETAIL-MOBILE | Storefront | Product Detail draft source | UI03 Studio Work Detail | Draft | Mobile 390 | high-fidelity | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | User Interface | 279:1504 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=279-1504) | APP2-D01 | Reconciled by APP2-S02-G01 → FIG-S02-PRODUCT-DETAIL-MOBILE | **HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY** | 2026-08-02 |

### 4.5.3 Supported vs deferred (the reconciliation itself)

**Supported by the delivered contract, and drawn:** APP1 shell; breadcrumb (desktop/tablet)
and `← Quay lại Khám phá` (mobile) back to `/kham-pha`; image-led hero with an ordered
gallery and thumbnail controls; keyboard-accessible selection; accessible lightbox; Product
name as H1; category identity; **one** description section `Câu chuyện về tác phẩm`; media
loading/empty/error states; browser-local `Chia sẻ`; `Tiếp tục khám phá` links into Discover.

**Deferred — no field and no operation behind them, so removed from approved scope:** year;
technique label; dimensions; collection membership; separate `Cảm hứng` / `Ý tưởng` /
`Ý nghĩa` fields; materials and techniques; craft macro taxonomy; the Product-specific
four-step process; related tabs/cards/recommendations; save/favourite; commission actions;
soft-commission CTA; the mobile commission sticky bar; price/stock/buy-box/cart/rating/SKU;
and a working global search. The UI03 draft retains them as historical content.

**Natural ratio, not a locked crop.** `publicProductDetail` returns no image dimensions, so
the artwork sits in a neutral bounded stage with `contain`/natural-ratio behaviour. The
existing 3:4 `TEMP_ASSET` is annotated on-canvas as an example only
(`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`, routed and non-blocking).

## 4.6 BRD0 — Logo System Exploration (NEW, this checkpoint)

Page **`544:2409`** (`LOGO_SYSTEM`) in `FIG-FILE-PRODUCT` — a **brand-exploration**
page, not a product surface. It holds four parallel logo-system concepts drawn as
real Figma vectors, each with symbol, lockups, wordmark direction, monochrome and
colour versions, 16/24/32/48 px favicon tests, avatar, desktop and mobile headers,
watermark and packaging previews, plus a pros/cons/fit assessment.

**Authority: none.** Every row is `REFERENCE_ONLY`. This package selects **no**
winning concept, proposes **no** brand name (the wordmark is the literal placeholder
`TÊN THƯƠNG HIỆU` / `Tên Thương Hiệu`), and creates **no** design token — it consumes
the approved foundation only (`$color-text-primary`, `$color-action-primary`,
`$color-background-primary`, `$color-surface-primary`, `$color-text-secondary`,
`$color-text-tertiary`, `$color-border-primary`; base-4 spacing; radius scale).
No frontend checkpoint may implement from these rows. Brand-name and concept selection
were **open at `BRD0-F01`** and are **closed at `BRD0-F02`** — see §4.6.1.

`Route/Capability` is `BRD0` throughout because a logo system is not route-bound.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-BRD0-LOGO-SYSTEM-PAGE | Brand | BRD0 | Logo System Exploration | Container | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 544:2409 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=544-2409) | BRD0-F01 | — | — | 2026-08-03 |
| FIG-BRD0-PREFLIGHT-TOKEN-LEGEND | Brand | BRD0 | Preflight & Token Legend | Annotation | Desktop | annotation | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 546:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=546-3) | BRD0-F01 | — | — | 2026-08-03 |
| FIG-BRD0-C1-CONTINUOUS-THREAD | Brand | BRD0 | Concept 1 — Continuous Thread Mark | Exploration | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 546:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=546-4) | BRD0-F01 | — | — | 2026-08-03 |
| FIG-BRD0-C2-ABSTRACT-STITCH | Brand | BRD0 | Concept 2 — Abstract Stitch Geometry | Exploration | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 546:5 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=546-5) | BRD0-F01 | — | — | 2026-08-03 |
| FIG-BRD0-C3-SIGNATURE-MOTIF | Brand | BRD0 | Concept 3 — Personal Mark / Signature Motif | Exploration | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 546:6 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=546-6) | BRD0-F01 | — | — | 2026-08-03 |
| FIG-BRD0-C4-WORDMARK-LED | Brand | BRD0 | Concept 4 — Wordmark-led Flexible Identity | Exploration | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 546:7 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=546-7) | BRD0-F01 | — | — | 2026-08-03 |
| FIG-BRD0-COMPARISON-MATRIX | Brand | BRD0 | Comparison Matrix (9 criteria × 4 concepts) | Annotation | Desktop | annotation | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 546:8 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=546-8) | BRD0-F01 | — | — | 2026-08-03 |

### 4.6.1 BRD0-F02 — Concept 03 selected and productionized (NEW, this checkpoint)

The Product Owner selected **Concept 03 — Personal Mark / Signature Motif**. Section
`546:6` is relabelled `SELECTED · LOCKED FOR REFINEMENT`; `546:4`, `546:5`, `546:7`
and `546:8` are relabelled `ARCHIVED · NOT SELECTED` / `HISTORICAL EVIDENCE` and kept
as audit evidence (never deleted). The brand name **`Nét Thêu`**, descriptor
**`Xưởng thêu cá nhân hóa`** and slogan **`Thêu nên dấu riêng.`** are locked and now
replace the placeholder wordmark.

**Symbol source of truth is node `554:13`** (seal ring + signature gesture, inside the
Concept 03 section). Every mark in `09B` is a **clone** of that node — the symbol was
not redrawn. Two production-only refinements are applied and shown side by side against
the untouched original: ring `strokeWeight` 4 → 6, and a micro-size variant (ring
removed, gesture `strokeWeight` 16.9 → 21) for use below 32 px. **No `vectorPaths` data
was altered.**

**`09A` records a rejected direction.** A first pass wrongly reinterpreted "select
Concept 03" as licence to derive a *new* `N` monogram from the brand name. That section
is retained for audit under an on-canvas `REJECTED — Incorrect reinterpretation into N
monogram · DO NOT USE` banner and is **not** authority for anything.

Both sections remain `REFERENCE_ONLY`: the logo system still needs human approval, and
no production asset (SVG/PNG/ICO) has been exported.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-BRD0-C3-PRODUCTIONIZATION | Brand | BRD0 | Concept 03 Productionization (Nét Thêu) | Logo system | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 582:18 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=582-18) | BRD0-F02 | Productionizes FIG-BRD0-C3-SIGNATURE-MOTIF (symbol node 554:13) | — | 2026-08-03 |
| FIG-BRD0-C3-SYMBOL-MASTER | Brand | BRD0 | Approved symbol master artwork (original / production / micro) | Master | All | brand-exploration | REFERENCE_ONLY | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 582:9 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=582-9) | BRD0-F02 | Exact clone of 554:13 | — | 2026-08-03 |
| FIG-BRD0-WRONG-DIRECTION-ARCHIVE | Brand | BRD0 | Archived wrong direction (N monogram) | Rejected | All | brand-exploration | OBSOLETE | BQwqV8GdfUIELvsQDB1UQE | LOGO_SYSTEM | 570:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=570-3) | BRD0-F02 | Rejected — incorrect reinterpretation; replaced by FIG-BRD0-C3-PRODUCTIONIZATION | — | 2026-08-03 |

**Typography deviation, disclosed.** The approved primary font `General Sans` is not
installed in `FIG-FILE-PRODUCT` (`listAvailableFontsAsync` returned zero `General
Sans` styles). Every wordmark on this page is set in **Inter**, which
`DESIGN_SYSTEM_FOUNDATION.md` §5 already designates as the design-approved Figma
fallback for the same scale. This is a rendering fallback, not a new token. The
`Nét Thêu` wordmark must be rebuilt and re-judged in General Sans before any production
asset is exported; `BRD0-F02` deliberately cut **no** custom glyphs for this reason,
since customization done on the fallback face would be discarded.


### 4.7 APP3-D01 — Design Templates & 2D Studio (NEW, this checkpoint)

Section **`596:3`** — [APP3-D01 · Design Templates & 2D Studio](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=596-3), page **APP_03** (`592:3`).

One top-level Figma section holding **19 named sub-sections** (`00 — APP3 Overview / Flow Map` … `18 — Handoff / Dependency Notes`) and **66 frames**. The single-section anchor matches the `APP1-D01`/`APP2-D01` convention so this row set has one parent node; the directive's 19 sections are the nested sections inside it.

Every row entered this registry as `REVIEW_REQUIRED` — `APP3-D01` does not self-approve. **No APP3 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; approval must land first and flip the rows to `APPROVED_FOR_IMPLEMENTATION` with an approval-evidence id.

Approvals since then have been **scoped to the checkpoint that consumed them**, never blanket: `APP3-A01 §0` released the placement, Template list and Template editor rows, `APP3-A04 §0` released the five lifecycle rows, `APP3-S01 §3` released the five Studio-shell rows under section `05` (`596:11`), `APP3-S02 §5` released the three stage rows under section `06` (`596:12`), `APP3-S07 §4` released the three zoom/pan/safe-area rows under section `11` (`596:17`), `APP3-S03 §2` released the three transform-control rows under section `07` (`596:13`), `APP3-S05 §4` released the three text rows under section `09` (`596:15`), `APP3-S06 §6` released the four image rows under section `10` (`596:16`), `APP3-S04 §4` released the three layer rows under section `08` (`596:14`), `APP3-S09 §3` released the four watermark rows under section `13` (`596:19`), `APP3-S08 §1` released the two undo/redo rows under section `12` (`596:18`), `APP3-S10 §3` released the six autosave, conflict and resume rows under section `14` (`596:20`), and `APP3-S11 §4` released the six mobile and touch rows under section `15` (`596:21`). The `S11` release closes the last Studio section: `FIG-STUDIO-MOBILE-IMAGESHEET` (`610:465`) was never released by the desktop image rows — `S06` renders no mobile editing surface at all — and reached `APPROVED_FOR_IMPLEMENTATION` only when the checkpoint that draws it opened. Every Studio row now belongs to a checkpoint that consumed it; no Studio section was ever approved as a whole.

The `S07` release is deliberately three rows and not the section: `FIG-STUDIO-EDITING-TABLET-1024` (`618:140`) draws a zoom control *and* the whole `S02`–`S11` editing surface, and it stays an `APP3-D01-C1` responsive reference rather than being re-attributed, because a reference re-labelled as owned becomes a licence for every capability drawn on it.

Sub-section anchors: `00` `596:6` · `01` `596:7` · `02` `596:8` · `03` `596:9` · `04` `596:10` · `05` `596:11` · `06` `596:12` · `07` `596:13` · `08` `596:14` · `09` `596:15` · `10` `596:16` · `11` `596:17` · `12` `596:18` · `13` `596:19` · `14` `596:20` · `15` `596:21` · `16` `596:22` · `17` `596:23` · `18` `596:24`.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP3-OVERVIEW-FLOWMAP | Shared | APP3 phase overview | Flow Map & Checkpoint Dependency | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 597:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=597-3) | APP3-D01 | — | — | 2026-08-09 |
| FIG-ADMIN-PLACEMENT-DESKTOP-DEFAULT | Admin | Admin placement authoring | Placement Authoring | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 598:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=598-3) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-PLACEMENT-DESKTOP-AREAEDIT | Admin | Admin placement authoring | Placement Authoring | Area Editing | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 598:76 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=598-76) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-PLACEMENT-DESKTOP-VALIDATION | Admin | Admin placement authoring | Placement Authoring | Validation Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 598:149 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=598-149) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-PLACEMENT-DESKTOP-LOADING | Admin | Admin placement authoring | Placement Authoring | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 598:225 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=598-225) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIST-DESKTOP-DEFAULT | Admin | Admin template list | Template List | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 600:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=600-3) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIST-DESKTOP-LOADING | Admin | Admin template list | Template List | Loading Skeleton | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 600:91 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=600-91) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIST-DESKTOP-EMPTY | Admin | Admin template list | Template List | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 600:140 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=600-140) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIST-DESKTOP-ERROR | Admin | Admin template list | Template List | API Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 600:188 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=600-188) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT | Admin | Admin template list | Template List | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 600:236 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=600-236) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-DEFAULT | Admin | Admin template editor | Template Editor | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 601:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=601-3) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-TEXTSELECTED | Admin | Admin template editor | Template Editor | Text Selected | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 601:48 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=601-48) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-SAVING | Admin | Admin template editor | Template Editor | Unsaved / Saving | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 601:100 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=601-100) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-CONFLICT | Admin | Admin template editor | Template Editor | Stale Version Conflict | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 601:147 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=601-147) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATEEDITOR-MOBILE-READONLY | Admin | Admin template editor | Template Editor | Read-only Notice | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 601:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=601-204) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY | Admin | Admin template lifecycle | Publish Readiness | Ready | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-3) | APP3-D01 | — | APP3-A04 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-GUARDFAIL | Admin | Admin template lifecycle | Publish Readiness | Guard Failure | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:54 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-54) | APP3-D01 | — | APP3-A04 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-PUBLISHCONFIRM | Admin | Admin template lifecycle | Publish Confirmation | Confirmation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:105 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-105) | APP3-D01 | — | APP3-A04 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-ARCHIVE | Admin | Admin template lifecycle | Archive Dialog | Destructive Confirmation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:152 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-152) | APP3-D01 | — | APP3-A04 §0 operator review | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED | Admin | Admin template lifecycle | Restore from Archive | Blocked by APP3-B04A | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-204) | APP3-D01 | — | APP3-A04 §0 operator review | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-DEFAULT | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:5 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-5) | APP3-D01 | — | APP3-S01 §3 operator review | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-PREVIEWPENDING | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Preview Pending (B05A) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:46 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-46) | APP3-D01 | — | APP3-S01 §3 operator review | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-EMPTY | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:73 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-73) | APP3-D01 | — | APP3-S01 §3 operator review | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-EXPIRED | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Session Expired | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:85 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-85) | APP3-D01 | — | APP3-S01 §3 operator review | 2026-08-09 |
| FIG-STUDIO-SHELL-MOBILE-DEFAULT | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:100 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-100) | APP3-D01 | — | APP3-S01 §3 operator review | 2026-08-09 |
| FIG-STUDIO-STAGE-DESKTOP-UNSELECTED | Storefront | Studio stage & selection | Design Stage | Nothing Selected | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-3) | APP3-D01 | — | APP3-S02 §5 operator review | 2026-08-09 |
| FIG-STUDIO-STAGE-DESKTOP-SELECTED | Storefront | Studio stage & selection | Design Stage | Element Selected | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:63 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-63) | APP3-D01 | — | APP3-S02 §5 operator review | 2026-08-09 |
| FIG-STUDIO-STAGE-DESKTOP-EMPTY | Storefront | Studio stage & selection | Design Stage | Empty Document | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:133 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-133) | APP3-D01 | — | APP3-S02 §5 operator review | 2026-08-09 |
| FIG-STUDIO-TRANSFORM-DESKTOP-MOVE | Storefront | Studio transform controls | Transform Controls | Move | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:186 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-186) | APP3-D01 | — | APP3-S03 §2 operator review | 2026-08-09 |
| FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE | Storefront | Studio transform controls | Transform Controls | Resize | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:256 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-256) | APP3-D01 | — | APP3-S03 §2 operator review | 2026-08-09 |
| FIG-STUDIO-TRANSFORM-DESKTOP-ROTATE | Storefront | Studio transform controls | Transform Controls | Rotate | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:326 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-326) | APP3-D01 | — | APP3-S03 §2 operator review | 2026-08-09 |
| FIG-STUDIO-LAYERS-DESKTOP-DEFAULT | Storefront | Studio layers | Layers Panel | List & Selection | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-3) | APP3-D01 | — | APP3-S04 §4 operator review | 2026-08-12 |
| FIG-STUDIO-LAYERS-DESKTOP-REORDER | Storefront | Studio layers | Layers Panel | Reordering | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:68 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-68) | APP3-D01 | — | APP3-S04 §4 operator review | 2026-08-12 |
| FIG-STUDIO-LAYERS-DESKTOP-EMPTY | Storefront | Studio layers | Layers Panel | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:136 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-136) | APP3-D01 | — | APP3-S04 §4 operator review | 2026-08-12 |
| FIG-STUDIO-TEXT-DESKTOP-EDITING | Storefront | Studio text | Text Editing | Editing | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:176 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-176) | APP3-D01 | — | APP3-S05 §4 operator review | 2026-08-09 |
| FIG-STUDIO-TEXT-DESKTOP-FONTPICKER | Storefront | Studio text | Text Editing | Font Picker | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:231 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-231) | APP3-D01 | — | APP3-S05 §4 operator review | 2026-08-09 |
| FIG-STUDIO-TEXT-DESKTOP-VALIDATION | Storefront | Studio text | Text Editing | Validation & Font Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:286 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-286) | APP3-D01 | — | APP3-S05 §4 operator review | 2026-08-09 |
| FIG-STUDIO-IMAGE-DESKTOP-UPLOADING | Storefront | Studio image & asset | Customer Image | Uploading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:343 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-343) | APP3-D01 | — | APP3-S06 §6 operator review | 2026-08-12 |
| FIG-STUDIO-IMAGE-DESKTOP-NORMALIZING | Storefront | Studio image & asset | Customer Image | Normalizing | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:393 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-393) | APP3-D01 | — | APP3-S06 §6 operator review | 2026-08-12 |
| FIG-STUDIO-IMAGE-DESKTOP-READY | Storefront | Studio image & asset | Customer Image | Ready & Placed | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:441 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-441) | APP3-D01 | — | APP3-S06 §6 operator review | 2026-08-12 |
| FIG-STUDIO-IMAGE-DESKTOP-FAILED | Storefront | Studio image & asset | Customer Image | Failed Inspection | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:503 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-503) | APP3-D01 | — | APP3-S06 §6 operator review | 2026-08-12 |
| FIG-STUDIO-ZOOM-DESKTOP-FIT | Storefront | Studio zoom pan & safe area | Zoom & Safe Area | Fit to Stage | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-3) | APP3-D01 | — | APP3-S07 §4 operator review | 2026-08-09 |
| FIG-STUDIO-ZOOM-DESKTOP-ZOOMED | Storefront | Studio zoom pan & safe area | Zoom & Safe Area | Zoomed In & Panned | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:51 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-51) | APP3-D01 | — | APP3-S07 §4 operator review | 2026-08-09 |
| FIG-STUDIO-ZOOM-DESKTOP-SAFEAREAHIDDEN | Storefront | Studio zoom pan & safe area | Zoom & Safe Area | Safe Area Hidden | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:99 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-99) | APP3-D01 | — | APP3-S07 §4 operator review | 2026-08-09 |
| FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY | Storefront | Studio undo & redo | Undo / Redo | Mid History | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:147 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-147) | APP3-D01 | — | APP3-S08 §4 operator review; node read live at APP3-S08-C1 human review | 2026-08-13 |
| FIG-STUDIO-UNDO-DESKTOP-DISABLED | Storefront | Studio undo & redo | Undo / Redo | Nothing to Undo | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:209 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-209) | APP3-D01 | — | APP3-S08 §4 operator review; node read live at APP3-S08-C1 human review | 2026-08-13 |
| FIG-STUDIO-WATERMARK-DESKTOP-LIGHT | Storefront | Studio watermark | Watermark | Over Light Imagery | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:263 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-263) | APP3-D01 | — | APP3-S09 §3 operator review | 2026-08-12 |
| FIG-STUDIO-WATERMARK-DESKTOP-DARK | Storefront | Studio watermark | Watermark | Over Dark Imagery | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:299 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-299) | APP3-D01 | — | APP3-S09 §3 operator review | 2026-08-12 |
| FIG-STUDIO-WATERMARK-MOBILE-DEFAULT | Storefront | Studio watermark | Watermark | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:335 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-335) | APP3-D01 | — | APP3-S09 §3 operator review | 2026-08-12 |
| FIG-STUDIO-WATERMARK-POLICY | Storefront | Studio watermark | Watermark Policy | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:371 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-371) | APP3-D01 | — | APP3-S09 §3 operator review | 2026-08-12 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED | Storefront | Studio autosave conflict & resume | Autosave | Saved | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-3) | APP3-D01 | — | APP3-S10 §3 operator review | 2026-08-13 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVING | Storefront | Studio autosave conflict & resume | Autosave | Saving | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:41 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-41) | APP3-D01 | — | APP3-S10 §3 operator review | 2026-08-13 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-OFFLINE | Storefront | Studio autosave conflict & resume | Autosave | Failed / Offline | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:77 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-77) | APP3-D01 | — | APP3-S10 §3 operator review | 2026-08-13 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-CONFLICT | Storefront | Studio autosave conflict & resume | Autosave | Stale Revision Conflict | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:118 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-118) | APP3-D01 | — | APP3-S10 §3 operator review | 2026-08-13 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-RESUME | Storefront | Studio autosave conflict & resume | Session Resume | Resume Prompt | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:159 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-159) | APP3-D01 | — | APP3-S10 §3 operator review | 2026-08-13 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-EXPIRED | Storefront | Studio autosave conflict & resume | Session Resume | Expired / Credential Lost | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:201 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-201) | APP3-D01 | — | APP3-S10 §3 operator review | 2026-08-13 |
| FIG-STUDIO-MOBILE-STAGE-SELECTED | Storefront | Studio mobile & touch | Mobile Stage | Selected | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:242 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-242) | APP3-D01 | — | APP3-S11 §4 operator review | 2026-08-13 |
| FIG-STUDIO-MOBILE-TRANSFORMSHEET | Storefront | Studio mobile & touch | Mobile Transform Sheet | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:294 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-294) | APP3-D01 | — | APP3-S11 §4 operator review | 2026-08-13 |
| FIG-STUDIO-MOBILE-LAYERSSHEET | Storefront | Studio mobile & touch | Mobile Layers Sheet | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:353 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-353) | APP3-D01 | — | APP3-S11 §4 operator review | 2026-08-13 |
| FIG-STUDIO-MOBILE-TEXTSHEET | Storefront | Studio mobile & touch | Mobile Text Sheet | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:409 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-409) | APP3-D01 | — | APP3-S11 §4 operator review | 2026-08-13 |
| FIG-STUDIO-MOBILE-IMAGESHEET | Storefront | Studio mobile & touch | Mobile Image Sheet | Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:465 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-465) | APP3-D01 | — | APP3-S11 §4 operator review | 2026-08-13 |
| FIG-STUDIO-MOBILE-CONFLICT | Storefront | Studio mobile & touch | Mobile Conflict Sheet | Stale Revision Conflict | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:514 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-514) | APP3-D01 | — | APP3-S11 §4 operator review | 2026-08-13 |
| FIG-APP3-SHARED-STATEMATRIX | Shared | APP3 shared components & states | Shared State Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 611:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=611-3) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-APP3-DS-GAPS | Shared | APP3 shared components & states | Design-system Gaps | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 611:91 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=611-91) | APP3-D01 | — | — | 2026-08-09 |
| FIG-APP3-RESPONSIVE-REFERENCE | Shared | APP3 responsive reference | Responsive Reference | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 611:105 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=611-105) | APP3-D01 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-APP3-HANDOFF-DEPENDENCY | Shared | APP3 handoff & dependency | Handoff & Backend Dependency | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 611:145 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=611-145) | APP3-D01 | — | — | 2026-08-09 |

### 4.8 APP3-D01-C1 — responsive reference frames (NEW, this correction)

Section **`596:23`** — `17 — Responsive Reference`, page **APP_03** (`592:3`).

`APP3-D01` specified the Admin 1280 and Studio 1024 breakpoints in prose but drew
neither. Human review ruled that insufficient for implementation authority, so
`APP3-D01-C1` draws all three as real frames. Every breakpoint the package claims
now has a Figma reference; none is prose-only.

**Both** Admin 1280 references are drawn deliberately: `A03` has an elastic stage
between two minimum-width panels, while `A01`'s middle column is a fixed-aspect
placement preview that scales rather than reflows. That collapse rule cannot be
inferred from `A03`, which is the condition the correction directive sets for
drawing a second Admin reference.

The correction did not self-approve these rows. The operator reviewed `APP3-D01`
and `APP3-D01-C1`, accepted both, and the approval was applied to the registry by
`APP3-A01` §1 — see §4.9.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280 | Admin | Admin template editor | Template Editor | Narrow Desktop Reference | Desktop 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 618:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=618-3) | APP3-D01-C1 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-ADMIN-PLACEMENT-NARROW-1280 | Admin | Admin placement authoring | Placement Authoring | Narrow Desktop Reference | Desktop 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 618:74 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=618-74) | APP3-D01-C1 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-STUDIO-EDITING-TABLET-1024 | Storefront | Studio editing surface | Studio Editing | Tablet Reference | Tablet 1024 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 618:140 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=618-140) | APP3-D01-C1 | — | APP3-A01 §0 operator review | 2026-08-09 |

### 4.9 APP3-D01 / D01-C1 operator approval (applied by `APP3-A01`)

The operator reviewed `APP3-D01` and its single correction and accepted both:

```text
APP3-D01    = COMPLETE — REVIEW_ACCEPTED
APP3-D01-C1 = COMPLETE — REVIEW_ACCEPTED
```

`APP3-A01` §1 applied that approval here. **21** rows moved
`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`:

| Group | Rows |
|---|---|
| A01 · Admin placement authoring | 4 |
| A02 · Admin template list | 5 |
| A03 · Admin template editor | 5 |
| Shared state matrix + responsive reference | 2 |
| D01-C1 responsive references (`618:3`, `618:74`, `618:140`) | 3 |
| `FIG-DS-INPUT`, `FIG-DS-SCRIM-TOKEN` | 2 |

The transition is **scoped to what `A01`/`A02`/`A03` need**, which is how the
`APP3-A01` directive framed it. `A04` and every Studio screen remain
`REVIEW_REQUIRED`: their designs were accepted, but no checkpoint has been
cleared to implement them, and an `APPROVED_FOR_IMPLEMENTATION` row is a
standing licence for §2 to let frontend work proceed. Granting it early would
make this registry stop being the gate it exists to be. Those rows transition
when their own checkpoints open.

`FU-DESIGN-PUBLISH-DS-INPUT-01` stays **OPEN**. Approval is not publication: the
Figma library still needs a manual publish before another file can instance
`FIG-DS-INPUT`. It does not block code, which consumes the token and component
semantics rather than a Figma instance.

### 4.10 APP4-D01 — Customer Identity, Verification, Secure Access & Notification (NEW, this checkpoint)

Section **`621:3`** — [APP4-D01 · Customer Identity, Verification, Secure Access & Notification](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=621-3), page **APP_04** (`620:3`).

One top-level Figma section holding **8 named sub-sections** (`00 — APP4 Overview / Flow Map` … `07 — Handoff / Dependency Notes`) and **48 frames**. The single-section anchor matches the `APP1-D01`/`APP2-D01`/`APP3-D01` convention, so this row set has one parent node.

**Pre-draw audit (mandatory, `APP4-D01` §1).** Before any Figma write this registry was searched for APP4-owned rows — contact verification, `/xac-minh-lien-he`, secure-link landing, `/truy-cap`, Admin customer-access support, `/support/customer-access`, `APP4-S01`, `APP4-S02`, `APP4-A01` — and **none existed**. The `APP_04` canvas itself was verified empty (zero children) in the same audit. Outcome: **`NO_EXISTING_APP4_DESIGN`**; nothing was reused, supplemented, repaired or superseded, and no APP1–APP3 node was touched.

Every row enters as `REVIEW_REQUIRED` — `APP4-D01` does not self-approve (§2 rule 4, §8 step 3, §9). **No APP4 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; approval must land first and flip the rows it covers to `APPROVED_FOR_IMPLEMENTATION` with an approval-evidence id, scoped to the checkpoint that consumes them — the pattern `APP3-D01` established.

**Product Owner approval (2026-08-15) — `FIG-APPROVAL-APP4-D01-PO-001`.** The Product Owner reviewed and approved the **complete** `APP4-D01` package, so all **48** rows below move `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` and `APP4-S01`, `APP4-S02` and `APP4-A01` may consume their registered nodes. This is a human-review promotion recorded by the reviewer, not design self-approval: no Figma node was created, deleted, moved, renamed, restyled or otherwise modified in applying it, and no row outside `APP4-D01` was promoted. All 48 nodes were re-resolved live against `621:3` at promotion time (8 sub-sections, 48 top-level frames, every node id matching the row that names it).

**Product Owner A01 amendment (2026-08-15) — `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`.**
`APP4-A01` stopped at three authority gates before any Admin source existed: the
approved screen asked the operator for an email or a phone but contained no
control to enter one and no contract to resolve one; its notification card read
as Customer-bound while `APP4-B08` published no Customer relationship; and
`633:86` asserted that no second replay was created while the replay response
could not tell a first replay from a duplicate. The Product Owner resolved all
three by extending the contracts — an exact verified-contact resolver, a
Customer filter bound through the persisted contact point, and an explicit
`CREATED`/`EXISTING` replay outcome — and authorized a **narrow amendment to the
18 `APP4-A01` frames only** so the approved design shows what the screen now
actually does.

What changed, and nothing else: a persistent `Tra cứu khách hàng` control (kind
selector, contact input, action) was added above the support cards in **all 18**
A01 frames, and the columns beneath it were re-seated; the not-found body copy
now describes the lookup the control performs, without distinguishing an
unverified or deactivated contact from an unknown one; the spec strips of the
frames carrying a notification card record that the card shows only the most
recent terminal failure **explicitly bound** to the loaded Customer; and the
`633:3`/`633:86` strips record the `outcome = CREATED` / `outcome = EXISTING`
mapping. `Tên hiển thị` was already drawn on every Customer card and is now
backed by B07's `displayName`, so no frame changed for it.

No new design-system master, token, style or variable was created — the control
is built from the file's existing `Color/*` variables and the same 16/14/12 type
sizes the surrounding cards use. No `APP4-S01`, `APP4-S02` or non-A01 row was
touched, and every other row keeps `FIG-APPROVAL-APP4-D01-PO-001`. The 18 A01
rows below therefore carry the new approval evidence; all 18 remain
`APPROVED_FOR_IMPLEMENTATION`, their node ids are unchanged, and each was
re-resolved live after the edit (18 frames, no overflow of the 740px content area
or the 96px spec strip).

Sub-section anchors: `00` `621:4` · `01` `621:5` · `02` `621:6` · `03` `621:7` · `04` `621:8` · `05` `621:9` · `06` `621:10` · `07` `621:11`.

Policy values shown on these frames — 10-minute code expiry, six decimal digits, five attempts, 60-second resend cooldown, five issuances per 15 minutes, 7-day grant, 15-minute step-up window, three delivery attempts with 60/300-second backoff — are **read from `ADR-APP4-001` (`IMP-D049`)**, never invented in Figma. The frames render them as illustrative UI copy; the ADR fact table remains the authority.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-VERIFY-CONTACT-DESKTOP-DEFAULT | Storefront | /xac-minh-lien-he | Contact Verification | Contact Entry — Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 623:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-3) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CONTACT-DESKTOP-INVALID | Storefront | /xac-minh-lien-he | Contact Verification | Contact Entry — Invalid Input | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 623:27 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-27) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CONTACT-DESKTOP-SUBMITTING | Storefront | /xac-minh-lien-he | Contact Verification | Contact Entry — Submitting | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 623:51 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-51) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-SENT | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Code Sent | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 623:75 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-75) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-VERIFYING | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Verifying | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 623:108 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-108) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-MISMATCH | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Code Mismatch | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-3) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-COOLDOWN | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Resend Cooldown | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:36 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-36) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-RESENT | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Resend Available / Resent | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:70 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-70) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-EXPIRED | Storefront | /xac-minh-lien-he | Contact Verification | Challenge Expired | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:106 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-106) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-LOCKOUT | Storefront | /xac-minh-lien-he | Contact Verification | Attempt-limit Lockout | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:140 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-140) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CONTACT-DESKTOP-RATELIMITED | Storefront | /xac-minh-lien-he | Contact Verification | Rate Limited — Temporarily Unavailable | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:173 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-173) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-DESKTOP-SUCCESS | Storefront | /xac-minh-lien-he | Contact Verification | Verification Success | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:193 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-193) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CONTACT-DESKTOP-ERROR | Storefront | /xac-minh-lien-he | Contact Verification | Recoverable Network / Server Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 625:211 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-211) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CONTACT-MOBILE-DEFAULT | Storefront | /xac-minh-lien-he | Contact Verification | Contact Entry — Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 628:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=628-3) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-MOBILE-SENT | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Code Sent | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 628:25 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=628-25) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-MOBILE-COOLDOWN | Storefront | /xac-minh-lien-he | Contact Verification | Code Entry — Resend Cooldown | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 628:57 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=628-57) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-MOBILE-LOCKOUT | Storefront | /xac-minh-lien-he | Contact Verification | Attempt-limit Lockout | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 628:90 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=628-90) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-VERIFY-CODE-MOBILE-SUCCESS | Storefront | /xac-minh-lien-he | Contact Verification | Verification Success | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 628:121 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=628-121) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-SECURELINK-DESKTOP-BOOTSTRAP | Storefront | /truy-cap | Secure-Link Landing | Bootstrap / Resolving | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 629:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-3) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-SECURELINK-DESKTOP-AUTHORIZED | Storefront | /truy-cap | Secure-Link Landing | Valid Grant — Authorized Shell | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 629:20 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-20) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-SECURELINK-DESKTOP-UNAVAILABLE | Storefront | /truy-cap | Secure-Link Landing | Unavailable — Single Indistinguishable State | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 629:37 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-37) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-SECURELINK-DESKTOP-NETWORKERROR | Storefront | /truy-cap | Secure-Link Landing | Transient Network Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 629:53 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-53) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-SECURELINK-MOBILE-AUTHORIZED | Storefront | /truy-cap | Secure-Link Landing | Valid Grant — Authorized Shell | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 629:70 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-70) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-SECURELINK-MOBILE-UNAVAILABLE | Storefront | /truy-cap | Secure-Link Landing | Unavailable — Single Indistinguishable State | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 629:87 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-87) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-ADMIN-CUSTOMERACCESS-DESKTOP-LOADING | Admin | /support/customer-access | Customer Access Support | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 631:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=631-3) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-CUSTOMERACCESS-DESKTOP-OVERVIEW | Admin | /support/customer-access | Customer Access Support | Customer & Contact Loaded | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 631:45 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=631-45) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-GRANT-DESKTOP-NONE | Admin | /support/customer-access | Secure Grant | No Active Grant | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 631:124 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=631-124) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-GRANT-DESKTOP-ACTIVE | Admin | /support/customer-access | Secure Grant | Active Grant | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 631:189 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=631-189) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-GRANT-DESKTOP-REVOKECONFIRM | Admin | /support/customer-access | Secure Grant | Revoke Confirmation (reason required) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 631:251 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=631-251) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-GRANT-DESKTOP-REVOKING | Admin | /support/customer-access | Secure Grant | Revoking | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 631:326 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=631-326) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-GRANT-DESKTOP-REVOKED | Admin | /support/customer-access | Secure Grant | Revoke Success | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 632:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=632-3) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-GRANT-DESKTOP-CONFLICT | Admin | /support/customer-access | Secure Grant | Revoke Conflict | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 632:59 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=632-59) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-NOFAILURE | Admin | /support/customer-access | Notification Delivery | No Delivery Failure | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 632:108 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=632-108) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-TERMINALFAILURE | Admin | /support/customer-access | Notification Delivery | Terminal Failure | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 632:169 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=632-169) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-REPLAYCONFIRM | Admin | /support/customer-access | Notification Delivery | Manual Replay Confirmation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 632:246 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=632-246) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-REPLAYING | Admin | /support/customer-access | Notification Delivery | Replay Submitting | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 632:329 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=632-329) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-REPLAYED | Admin | /support/customer-access | Notification Delivery | Replay Success | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 633:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=633-3) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-REPLAYDUPLICATE | Admin | /support/customer-access | Notification Delivery | Duplicate Replay — Canonical Current State | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 633:86 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=633-86) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-DELIVERY-DESKTOP-REISSUEREQUIRED | Admin | /support/customer-access | Notification Delivery | REISSUE_REQUIRED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 633:147 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=633-147) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-CUSTOMERACCESS-DESKTOP-LOADERROR | Admin | /support/customer-access | Customer Access Support | Data Load Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 633:226 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=633-226) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-CUSTOMERACCESS-DESKTOP-NOTFOUND | Admin | /support/customer-access | Customer Access Support | Empty / Not Found | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 633:253 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=633-253) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-ADMIN-CUSTOMERACCESS-NARROW-1280 | Admin | /support/customer-access | Customer Access Support | Narrow Desktop Reference | Desktop 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 633:277 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=633-277) | APP4-D01 | — | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 | 2026-08-15 |
| FIG-APP4-OVERVIEW-FLOWMAP | Shared | APP4 phase overview | Flow Map & Surface Ownership | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 634:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=634-3) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-APP4-SECURITY-UX-RULES | Shared | APP4 security UX | Security UX Rules | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 634:38 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=634-38) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-APP4-NON-ENUMERATION | Shared | APP4 security UX | Non-enumeration Contract | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 634:59 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=634-59) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-APP4-RESPONSIVE-REFERENCE | Shared | APP4 responsive reference | Responsive Reference | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 634:103 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=634-103) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-APP4-ACCESSIBILITY-NOTES | Shared | APP4 accessibility | Accessibility Notes | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 634:134 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=634-134) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |
| FIG-APP4-HANDOFF-DEPENDENCY | Shared | APP4 handoff & dependency | Handoff & Backend Dependency | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_04 | 634:154 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=634-154) | APP4-D01 | — | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15 |

### 4.11 APP5-D01 — Custom Requests & Customer-Owned Products (NEW, this checkpoint)

Section **`644:3`** — [APP5-D01 · Custom Requests & Customer-Owned Products](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=644-3), page **APP_05** (`641:3`).

One top-level Figma section holding **10 named sub-sections** (`00 — APP5 Overview / Flow Map` … `09 — Handoff / Dependency Notes`) and **65 frames**, matching the single-section anchor convention of `APP1-D01`/`APP2-D01`/`APP3-D01`/`APP4-D01`.

**Pre-draw audit (mandatory).** Before any Figma write this registry was searched for every APP5-owned term — `APP5`, `APP_05`, `641:3`, `/yeu-cau`, `/requests`, `APP5-S01`, `APP5-S02`, `APP5-A01`, `APP5-A02` — and **no row existed**; §4 ended at `4.10 APP4-D01` and §10 enumerated APP1–APP4 and BRD0 only. The `APP_05` canvas itself was read live and had **zero children**. Outcome: **`NO_EXISTING_APP5_DESIGN`** — nothing was reused, supplemented, repaired or superseded, and no APP1–APP4 or BRD0 node was touched (anchors `375:11`, `405:2224`, `423:3`, `529:2224`, `596:3`, `596:23`, `621:3`, `546:3` re-read after the package was complete and unchanged).

Every row entered as `REVIEW_REQUIRED` — `APP5-D01` does not self-approve (§2 rule 4, §9). **No APP5 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; a human reviewer must promote the rows their checkpoint consumes, with an approval-evidence id, following the `APP3-D01`/`APP4-D01` precedent.

**Product Owner approval (2026-08-16) — `FIG-APPROVAL-APP5-D01-PO-001`.** The Product Owner reviewed and approved the **complete** `APP5-D01` package, so all **65** rows below move `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` and `APP5-S01`, `APP5-S02`, `APP5-A01` and `APP5-A02` may consume their registered nodes. Recorded by `APP5-B01` as a documentation preflight, exactly as `APP4-B01`-era practice recorded `FIG-APPROVAL-APP4-D01-PO-001`. This is a human-review promotion recorded by the reviewer, not design self-approval: **no Figma file was opened, read live or mutated** in applying it — no node was created, deleted, moved, renamed or restyled — every node id and deep link is byte-identical to the row `APP5-D01` wrote, and **no row outside `APP5-D01` was promoted or otherwise touched**. Because nothing in Figma changed, the `Last Verified` date stays at the `APP5-D01` verification (`2026-08-16`); the approval is evidence of review, not of a re-resolution.

Sub-section anchors: `00` `644:4` · `01` `644:5` · `02` `644:6` · `03` `644:7` · `04` `644:8` · `05` `644:9` · `06` `644:10` · `07` `644:11` · `08` `644:12` · `09` `644:13`.

Policy values rendered as UI copy on these frames — ten-image cap per asset role, twenty accepted uploads per challenge, 10 MB source limit, JPEG/PNG/WebP only, three bounded rejection classes, the `REQ-` code format, the five Admin moderation transitions and their reason/note requirements — are **read from `APP5-G01`** (`docs/implementation/audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md`). Verification-policy values shown at step 2 (six digits, ten-minute expiry, five attempts, sixty-second resend cooldown, seven-day grant) are read from `ADR-APP4-001` (`IMP-D049`). No business value was invented in Figma.

**Access-state reuse, deliberately not duplicated.** The secure-link bootstrap, authorized shell, single indistinguishable "unavailable" state and transient network error remain `APP4-D01` authority (`629:3`, `629:20`, `629:37`, `629:53`, `629:70`, `629:87`). `APP5-S02` fills the handoff slot those frames already draw; it does not redraw them, because a second copy of a security state is a second authority for the same behaviour. The mapping is tabulated on `FIG-APP5-MATRIX-STATUS` (`674:3`).

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP5-OVERVIEW-FLOWMAP | Shared | APP5 phase overview | Flow Map & Surface Ownership | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 645:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=645-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-CATALOG-DESKTOP-DEFAULT | Storefront | /yeu-cau/moi | Request Creation — Catalog Branch | Step 1 — Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 650:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=650-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-CATALOG-DESKTOP-QTYINVALID | Storefront | /yeu-cau/moi | Request Creation — Catalog Branch | Step 1 — Quantity Invalid | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 650:94 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=650-94) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-CATALOG-DESKTOP-SESSIONEXPIRED | Storefront | /yeu-cau/moi | Request Creation — Catalog Branch | Step 1 — Design Session Expired | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 650:187 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=650-187) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBJECT-CHOOSER-DESKTOP | Storefront | /yeu-cau/moi | Subject Chooser | Entry — Catalog XOR Customer-owned | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 651:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=651-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-COP-DESKTOP-DEFAULT | Storefront | /yeu-cau/moi | Request Creation — Customer-Owned Product | Step 1 — Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 651:40 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=651-40) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-COP-DESKTOP-VALIDATION | Storefront | /yeu-cau/moi | Request Creation — Customer-Owned Product | Step 1 — Validation Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 651:138 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=651-138) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-VERIFY-DESKTOP-CONTACT | Storefront | /yeu-cau/moi | Contact Verification (Step 2) | Step 2 — Contact Entry | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 652:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=652-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-VERIFY-DESKTOP-CODESENT | Storefront | /yeu-cau/moi | Contact Verification (Step 2) | Step 2 — Code Sent | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 652:55 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=652-55) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-VERIFY-DESKTOP-MISMATCH | Storefront | /yeu-cau/moi | Contact Verification (Step 2) | Step 2 — Code Mismatch | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 652:115 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=652-115) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-VERIFY-DESKTOP-EXPIRED | Storefront | /yeu-cau/moi | Contact Verification (Step 2) | Step 2 — Expired / Lockout / Rate Limited | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 652:175 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=652-175) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-VERIFY-DESKTOP-SUCCESS | Storefront | /yeu-cau/moi | Contact Verification (Step 2) | Step 2 — Verified, Step 3 Unlocked | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 652:229 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=652-229) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-DESKTOP-EMPTY | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Empty, COP Image Required | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 654:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=654-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-DESKTOP-UPLOADING | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Uploading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 654:66 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=654-66) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-DESKTOP-INSPECTING | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Inspection Pending | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 654:138 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=654-138) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-DESKTOP-ACCEPTED | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Accepted + Reference | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 654:214 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=654-214) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-DESKTOP-REJECTED | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Rejected (three reason classes) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 654:309 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=654-309) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-DESKTOP-CAP | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Cap Reached (10 per role) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 654:397 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=654-397) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBMIT-DESKTOP-REVIEW | Storefront | /yeu-cau/moi | Submission (Step 3) | Step 3 — Review & Submit | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 656:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=656-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBMIT-DESKTOP-SUBMITTING | Storefront | /yeu-cau/moi | Submission (Step 3) | Step 3 — Submitting (duplicate-safe) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 656:74 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=656-74) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBMIT-DESKTOP-UNCERTAIN | Storefront | /yeu-cau/moi | Submission (Step 3) | Step 3 — Uncertain Outcome, Safe Retry | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 656:119 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=656-119) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBMIT-DESKTOP-FAILED | Storefront | /yeu-cau/moi | Submission (Step 3) | Step 3 — Submission Failed | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 656:166 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=656-166) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBMIT-DESKTOP-REPLAY | Storefront | /yeu-cau/moi | Submission (Step 3) | Step 3 — Idempotent Replay | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 656:213 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=656-213) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-DESKTOP-LOADING | Storefront | /yeu-cau/moi | Request Creation | Loading / Context Restore | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 656:258 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=656-258) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-CATALOG-MOBILE-DEFAULT | Storefront | /yeu-cau/moi | Request Creation — Catalog Branch | Step 1 — Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 658:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=658-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-COP-MOBILE-DEFAULT | Storefront | /yeu-cau/moi | Request Creation — Customer-Owned Product | Step 1 — Default | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 658:59 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=658-59) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-VERIFY-MOBILE-CODESENT | Storefront | /yeu-cau/moi | Contact Verification (Step 2) | Step 2 — Code Sent | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 658:114 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=658-114) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-UPLOAD-MOBILE-MIXED | Storefront | /yeu-cau/moi | Attachment Intake (Step 3) | Step 3 — Accepted & Rejected | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 658:160 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=658-160) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S01-SUBMIT-MOBILE-REVIEW | Storefront | /yeu-cau/moi | Submission (Step 3) | Step 3 — Review & Submit | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 658:222 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=658-222) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-CONFIRM-DESKTOP | Storefront | /yeu-cau/da-gui | Submission Confirmation | Submitted | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 660:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=660-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-CONFIRM-MOBILE | Storefront | /yeu-cau/da-gui | Submission Confirmation | Submitted | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 660:53 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=660-53) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-DESKTOP-NEW | Storefront | /truy-cap | Grant-scoped Request Status | NEW | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-DESKTOP-UNDERREVIEW | Storefront | /truy-cap | Grant-scoped Request Status | UNDER_REVIEW | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:67 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-67) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-DESKTOP-NEEDSCLARIFICATION | Storefront | /truy-cap | Grant-scoped Request Status | NEEDS_CLARIFICATION | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:131 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-131) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-MOBILE-NEEDSCLARIFICATION | Storefront | /truy-cap | Grant-scoped Request Status | NEEDS_CLARIFICATION | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:352 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-352) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-DESKTOP-REJECTED | Storefront | /truy-cap | Grant-scoped Request Status | REJECTED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:199 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-199) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-DESKTOP-CANCELLED | Storefront | /truy-cap | Grant-scoped Request Status | CANCELLED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:267 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-267) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-S02-STATUS-DESKTOP-LOADING | Storefront | /truy-cap | Grant-scoped Request Status | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 661:335 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=661-335) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A01-QUEUE-DESKTOP-DEFAULT | Admin | /requests | Request Queue | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 662:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=662-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A01-QUEUE-DESKTOP-LOADING | Admin | /requests | Request Queue | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 662:112 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=662-112) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A01-QUEUE-DESKTOP-EMPTY | Admin | /requests | Request Queue | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 662:182 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=662-182) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A01-QUEUE-DESKTOP-FILTEREMPTY | Admin | /requests | Request Queue | Filter Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 662:243 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=662-243) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A01-QUEUE-DESKTOP-ERROR | Admin | /requests | Request Queue | Load Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 662:306 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=662-306) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A01-QUEUE-NARROW-1280 | Admin | /requests | Request Queue | Narrow Desktop Reference | Desktop 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 663:9 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=663-9) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DETAIL-DESKTOP-CATALOG | Admin | /requests/{requestId} | Request Detail | Catalog Branch — UNDER_REVIEW | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 665:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=665-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DETAIL-DESKTOP-COP | Admin | /requests/{requestId} | Request Detail | Customer-Owned Branch — NEW | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 665:115 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=665-115) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DETAIL-DESKTOP-LOADING | Admin | /requests/{requestId} | Request Detail | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 667:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=667-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DETAIL-DESKTOP-NOTFOUND | Admin | /requests/{requestId} | Request Detail | Not Found or Unauthorized | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 667:30 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=667-30) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DETAIL-NARROW-1280 | Admin | /requests/{requestId} | Request Detail | Narrow Desktop Reference | Desktop 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 672:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=672-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-ACTION-MATRIX | Admin | /requests/{requestId} | Moderation Actions | Allowed Transitions by Status | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 667:56 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=667-56) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DIALOG-CLARIFY | Admin | /requests/{requestId} | Moderation Dialog | Needs Clarification — reason + CLARIFY note | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 669:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=669-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DIALOG-REJECT | Admin | /requests/{requestId} | Moderation Dialog | Rejected — reason + REJECT/SPAM note | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 669:60 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=669-60) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DIALOG-CANCEL | Admin | /requests/{requestId} | Moderation Dialog | Cancelled — reason required, note optional | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 669:119 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=669-119) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DIALOG-VALIDATION | Admin | /requests/{requestId} | Moderation Dialog | Validation Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 669:173 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=669-173) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-DIALOG-SUBMITTING | Admin | /requests/{requestId} | Moderation Dialog | Submitting | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 670:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=670-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-MODERATION-SUCCESS | Admin | /requests/{requestId} | Moderation Outcome | Success | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 670:46 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=670-46) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-MODERATION-CONFLICT | Admin | /requests/{requestId} | Moderation Outcome | Stale Transition Conflict | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 670:104 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=670-104) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-A02-NOTE-APPEND | Admin | /requests/{requestId} | Moderation Note | Append-only Note | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 670:148 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=670-148) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-MATRIX-SUBJECT | Shared | APP5 shared specification | Subject Invariant & Intake Rules | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 673:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=673-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-MATRIX-ASSETS | Shared | APP5 shared specification | Asset Roles, Caps & Rejection Classes | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 673:65 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=673-65) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-MATRIX-SUBMITONCE | Shared | APP5 shared specification | Submit-once, Replay & Recovery | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 673:139 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=673-139) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-MATRIX-STATUS | Shared | APP5 shared specification | Customer Status & Access Surfaces | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 674:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=674-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-MATRIX-RESPONSIVE | Shared | APP5 shared specification | Responsive, Reuse & Accessibility | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 674:69 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=674-69) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-FRAME-INDEX | Shared | APP5 shared specification | Frame Index & State Coverage | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 675:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=675-3) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |
| FIG-APP5-HANDOFF-DEPENDENCY | Shared | APP5 handoff & dependency | Handoff & Backend Dependency | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_05 | 674:158 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=674-158) | APP5-D01 | — | FIG-APPROVAL-APP5-D01-PO-001 | 2026-08-16 |

### 4.12 APP6-D01 — Design Review, Approval & Quotation (NEW, this checkpoint)

Section **`681:3`** — [APP6-D01 · Design Review, Approval & Quotation](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=681-3), page **APP_06** (`678:3`).

One top-level Figma section holding **11 named sub-sections** (`00 — APP6 Overview / Flow Map` … `10 — Handoff / Dependency Notes`) and **56 frames**, matching the single-section anchor convention of `APP1-D01`/`APP2-D01`/`APP3-D01`/`APP4-D01`/`APP5-D01`.

**Pre-draw audit (mandatory).** Before any Figma write this registry was searched for every APP6-owned term — `APP6`, `APP_06`, `678:3`, `/requests/{requestId}/quotation`, `/requests/{requestId}/design`, `/truy-cap/bao-gia`, `/truy-cap/duyet-thiet-ke` — and **no row existed**; §4 ended at `4.11 APP5-D01` and §3 listed `APP_01`…`APP_05` write targets only. The live file was then read: the `APP_06` page **already existed** at `678:3` and had **zero children**. Per §2 rule 1 it was **reused, not re-created**, and no duplicate APP6 package exists. Outcome: **`NO_EXISTING_APP6_DESIGN`** — nothing was reused, supplemented, repaired or superseded, and no APP1–APP5 or BRD0 node was touched (anchors `375:11`, `405:2224`, `423:3`, `529:2224`, `596:3`, `596:23`, `621:3`, `644:3`, `546:3` re-read after the package was complete and unchanged).

Every row below entered as `REVIEW_REQUIRED` — `APP6-D01` does **not** self-approve (§2 rule 4, §9). **No APP6 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; a human reviewer must promote the rows their checkpoint consumes, with an approval-evidence id, following the `APP3-D01`/`APP4-D01`/`APP5-D01` precedent.

**Product Owner approval — recorded by `APP6-B01` (preflight).** The Product Owner reviewed the **complete** `APP6-D01` package and passed it. All **56** rows below were promoted `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` under approval evidence **`FIG-APPROVAL-APP6-D01-PO-001`**, exactly as the `APP1-D01`…`APP5-D01` rows carry theirs.

The promotion is a **registry edit only**. No Figma node was opened for mutation, and no node id, deep link, page/section ownership, screen/state/viewport or visual content changed. `Last Verified` is deliberately **unchanged at `2026-08-20`**: it records when a row was last checked against the live file, which a human approving the design does not re-perform. No row outside `APP6-D01` was touched — the file's other `REVIEW_REQUIRED` rows are unaffected by this approval.

Sub-section anchors: `00` `681:4` · `01` `681:5` · `02` `681:6` · `03` `681:7` · `04` `681:8` · `05` `681:9` · `06` `681:10` · `07` `681:11` · `08` `681:12` · `09` `681:13` · `10` `681:14`.

Policy values rendered as UI copy on these frames — 7-calendar-day quotation validity, the 40 % / 60 % deposit split, `VND` as the only currency, the six `QUOTATION_LINE_KINDS`, the seven `QUOTATION_VERSION_STATES`, the six `DESIGN_VERSION_STATES`, the required agreement type set `[PAYMENT_POLICY, RETURN_POLICY]` and the verbatim P1–P11 / R1–R12 agreement content — are **read from `APP6-G01`** (`docs/implementation/audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md` §5.6, §6) and `ADR-APP6-001`. No business value was invented in Figma; the mapping is tabulated on `FIG-APP6-MATRIX-MONEY-POLICY` (`719:57`).

**Access-state reuse, deliberately not duplicated.** The secure-link bootstrap, authorized shell and single indistinguishable "unavailable" state remain `APP4-D01` authority (`629:3`, `629:20`, `629:37`, `629:53`, `629:70`, `629:87`). `APP6-S01` and `APP6-S02` reference them rather than redrawing, because a second copy of a security state is a second authority for the same behaviour — the `APP5-D01` ruling, applied unchanged. The runtime watermark is likewise reused from `APP3-S09` (`609:263`, policy `609:371`) rather than redrawn, and the D01 frames reproduce it: Inter Medium 13, `Color/Text/Primary` at 13 % node opacity, and — **as measured on the Figma reproduction** — 18° rotation with a 160 × 130 tile. The mapping is tabulated on `FIG-APP6-REUSE-MAP` (`716:128`). **Runtime authority is `APP3-S09` as delivered, not these drawn numbers** (`APP6-X01` closure routing, `FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01` = `CLOSED_BY_AUTHORITY_ROUTING`): the delivered treatment rotates **−30°** and tiles a **5 × 7 percentage grid** of the overlay box, so a frontend checkpoint implementing a watermark takes its geometry from `APP3-S09` and treats the rotation and tile figures above as a historical visual measurement of the reproduction.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP6-OVERVIEW-FLOWMAP | Shared | APP6 phase overview | Flow Map & Surface Ownership | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 715:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=715-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-DRAFT-CATALOG-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Draft — Catalog Branch | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 682:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=682-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-DRAFT-COP-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Draft — Customer-Owned Product | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 684:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=684-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-VALIDATION-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Validation Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 684:144 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=684-144) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-LOADING-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 686:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=686-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-EMPTY-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Empty — No Quotation Yet | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 686:62 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=686-62) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-ERROR-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Load Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 686:104 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=686-104) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-SENT-READONLY-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Sent — Immutable Read-only | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 687:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=687-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-SEND-CONFIRM-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Send Confirmation Dialog | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 687:144 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=687-144) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-SEND-INPROGRESS-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Send In Progress | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 689:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=689-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-ACCEPTED-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Accepted Outcome | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 689:162 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=689-162) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-VERSION-HISTORY-DESKTOP | Admin | /requests/{requestId}/quotation | Quotation Workbench | Version History — Full Lifecycle | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 690:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=690-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A01-NARROW1280 | Admin | /requests/{requestId}/quotation | Quotation Workbench | Sent — Immutable Read-only | Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 690:92 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=690-92) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-DEFAULT-CATALOG-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Default — Catalog Branch (DIGITIZING) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 692:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=692-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-EVIDENCE-ABSENT-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Submitted Evidence Absent | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 694:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=694-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-COP-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Customer-Owned Product Branch | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 694:111 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=694-111) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-CREATE-VERSION-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Create DRAFT Version Form | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 695:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=695-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-SEND-REVIEW-CONFIRM-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Send For Review Confirmation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 695:138 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=695-138) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-REVIEW-ALREADY-ACTIVE-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | REVIEW_ALREADY_ACTIVE Reconciliation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 695:266 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=695-266) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-SENT-FOR-REVIEW-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Sent For Review — Awaiting Customer | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 696:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=696-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-REVISION-REQUESTED-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Revision Requested | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 696:113 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=696-113) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-APPROVED-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Approved — Immutable Snapshot | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 697:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=697-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-LOADING-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 698:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=698-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-ERROR-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Load Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 698:63 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=698-63) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-GATE-DESKTOP | Admin | /requests/{requestId}/design | Design-Case Workbench | Gate — Not Yet Digitizing | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 698:97 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=698-97) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-A02-NARROW1280 | Admin | /requests/{requestId}/design | Design-Case Workbench | Default — Catalog Branch (DIGITIZING) | Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 698:143 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=698-143) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-DEFAULT-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Sent — Acceptance Eligible | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 700:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=700-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-STEPUP-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Accept — Step-up Required | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 701:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=701-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-ACCEPT-INPROGRESS-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Accept In Progress | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 701:88 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=701-88) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-ACCEPTED-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Accepted Outcome | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 701:147 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=701-147) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-REJECTED-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Rejected Outcome | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 702:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=702-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-STALE-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Stale Version | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 702:65 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=702-65) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-EXPIRED-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Expired Quotation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 702:129 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=702-129) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-LOADING-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 703:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=703-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-ERROR-DESKTOP | Storefront | /truy-cap/bao-gia | Secure Quotation | Transient Network Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 703:36 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=703-36) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-DEFAULT-MOBILE | Storefront | /truy-cap/bao-gia | Secure Quotation | Sent — Acceptance Eligible | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 704:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=704-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S01-ACCEPTED-MOBILE | Storefront | /truy-cap/bao-gia | Secure Quotation | Accepted Outcome | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 705:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=705-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-DEFAULT-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Awaiting Approval | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 707:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=707-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-TERMS-REQUIRED-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Terms Not Accepted | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 709:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=709-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-APPROVE-INPROGRESS-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Approve In Progress | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 709:84 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=709-84) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-APPROVED-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Approved Outcome | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 709:164 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=709-164) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-STEPUP-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Approve — Step-up Required | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 710:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=710-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-REVISION-FORM-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Request Revision Form | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 710:109 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=710-109) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-VERSION-MISMATCH-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Version Mismatch | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 710:203 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=710-203) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-AGREEMENT-CONTENT-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Effective Agreement Content | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 711:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=711-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-LOADING-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 712:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=712-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-ERROR-DESKTOP | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Transient Network Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 712:31 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=712-31) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-DEFAULT-MOBILE | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Awaiting Approval | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 713:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=713-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-S02-APPROVED-MOBILE | Storefront | /truy-cap/duyet-thiet-ke | Secure Design Review | Approved Outcome | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 713:61 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=713-61) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-MATRIX-STATE | Shared | APP6 shared specification | State Coverage Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 716:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=716-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-MATRIX-RESPONSIVE | Shared | APP6 shared specification | Responsive Coverage Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 716:82 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=716-82) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-REUSE-MAP | Shared | APP6 shared specification | Reuse Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 716:128 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=716-128) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-MATRIX-SECURITY | Shared | APP6 shared specification | Security & Privacy Invariants | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 719:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=719-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-MATRIX-MONEY-POLICY | Shared | APP6 shared specification | Money & Policy Authority | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 719:57 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=719-57) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-FRAME-INDEX | Shared | APP6 shared specification | Frame Index & Coverage | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 720:52 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=720-52) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |
| FIG-APP6-HANDOFF-DEPENDENCY | Shared | APP6 handoff & dependency | Handoff & Backend Dependency | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_06 | 720:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=720-3) | APP6-D01 | — | FIG-APPROVAL-APP6-D01-PO-001 | 2026-08-20 |

### 4.13 APP7-D01 — Deposit Payment, Transfer Evidence & Order Reconciliation (NEW, this checkpoint)

Section **`728:3`** — [APP7-D01 · Deposit Payment, Transfer Evidence & Order Reconciliation](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=728-3), page **APP_07** (`726:3`).

One top-level Figma section holding **11 named sub-sections** (`00 — APP7 Overview / Journey` … `10 — Handoff / Backend Dependency Notes`) and **39 frames**, matching the single-section anchor convention of `APP1-D01`/`APP2-D01`/`APP3-D01`/`APP4-D01`/`APP5-D01`/`APP6-D01`.

**Pre-draw audit (mandatory).** Before any Figma write this registry was searched for every APP7-owned term — `APP7`, `APP_07`, `/orders`, `deposit`, `payment`, `evidence`, `bank transfer` — and **no row existed**; §4 ended at `4.12 APP6-D01` and §3 listed `APP_01`…`APP_06` write targets only. The live file was then read: the `APP_07` page **already existed** at `726:3` and had **zero children**. Per §2 rule 1 it was **reused, not re-created**, and no duplicate APP7 package exists. Outcome: **`NO_EXISTING_APP7_DESIGN`** — nothing was reused, supplemented, repaired or superseded, and no APP1–APP6 or BRD0 node was touched.

Every row below entered as `REVIEW_REQUIRED` with approval evidence `—`. `APP7-D01` does **not** self-approve (§2 rule 4, §9). **No APP7 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; a human reviewer must promote the rows their checkpoint consumes, with an approval-evidence id, following the `APP3-D01`…`APP6-D01` precedent.

**Product Owner approval — recorded by `APP7-A01`.** The Product Owner reviewed the **complete** `APP7-D01` package and passed it. All **39** rows below were promoted `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` under approval evidence **`FIG-APPROVAL-APP7-D01-PO-001`**, exactly as the `APP1-D01`…`APP6-D01` rows carry theirs. `A01_UI_IMPLEMENTATION_GATE = OPEN`.

The promotion is a **registry edit only**. No Figma node was opened for mutation, and no node id, deep link, page/section ownership, screen/state/viewport or visual content changed. `Last Verified` is deliberately **unchanged at `2026-08-23`**: it records when a row was last checked against the live file, which a human approving the design does not re-perform. No row outside `APP7-D01` was touched — the file's other `REVIEW_REQUIRED` rows are unaffected by this approval. The historical `APP7-D01` completion report keeps its `SELF_APPROVAL = NO` verdict, which remains true: the approval recorded here is external and human, not Claude self-approval.

**Contract-derived, not plan-derived.** Every frame was drawn against the generated OpenAPI contract of the eleven accepted APP7 operations, not against planning prose. Three contract facts changed the design and are recorded on `FIG-APP7-HANDOFF-DEPENDENCY-MAP` (`754:3`): `publicOrderDeposit_current` returns **no attempt state**, so the customer surface must reach attempt status through the idempotent `publicOrderDeposit_initiate` (`replayed`); `assetStatus` publishes **four** values (`UPLOADED` precedes `INSPECTING`), so `UPLOADED` is designed and rendered exactly like `INSPECTING`; and `previewEligible` is **Admin-only**, absent from the customer contract along with any customer binary route. `observedTransferReference` carries **no `maxLength` and no `pattern`** in the accepted B04 request schema, so no frame imposes uppercase, punctuation-stripping, a 15-character canonical form or an invented 2000-character bound — visual truncation in a table cell is permitted, the submitted value never is.

**Access states and STEP_UP reused, deliberately not duplicated.** The secure-link bootstrap, authorized shell, single indistinguishable "unavailable" state and transient network error remain `APP4-D01` authority (`629:3`, `629:20`, `629:37`, `629:53`, `629:70`, `629:87`); the step-up interaction remains `APP6-D01` authority (`701:3`, `710:3`); the Storefront and Admin shells remain `APP1-D02` (`405:2225`, `405:3786`) and `APP1-D01` (`385:10`). APP7 owns the payment content and states, not a second secure-link framework — the `APP5-D01`/`APP6-D01` ruling, applied unchanged. The mapping is tabulated on `FIG-APP7-REUSE-MAP` (`753:179`).

**Synthetic data only.** Every bank name, account number, account holder, amount, transfer reference and receipt mock in this package is synthetic and labelled `DỮ LIỆU MINH HOẠ / NON-PRODUCTION`. The QR frames render a deterministic non-scannable module grid — they are not valid EMVCo/NAPAS payloads and cannot transfer to any account. No production bank data, customer contact, secure token, admin account, real customer screenshot, production database id or object-storage URL appears anywhere in the package.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP7-OVERVIEW-JOURNEY | Shared | APP7 phase overview | Journey Flow Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 729:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=729-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-OVERVIEW-SURFACES | Shared | APP7 surface ownership | Surface & Route Ownership | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 729:103 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=729-103) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-QUEUE-DEFAULT-DESKTOP | Admin | /orders | Order Queue | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 732:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=732-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-QUEUE-FILTER-DESKTOP | Admin | /orders | Order Queue | Status Filter Open | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 732:110 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=732-110) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-DETAIL-AWAITING-DESKTOP | Admin | /orders/{orderId} | Order + Deposit Detail | AWAITING_DEPOSIT — Zero Evidence | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 734:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=734-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-DETAIL-EVIDENCE-DESKTOP | Admin | /orders/{orderId} | Order + Deposit Detail | Evidence Present | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 736:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=736-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-VERIFY-EMPTY-DESKTOP | Admin | /orders/{orderId} | Deposit Verification Form | Observed Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 737:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=737-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-VERIFY-FILLED-DESKTOP | Admin | /orders/{orderId} | Deposit Verification Form | Filled — Long Observed Reference | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 737:57 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=737-57) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-VERIFY-SUBMITTING-DESKTOP | Admin | /orders/{orderId} | Deposit Verification Form | Submitting | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 737:110 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=737-110) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-VERIFY-SUCCESS-DESKTOP | Admin | /orders/{orderId} | Deposit Verification Outcome | Success — DEPOSIT_PAID | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 740:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=740-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-VERIFY-MISMATCH-DESKTOP | Admin | /orders/{orderId} | Deposit Verification Outcome | Mismatch — REQUIRES_REVIEW | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 740:56 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=740-56) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-REVIEW-FORM-DESKTOP | Admin | /orders/{orderId} | Explicit Review Form | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 740:111 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=740-111) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-REVIEW-RESOLUTION-DESKTOP | Admin | /orders/{orderId} | REQUIRES_REVIEW Resolution | Pending Reconciliation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 741:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=741-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-NETWORK-AMBIGUITY | Admin | /orders/{orderId} | Mutation Network Ambiguity | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 741:51 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=741-51) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-STALE-CONFLICT | Admin | /orders/{orderId} | Concurrent & Stale Result | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 741:87 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=741-87) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-EVIDENCE-PREVIEW-ACCEPTED | Admin | /orders/{orderId} | Evidence Preview | ACCEPTED — Preview Enabled | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 742:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=742-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-EVIDENCE-PREVIEW-BLOCKED | Admin | /orders/{orderId} | Evidence Preview | INSPECTING / REJECTED — Blocked | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 743:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=743-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-A01-RECONCILIATION-HISTORY | Admin | /orders/{orderId} | Reconciliation History | Audit-safe Timeline | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 743:35 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=743-35) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-DEPOSIT-QR-DESKTOP | Storefront | /truy-cap/thanh-toan | Deposit Instructions & QR | Attempt PENDING | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 745:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=745-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-PREATTEMPT-DESKTOP | Storefront | /truy-cap/thanh-toan | Deposit Instructions & QR | Before Attempt Initiation | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 747:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=747-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-STEPUP-COMPOSITION | Storefront | /truy-cap/thanh-toan | STEP_UP Composition | Reuse Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 747:41 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=747-41) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-EMPTY-DESKTOP | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | Empty — Optional (0 of 5) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 748:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-UPLOADING-DESKTOP | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | Uploading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 748:29 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-29) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-INSPECTING-DESKTOP | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | INSPECTING | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 748:57 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-57) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-ACCEPTED-DESKTOP | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | ACCEPTED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 748:86 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-86) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-REJECTED-DESKTOP | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | REJECTED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 748:115 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-115) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-QUOTA-DESKTOP | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | Quota Reached (5 of 5) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 748:144 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-144) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-REQUIRES-REVIEW-DESKTOP | Storefront | /truy-cap/thanh-toan | Payment Status | REQUIRES_REVIEW — Customer-safe | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 749:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=749-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-TERMINAL-ATTEMPT-DESKTOP | Storefront | /truy-cap/thanh-toan | Payment Status | FAILED / EXPIRED — New Attempt | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 749:26 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=749-26) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-CONFIRMED-DESKTOP | Storefront | /truy-cap/thanh-toan | Order Confirmation | DEPOSIT Verified — DEPOSIT_PAID | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 749:50 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=749-50) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-DEPOSIT-QR-MOBILE | Storefront | /truy-cap/thanh-toan | Deposit Instructions & QR | Attempt PENDING | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 750:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=750-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-EVIDENCE-MOBILE | Storefront | /truy-cap/thanh-toan | Transfer Evidence Intake | Mixed Statuses | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 750:376 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=750-376) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-S01-CONFIRMED-MOBILE | Storefront | /truy-cap/thanh-toan | Order Confirmation | DEPOSIT Verified — DEPOSIT_PAID | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 750:415 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=750-415) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-MATRIX-STATE-COPY | Shared | APP7 state vocabulary | Payment State & Copy Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 751:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=751-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-MATRIX-TRUTH | Shared | APP7 payment truth | Product Truth Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 751:175 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=751-175) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-RESPONSIVE-SPEC | Shared | APP7 responsive behaviour | Responsive Coverage & Behaviour | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 753:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=753-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-ACCESSIBILITY-SPEC | Shared | APP7 accessibility | Accessibility Specification | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 753:120 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=753-120) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-REUSE-MAP | Shared | APP7 reuse | Reuse Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 753:179 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=753-179) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |
| FIG-APP7-HANDOFF-DEPENDENCY-MAP | Shared | APP7 handoff | Backend Dependency Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_07 | 754:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=754-3) | APP7-D01 | — | FIG-APPROVAL-APP7-D01-PO-001 | 2026-08-23 |

### 4.14 APP8-D01 — Inventory Reservation & Production Operations (NEW, this checkpoint)

Section **`771:3`** — [APP8-D01 · Inventory Reservation & Production Operations](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=771-3), page **APP_08** (`766:3`).

One top-level Figma section holding **9 named sub-sections** (`00 — APP8 Overview / Journey` … `08 — Admin · Narrow 1280`) and **41 frames**, matching the single-section anchor convention of `APP1-D01` … `APP7-D01`.

**Pre-draw audit (mandatory).** Before any Figma write this registry was searched for every APP8-owned term — `APP8`, `APP_08`, `inventory`, `stock`, `reservation`, `production`, `/kho`, `/san-xuat` — and **no row existed**; §4 ended at `4.13 APP7-D01` and §3 listed `APP_01`…`APP_07` write targets only. The live file was then read: the `APP_08` page **already existed** at `766:3` and had **zero children**. Per §2 rule 1 it was **reused, not re-created**, and no duplicate APP8 page or package exists. Outcome: **`NO_EXISTING_APP8_DESIGN`** — nothing was reused, supplemented, repaired or superseded, and no APP1–APP7 or BRD0 node was touched.

Every row below entered as `REVIEW_REQUIRED` with approval evidence `—`. `APP8-D01` does **not** self-approve (§2 rule 4, §9). **No APP8 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; a human reviewer must promote the rows their checkpoint consumes, with an approval-evidence id, following the `APP3-D01`…`APP7-D01` precedent.

**Product Owner approval — recorded by `APP8-A01`.** The Product Owner reviewed the **complete** `APP8-D01` package and passed it. All **41** rows below were promoted `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` under approval evidence **`FIG-APPROVAL-APP8-D01-PO-001`**, exactly as the `APP1-D01`…`APP7-D01` rows carry theirs. `A01_UI_IMPLEMENTATION_GATE = OPEN`.

The promotion is a **registry edit only**. No Figma node was opened for mutation, and no node id, deep link, page/section ownership, screen/state/viewport or visual content changed. `Last Verified` is deliberately **unchanged at `2026-08-25`**: it records when a row was last checked against the live file, which a human approving the design does not re-perform. No row outside `APP8-D01` was touched — the file's other `REVIEW_REQUIRED` rows are unaffected by this approval. The historical `APP8-D01` completion report keeps its no-self-approval verdict, which remains true: the approval recorded here is external and human, not Claude self-approval.

The whole package was promoted rather than only the eight rows `APP8-A01` consumes, because the approval the Product Owner granted was for the whole package; `APP8-A02` and `APP8-A03` therefore start against approved rows without a second promotion, and `APP8-D01-C1` remains unused.

**Contract-derived, not brief-derived.** Every frame was drawn against the accepted `APP8-B01`/`APP8-B03`/`APP8-B04` DTOs, not planning prose. Four contract facts changed the design and are recorded on `FIG-APP8-HANDOFF-DEPENDENCY-MAP` (`788:179`): the production **queue publishes no `orderCode` and no specification**, so the work list is keyed on `jobId`/`orderId`/`approvalSnapshotId` and no frame invents a concise frozen-spec column; `lowStockThreshold` is **read-only** — B01 publishes no threshold-authoring operation, so no frame offers one; the stock ledger has **no pagination contract**, so the truncation state carries a bounded-page banner and deliberately no “load more”; and **no retryable-concurrency error code exists** — B04 resolves contention by row lock, so the loser waits and receives an ordinary `409`, which is why `FIG-APP8-STALE-CONFLICT-SPEC` (`787:149`) designs “state changed — reload” and forbids an automatic-retry flow for a code the contract does not have.

**Product truth carried in the design.** `FIG-APP8-MATRIX-RESERVATION-TRUTH` (`788:3`) fixes Catalog / COP / mixed rendering: a COP-only order shows the absence of reservation as an ordinary valid state (neutral surface, no warning colour, no “missing” wording), a mixed order shows only its real Catalog reservations and never a fabricated COP row, and `reservationSummary.required` is labelled display context, never a client-side eligibility gate. Start communicates that reserved Catalog stock is consumed and that the server may refuse; complete stops at `PRODUCTION_COMPLETED` with no remaining-payment, shipping or settlement action anywhere in the package; and job cancellation is separated from order cancellation/refund in copy on every cancel surface — `PLANNED` may release a still-active reservation, `STARTED` explicitly does not restore consumed stock.

**Shells reused, deliberately not duplicated.** The Admin topbar and sidenav remain `APP1-D01` authority (`385:10`); the queue table, cursor pagination control, status pill, confirmation dialog, input/error field and skeleton/empty/error patterns remain `APP7-D01` authority (`732:3`, `732:31`, `737:3`, `737:57`, `740:111`, `741:87`). APP8 adds exactly **two** sidenav entries (`Kho`, `Sản xuất`) and redesigns no part of the shell. The mapping is tabulated on `FIG-APP8-REUSE-MAP` (`788:136`).

**Scope exclusions are recorded, not merely absent.** `FIG-APP8-SCOPE-BOUNDARY` (`788:52`) names fifteen capabilities APP8 deliberately does not carry — remaining payment, shipping, order cancellation/refund, operator and machine assignment, priority/SLA, attempts and claims, artifact management, low-stock-threshold authoring, absolute stock overwrite, manual reservation actions, ledger pagination, an all-SKU stock list, production-note mutation, any customer surface, and rework-job creation — each with the reason the backend does not support it.

**Synthetic data only.** Every SKU code, order code, job id, approval id, hash, quantity, reason and timestamp in this package is synthetic. No production data, customer contact, secure token, admin account, real database id or object-storage URL appears anywhere. The package contains no customer-facing surface and no APP9 surface.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP8-OVERVIEW-JOURNEY | Shared | APP8 phase overview | Journey Flow Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 772:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=772-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-OVERVIEW-SURFACES | Shared | APP8 surface ownership | Surface & Route Ownership | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 773:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=773-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-STOCK-DEFAULT-DESKTOP | Admin | /kho/skus/{skuId} | SKU Stock | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 775:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=775-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-STOCK-LOWSTOCK-DESKTOP | Admin | /kho/skus/{skuId} | SKU Stock | Low Stock — Negative Available | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 775:101 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=775-101) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-STOCK-NEWANCHOR-DESKTOP | Admin | /kho/skus/{skuId} | SKU Stock | Never Counted — New Anchor | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 776:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=776-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-STOCK-LOADING-DESKTOP | Admin | /kho/skus/{skuId} | SKU Stock | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 776:54 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=776-54) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-STOCK-ERROR-DESKTOP | Admin | /kho/skus/{skuId} | SKU Stock | Error & Refusal | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 776:142 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=776-142) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-ADJUST-DEFAULT | Admin | /kho/skus/{skuId} | Stock Adjustment Dialog | Default | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 777:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=777-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-ADJUST-VALIDATION | Admin | /kho/skus/{skuId} | Stock Adjustment Dialog | Validation Error (400) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 777:33 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=777-33) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-ADJUST-SUBMITTING | Admin | /kho/skus/{skuId} | Stock Adjustment Dialog | Submitting | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 777:60 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=777-60) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-ADJUST-SUCCESS | Admin | /kho/skus/{skuId} | Stock Adjustment Dialog | Success | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 777:83 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=777-83) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-ADJUST-NEGATIVE-REFUSAL | Admin | /kho/skus/{skuId} | Stock Adjustment Dialog | Negative-stock Refusal (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 777:99 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=777-99) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-LEDGER-TRUNCATED | Admin | /kho/skus/{skuId} | Stock Ledger | Truncated Page | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 777:125 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=777-125) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-DEFAULT-DESKTOP | Admin | /san-xuat | Production Queue | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 780:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=780-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-FILTER-DESKTOP | Admin | /san-xuat | Production Queue | Status Filter Open | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 780:105 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=780-105) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-EMPTY-DESKTOP | Admin | /san-xuat | Production Queue | Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 782:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=782-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-FILTERED-EMPTY-DESKTOP | Admin | /san-xuat | Production Queue | Filtered Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 782:44 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=782-44) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-LOADING-DESKTOP | Admin | /san-xuat | Production Queue | Loading | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 782:89 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=782-89) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-ERROR-DESKTOP | Admin | /san-xuat | Production Queue | Error | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 782:206 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=782-206) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-DETAIL-PLANNED-CATALOG-DESKTOP | Admin | /san-xuat/{jobId} | Production Job Detail | PLANNED — Catalog | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 784:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=784-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-DETAIL-STARTED-MIXED-DESKTOP | Admin | /san-xuat/{jobId} | Production Job Detail | STARTED — Mixed Order | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 784:129 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=784-129) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-DETAIL-COMPLETED-DESKTOP | Admin | /san-xuat/{jobId} | Production Job Detail | COMPLETED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 785:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=785-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-DETAIL-CANCELLED-DESKTOP | Admin | /san-xuat/{jobId} | Production Job Detail | CANCELLED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 785:134 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=785-134) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-DETAIL-COP-DESKTOP | Admin | /san-xuat/{jobId} | Production Job Detail | PLANNED — COP-only, No Reservation Required | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 785:270 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=785-270) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-START-CONFIRM | Admin | /san-xuat/{jobId} | Production Transition Dialog | Start Production — Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 786:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=786-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-COMPLETE-CONFIRM | Admin | /san-xuat/{jobId} | Production Transition Dialog | Complete Production — Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 786:39 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=786-39) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-CANCEL-FROM-PLANNED | Admin | /san-xuat/{jobId} | Production Transition Dialog | Cancel Job — from PLANNED | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 786:70 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=786-70) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-CANCEL-FROM-STARTED | Admin | /san-xuat/{jobId} | Production Transition Dialog | Cancel Job — from STARTED | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 786:110 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=786-110) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-CANCEL-REASON-MISSING | Admin | /san-xuat/{jobId} | Production Transition Dialog | Cancel Job — Reason Missing (400) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 786:150 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=786-150) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-TRANSITION-SUBMITTING | Admin | /san-xuat/{jobId} | Production Transition Dialog | Submitting | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 786:177 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=786-177) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-REFUSAL-PRODUCTION | Shared | APP8 production refusals | Production Refusal Catalog | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 787:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=787-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-REFUSAL-INVENTORY | Shared | APP8 inventory refusals | Inventory Refusal Catalog | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 787:94 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=787-94) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-STALE-CONFLICT-SPEC | Shared | APP8 stale and concurrent action | Stale / Conflict Interaction Spec | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 787:149 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=787-149) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-MATRIX-RESERVATION-TRUTH | Shared | APP8 reservation truth | Catalog / COP / Mixed Truth Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 788:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=788-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-SCOPE-BOUNDARY | Shared | APP8 scope boundary | Scope Boundary Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 788:52 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=788-52) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-REUSE-MAP | Shared | APP8 reuse | Reuse Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 788:136 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=788-136) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-HANDOFF-DEPENDENCY-MAP | Shared | APP8 handoff | Backend Dependency Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 788:179 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=788-179) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A01-STOCK-NARROW | Admin | /kho/skus/{skuId} | SKU Stock | Default | Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 789:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=789-3) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A02-QUEUE-NARROW | Admin | /san-xuat | Production Queue | Default | Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 789:85 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=789-85) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-A03-DETAIL-NARROW | Admin | /san-xuat/{jobId} | Production Job Detail | PLANNED — Catalog | Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 789:160 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=789-160) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |
| FIG-APP8-RESPONSIVE-SPEC | Shared | APP8 responsive behaviour | Responsive Coverage & Behaviour | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_08 | 789:267 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=789-267) | APP8-D01 | — | FIG-APPROVAL-APP8-D01-PO-001 | 2026-08-25 |


### 4.15 APP9-D01 — Remaining Payment, Fulfillment & Completion (NEW, this checkpoint)

Section **`807:3`** — [APP9-D01 · Remaining Payment, Fulfillment & Completion](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=807-3), page **APP_09** (`766:2`).

**Pre-draw audit (mandatory).** Before any Figma write this registry was searched for every APP9-owned term — `APP9`, `APP_09`, `final-payment`, `shipping`, `dispatch`, `fulfillment` — and **no registry row existed**; §4 ended at `4.14 APP8-D01` and §3 listed `APP_01`…`APP_08` write targets only. The live file was then read: the `APP_09` page **already existed** at `766:2` and had **zero children**. Per §2 rule 1 it was **reused, not re-created**, and no duplicate APP9 page or package exists. Outcome: **`NO_EXISTING_APP9_DESIGN`** — nothing was reused, supplemented, repaired or superseded, and no APP1–APP8 or BRD0 node was touched.

Every row below entered as `REVIEW_REQUIRED` with approval evidence `—`. `APP9-D01` does **not** self-approve (§2 rule 4, §9). **No APP9 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; a human reviewer must promote the rows their checkpoint consumes, with an approval-evidence id, following the `APP3-D01`…`APP8-D01` precedent.

**Product Owner approval — recorded by `APP9-A01`.** The Product Owner reviewed the **complete** `APP9-D01` package and passed it (`APP9-D01 = PASS`, `APP9-D01-C1 = UNUSED`). All **36** rows below were promoted `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` under approval evidence **`FIG-APPROVAL-APP9-D01-PO-001`**, exactly as the `APP1-D01`…`APP8-D01` rows carry theirs. `A01_UI_IMPLEMENTATION_GATE = OPEN`.

The promotion is a **registry edit only**. No Figma node was opened for mutation, and no node id, deep link, page/section ownership, screen/state/viewport or visual content changed. `Last Verified` is deliberately **unchanged at `2026-08-27`**: it records when a row was last checked against the live file, which a human approving the design does not re-perform. No row outside `APP9-D01` was touched — the file's other `REVIEW_REQUIRED` rows are unaffected by this approval. The historical `APP9-D01` completion report keeps its no-self-approval verdict, which remains true: the approval recorded here is external and human, not Claude self-approval.

The whole package was promoted rather than only the eighteen Admin rows `APP9-A01` consumes, because the approval the Product Owner granted was for the whole package; `APP9-S01` therefore starts against approved rows without a second promotion, and `APP9-D01-C1` remains unused.

**Truth carried in the design.** The package is drawn against capability delivered through `APP9-B05` only, on the `100` path / `108` operation / `222` schema baseline, and annotates exactly ten delivered operation ids. Three limits are drawn rather than hidden: (1) no Admin read projects the REMAINING obligation, its attempts or its reconciliations (`FU-APP9-B03-02`), so `FIG-APP9-A01-DETAIL-AWAITINGFINAL-DESKTOP` marks that region as a named API gap and forbids deriving the balance as "total − deposit", which a fee increase would falsify; (2) `PaymentDecisionResponse.depositObligationId` / `.depositStatus` carry the REMAINING obligation under deposit-flavoured names on a balance verification (`FU-APP9-B03-01`), so both are recorded as transport names that must never reach the screen; (3) no customer projection returns a server-authoritative proposed shipping fee, so the customer fee-acknowledgement UI is deferred — see `FIG-APP9-FEE-ACK-DISPOSITION`.

**Route discipline.** `NEW_ADMIN_ROUTES = 0` — only `/orders` and `/orders/{orderId}` are extended, and APP9 adds zero sidenav entries. `NEW_STOREFRONT_ROUTES = 1` — one coherent secure final-payment/completion surface; `APP9-S02` does not exist.

**Customer exclusions are drawn, not merely absent.** No carrier name, tracking code, track-package button, shipment timeline, map, ETA or courier status appears on any customer frame; no cancellation, refund, returns, notification centre or communication-preference UI appears anywhere (`PO-APP9-001 = OPTION A — DEFER`).

**Synthetic data only.** Every order code, bank account, transfer reference, amount, recipient, address, phone number, carrier name, tracking code and timestamp in this package is synthetic. No production data, customer contact, secure token, admin account, real database id or object-storage URL appears anywhere.

**Layout verified in absolute space.** Sections were packed in section-relative coordinates and then audited with an independent `absoluteBoundingBox` pass: 14 sections, 36 frames, **0** frames escaping their section, **0** section-to-section overlaps, **0** frame-to-frame overlaps, and a rendered root size (`6220 × 13982`) that matches the root box exactly. **0** component masters, **0** instances, **0** new variables, text styles, paint styles or effect styles — every frame composes the existing `Primitive`/`Semantic`/`Foundation` variables and the Inter family.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP9-OVERVIEW-JOURNEY | Shared | APP9 phase overview | Journey & Lifecycle Flow Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 807:5 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=807-5) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-ORDERS-FULFILLMENT-DESKTOP | Admin | /orders | Order Queue | Fulfillment States | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 808:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=808-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-ORDERS-FILTEROPEN-DESKTOP | Admin | /orders | Order Queue | Status Filter Open — Fulfillment States | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 808:100 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=808-100) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DETAIL-PRODCOMPLETED-DESKTOP | Admin | /orders/{orderId} | Order Detail | PRODUCTION_COMPLETED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 809:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=809-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-OPENFINAL-CONFIRM | Admin | /orders/{orderId} | Open Final Payment Dialog | Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 809:95 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=809-95) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-OPENFINAL-REFUSED | Admin | /orders/{orderId} | Open Final Payment Dialog | Refused (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 809:115 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=809-115) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DETAIL-AWAITINGFINAL-DESKTOP | Admin | /orders/{orderId} | Order Detail | AWAITING_FINAL_PAYMENT | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 811:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=811-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-VERIFY-CONFIRM | Admin | /orders/{orderId} | Remaining Payment Verification Dialog | Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 811:91 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=811-91) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-VERIFY-REFUSED | Admin | /orders/{orderId} | Remaining Payment Verification Dialog | Refused (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 811:108 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=811-108) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-SHIPPING-EDITABLE-DESKTOP | Admin | /orders/{orderId} | Shipping Detail Editor | EDITABLE | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 812:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=812-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-SHIPPING-FEEREFUSAL-DESKTOP | Admin | /orders/{orderId} | Shipping Detail Editor | Fee Increase Without Customer Acknowledgement (409) | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 812:109 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=812-109) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DISPATCH-CONFIRM | Admin | /orders/{orderId} | Dispatch Dialog | Confirm & Freeze | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 814:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=814-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DISPATCH-PAYMENTGUARD | Admin | /orders/{orderId} | Dispatch Dialog | Refused by Remaining-Payment Guard (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 814:36 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=814-36) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DISPATCH-REPLAY | Admin | /orders/{orderId} | Dispatch Dialog | Invalid or Replay (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 814:56 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=814-56) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DETAIL-DELIVERED-DESKTOP | Admin | /orders/{orderId} | Order Detail | DELIVERED — Frozen Shipping | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 815:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=815-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-COMPLETE-CONFIRM | Admin | /orders/{orderId} | Completion Dialog | Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 815:89 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=815-89) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-COMPLETE-REFUSED | Admin | /orders/{orderId} | Completion Dialog | Refused (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 815:106 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=815-106) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-A01-DETAIL-COMPLETED-DESKTOP | Admin | /orders/{orderId} | Order Detail | COMPLETED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 815:124 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=815-124) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-FINALPAY-PAYABLE-DESKTOP | Storefront | final payment (secure link) | Final Payment | Payable — Instructions & QR | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 816:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=816-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-FINALPAY-PREATTEMPT-DESKTOP | Storefront | final payment (secure link) | Final Payment | Payable — Before Attempt | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 816:231 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=816-231) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-EVIDENCE-EMPTY-DESKTOP | Storefront | final payment (secure link) | Transfer Evidence | Not Sent | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 817:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=817-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-EVIDENCE-PRESENT-DESKTOP | Storefront | final payment (secure link) | Transfer Evidence | Sent | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 817:31 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=817-31) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-STATUS-NOTPAYABLE-DESKTOP | Storefront | final payment (secure link) | Order Status | Not Yet Payable | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 818:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=818-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-STATUS-PAID-DESKTOP | Storefront | final payment (secure link) | Order Status | Paid — Preparing Delivery | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 818:37 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=818-37) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-STATUS-DELIVERED-DESKTOP | Storefront | final payment (secure link) | Order Status | DELIVERED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 818:87 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=818-87) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-STATUS-COMPLETED-DESKTOP | Storefront | final payment (secure link) | Order Status | COMPLETED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 818:137 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=818-137) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-FINALPAY-PAYABLE-MOBILE | Storefront | final payment (secure link) | Final Payment | Payable — Instructions & QR | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 819:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=819-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-STATUS-DELIVERED-MOBILE | Storefront | final payment (secure link) | Order Status | DELIVERED | Mobile 390 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 819:200 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=819-200) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-LINK-UNAVAILABLE-DESKTOP | Storefront | final payment (secure link) | Secure Link | Unavailable or Expired | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 819:221 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=819-221) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-S01-ERROR-CATALOG | Storefront | APP9 storefront refusals | Error State Catalog | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 819:237 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=819-237) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-LIFECYCLE-MAPPING | Shared | APP9 lifecycle mapping | Lifecycle & Label Mapping | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 820:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=820-4) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-ADMIN-REFUSAL-CATALOG | Admin | APP9 admin refusals | Admin Refusal Catalog | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 820:47 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=820-47) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-FEE-ACK-DISPOSITION | Shared | shipping-fee acknowledgement | Customer Fee Acknowledgement Disposition | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 820:106 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=820-106) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-BACKEND-OPERATION-MAP | Shared | APP9 handoff | Backend Operation & Handoff Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 821:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=821-3) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-SCOPE-BOUNDARY | Shared | APP9 scope boundary | Scope Boundary | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 821:87 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=821-87) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |
| FIG-APP9-REUSE-MAP | Shared | APP9 reuse | Design Reuse Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_09 | 821:130 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=821-130) | APP9-D01 | — | FIG-APPROVAL-APP9-D01-PO-001 | 2026-08-27 |

### 4.16 APP10-D01 — Customer Operations & Communication (NEW, this checkpoint)

Section **`828:3`** — [APP10-D01 · Customer Operations & Communication](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=828-3), page **APP_10** (`825:3`).

**Pre-draw audit (mandatory).** Before any Figma write this registry was searched
for every APP10-owned term — `APP10`, `APP_10`, `merge`, `gộp`, `zalo`,
`messenger`, `customer-merges`, `profile maintenance` — and **no registry row
existed**; §4 ended at `4.15 APP9-D01` and §3 listed `APP_01`…`APP_09` write
targets only. The live file was then read: the `APP_10` page **already existed**
at `825:3` and had **zero children**. Per §2 rule 1 it was **reused, not
re-created**, and no duplicate APP10 page or package exists. Outcome:
**`NO_EXISTING_APP10_DESIGN`** — nothing was reused, supplemented, repaired or
superseded, and **no APP1–APP9 or BRD0 node was created, modified, moved,
renamed, restyled or deleted**.

**`/support/customer-access` is extended, not replaced.** The 18 approved
`APP4-D01` frames (lookup, loading, load error, not found, customer & contact
overview, the secure-grant set and the whole notification-delivery/replay set)
remain the authority for everything they already cover, and APP10 keeps them
unchanged. `APP10-A01` adds only the maintenance affordances the `APP10-B01`
contract actually publishes — display name, internal notes, promote-primary and
deactivate-contact — inside the existing left-hand customer card. `APP10-A02`
lives at `/support/customer-access/merge` and `…/merge/{caseId}`, i.e. as
sub-routes of the existing `Hỗ trợ truy cập khách hàng` nav entry, so **APP10
adds 0 sidenav entries** and the approved Admin shell (`APP1-D01` `385:10`) is
used as-is. `APP10-I01` extends the `Kết nối` column of the approved Storefront
footer (`APP1-D02` `405:2253` / mobile `409:2359`).

**Design-system cost: zero.** 0 component masters, 0 instances, 0 new variables,
text styles, paint styles or effect styles. Every frame composes the existing
`Primitive` / `Semantic` / `Foundation` collections and the Inter family
(Regular / Medium / Semi Bold / Bold), reusing the APP4 screen chrome
(1440 × 900, 240 sidebar, 64 topbar, spec strip) and the APP9-D01 dialog
grammar (context strip, white dialog, bordered effect/error/why blocks, spacer
action row). The DS library file was **not** touched. No Zalo or Messenger brand
asset was added: the design system carries no licensed provider artwork, so the
CTAs are type plus an `↗` external-link glyph and an explicit
"Mở ứng dụng bên ngoài" caption.

**Contract fidelity.** Every frame is implementable against the seven delivered
HTTP operations (`APP10-B01` ×3, `APP10-B02` ×3, `APP10-B03` ×1) plus the
already-approved `APP4-B07` exact-contact resolver. The package deliberately
draws **no** customer list or search, **no** contact creation, **no** verification
mutation, **no** unmerge, **no** merge-event timeline, and **no** historical
rejection-reason display — the last two are recorded in
`FIG-APP10-CONTRACT-FIDELITY` (`845:3`) as known contract limits rather than
designed away. Post-execution consequence counts are explicitly **not** presented
as "what was moved": `FIG-APP10-A02-PREVIEW-SEMANTICS` (`841:84`) fixes that rule
and `FIG-APP10-A02-CASE-EXECUTED-DESKTOP` (`837:3`) states in-place why the
completed screen shows no figures.

Every row below entered as `REVIEW_REQUIRED` with approval evidence `—`.
`APP10-D01` does **not** self-approve (§2 rule 4). The Product Owner reviewed the
package in Figma and **PASSED** it; at `APP10-A01` all 41 rows were promoted to
`APPROVED_FOR_IMPLEMENTATION` under approval evidence
`FIG-APPROVAL-APP10-D01-PO-001`, following the `APP3-D01`…`APP9-D01` precedent.
That promotion changed registry status only; no Figma node was created,
modified, moved, renamed or deleted.

41 rows: **36 Admin · 4 Storefront · 2 Shared** (the Admin count includes the two
Admin-scoped specification frames).

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP10-OVERVIEW-JOURNEY | Shared | APP10 phase overview | Package & Journey Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 828:4 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=828-4) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-MAINT-DESKTOP-DEFAULT | Admin | /support/customer-access | Customer Profile Maintenance | Loaded | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 829:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=829-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-MAINT-NARROW-1280 | Admin | /support/customer-access | Customer Profile Maintenance | Loaded | Admin Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 834:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=834-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROFILE-EDITING | Admin | /support/customer-access | Profile Edit Panel | Editing | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 831:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=831-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROFILE-SAVED | Admin | /support/customer-access | Profile Edit Panel | Saved | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 831:28 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=831-28) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROFILE-VALIDATION | Admin | /support/customer-access | Profile Edit Panel | Validation Error (400) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 831:42 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=831-42) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROFILE-MERGED-REFUSED | Admin | /support/customer-access | Profile Edit Panel | Refused — Customer Merged (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 831:62 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=831-62) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PENDING-STATES | Admin | /support/customer-access | Maintenance Pending States | Submitting | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 831:80 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=831-80) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROMOTE-CONFIRM | Admin | /support/customer-access | Promote Primary Contact Dialog | Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 832:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=832-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROMOTE-SUCCESS | Admin | /support/customer-access | Promote Primary Contact Dialog | Success | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 832:26 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=832-26) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-PROMOTE-REFUSED | Admin | /support/customer-access | Promote Primary Contact Dialog | Refused (404 / 409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 832:46 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=832-46) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-DEACTIVATE-CONFIRM | Admin | /support/customer-access | Deactivate Contact Dialog | Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 832:67 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=832-67) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-DEACTIVATE-SUCCESS | Admin | /support/customer-access | Deactivate Contact Dialog | Success | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 832:90 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=832-90) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-DEACTIVATE-PRIMARY-REFUSED | Admin | /support/customer-access | Deactivate Contact Dialog | Refused — Primary Contact (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 833:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=833-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-DEACTIVATE-LASTVERIFIED-REFUSED | Admin | /support/customer-access | Deactivate Contact Dialog | Refused — Last Verified Contact (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 833:21 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=833-21) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-STALE-AND-FAILURE | Admin | /support/customer-access | Maintenance Failure States | Stale / Generic Failure | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 833:39 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=833-39) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A01-CONTACT-ELIGIBILITY | Admin | /support/customer-access | Contact Action Eligibility Matrix | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 833:60 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=833-60) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-SELECT-EMPTY-DESKTOP | Admin | /support/customer-access/merge | Merge Participant Selection | Both Slots Empty | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 835:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=835-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-SELECT-FILLED-DESKTOP | Admin | /support/customer-access/merge | Merge Participant Selection | Both Resolved — Ready to Open | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 835:82 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=835-82) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-SELECT-SAMECUSTOMER | Admin | /support/customer-access/merge | Merge Participant Selection | Refused — Same Customer (400) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 840:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=840-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-OPEN-CONFLICTS | Admin | /support/customer-access/merge | Open Merge Case | Refused (404 / 409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 840:19 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=840-19) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-CASE-REQUESTED-DESKTOP | Admin | /support/customer-access/merge/{caseId} | Merge Case Workspace | REQUESTED — Comparison & Consequence Preview | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 836:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=836-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-CASE-NARROW-1280 | Admin | /support/customer-access/merge/{caseId} | Merge Case Workspace | REQUESTED — Comparison & Consequence Preview | Admin Narrow 1280 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 838:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=838-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-CASE-PROFILECONFLICT-DESKTOP | Admin | /support/customer-access/merge/{caseId} | Merge Case Workspace | Blocked — Business Profile Conflict | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 836:123 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=836-123) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-CASE-EXECUTED-DESKTOP | Admin | /support/customer-access/merge/{caseId} | Merge Case Workspace | EXECUTED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 837:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=837-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-CASE-REJECTED-DESKTOP | Admin | /support/customer-access/merge/{caseId} | Merge Case Workspace | REJECTED | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 837:95 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=837-95) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-EXECUTE-CONFIRM | Admin | /support/customer-access/merge/{caseId} | Execute Merge Dialog | Confirm | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 840:40 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=840-40) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-EXECUTE-PENDING | Admin | /support/customer-access/merge/{caseId} | Execute Merge Dialog | Executing | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 840:74 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=840-74) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-EXECUTE-ALREADYEXECUTED | Admin | /support/customer-access/merge/{caseId} | Execute Merge Dialog | Already Executed — Safe Completion | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 840:93 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=840-93) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-EXECUTE-PROFILECONFLICT | Admin | /support/customer-access/merge/{caseId} | Execute Merge Dialog | Refused — Business Profile Conflict (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 840:110 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=840-110) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-EXECUTE-PARTICIPANT-REFUSED | Admin | /support/customer-access/merge/{caseId} | Execute Merge Dialog | Refused — Participant Invalid (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 841:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=841-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-EXECUTE-FAILURE | Admin | /support/customer-access/merge/{caseId} | Execute Merge Dialog | Sanitized Generic Failure | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 841:24 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=841-24) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-REJECT-CONFIRM | Admin | /support/customer-access/merge/{caseId} | Reject Merge Case Dialog | Confirm — Reason Required | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 841:45 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=841-45) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-REJECT-CONFLICT | Admin | /support/customer-access/merge/{caseId} | Reject Merge Case Dialog | Refused — Invalid Transition (409) | Desktop | high-fidelity | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 841:66 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=841-66) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-A02-PREVIEW-SEMANTICS | Admin | APP10 merge consequence preview | Consequence Preview Semantics | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 841:84 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=841-84) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-I01-FOOTER-DESKTOP | Storefront | shared storefront shell | Contact Handoff Footer | Zalo & Messenger CTAs | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 842:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=842-3) | APP10-D01 | — | — | 2026-08-29 |
| FIG-APP10-I01-FOOTER-MOBILE | Storefront | shared storefront shell | Contact Handoff Footer | Zalo & Messenger CTAs | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 842:48 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=842-48) | APP10-D01 | — | — | 2026-08-29 |
| FIG-APP10-I01-CTA-STATES | Storefront | shared storefront shell | Contact Handoff CTA | Interaction & Missing Configuration | Desktop | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 843:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=843-3) | APP10-D01 | — | — | 2026-08-29 |
| FIG-APP10-I01-HANDOFF-SPEC | Storefront | APP10 external handoff | External Handoff Specification | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 843:44 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=843-44) | APP10-D01 | — | — | 2026-08-29 |
| FIG-APP10-ADMIN-REFUSAL-CATALOG | Admin | APP10 admin refusals | Admin Refusal Catalog | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 844:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=844-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |
| FIG-APP10-CONTRACT-FIDELITY | Shared | APP10 contract fidelity | Backend Contract & Design Boundary Map | Specification | Desktop | annotation | APPROVED_FOR_IMPLEMENTATION | BQwqV8GdfUIELvsQDB1UQE | APP_10 | 845:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=845-3) | APP10-D01 | — | FIG-APPROVAL-APP10-D01-PO-001 | 2026-08-29 |

> **`APP10-E01` — the four `FIG-APP10-I01-*` rows are demoted to `REVIEW_REQUIRED`.**
> All four draw the Zalo/Messenger CTAs as flat rectangles inside the Storefront
> footer, and `APP10-I01` built exactly that. PO review of the running Storefront
> at `APP10-E01` rejected the placement — a customer had to scroll the whole page
> before the contact affordance existed — and directed a floating circular dock
> fixed at the bottom-right, with the footer returned to its pre-I01 composition.
> The delivered code is now the dock, so these frames no longer describe what
> ships and may not authorize any further work: the rows keep their nodes and
> links as the historical record, lose their approval evidence, and are blocked
> for implementation until redrawn and re-approved (`FU-APP10-E01-01`). The
> redraw could not happen in this checkpoint because the `figma-desktop` MCP
> server was unreachable (`ConnectionRefused`) for its whole duration.
>
> Nothing else in §4.16 is affected: the handoff *contract* the frames specify —
> configured absolute URLs used verbatim, external navigation only, no provider
> SDK, malformed or missing configuration omitting the channel — is unchanged and
> is what `843:44` records. Only the placement moved.


### 4.17 APP11-D01 — Gallery, Content, SEO & Store Presentation (NEW, this checkpoint)

Section root **`853:2`** — page **APP_11**, created empty by the operator and
**reused, not re-created** (§2 rule 1). Eight sections hold the package:
`857:3` Authority Map · `857:4` Homepage Reconciliation · `857:5` Gallery Detail
Supplement · `857:6` Content Page Template · `857:7` Admin Gallery List ·
`857:8` Admin Gallery Editor · `857:9` Footer & Floating Handoff Reconciliation ·
`857:10` Responsive / States / Handoff Notes.

**Pre-draw audit (mandatory).** This registry was searched for every APP11-owned
term — `APP11`, `APP_11`, `gallery`, `bo-suu-tap`, `bộ sưu tập`, `collections`,
`content page`, `dich-vu`, `cua-hang`, `chinh-sach` — and **no registry row
existed**; §4 ended at `4.16 APP10-D01`. The live file was then read at
`APP11-G01-C1`: **`UI05 – Collections Experience` (`328:1739`) already covered the
gallery feed** at three breakpoints with interaction, loading, empty and error
states, carrying the H1 `Bộ sưu tập`. Per §4.3.1 — the `APP2-D01` regression where
"an already-covered capability was redesigned from scratch because its existing
registry title did not literally read 'Product List'" — the feed was **registered,
never redrawn**.

**What this package did, by class.** `REGISTER_EXISTING` — the five UI05 feed nodes
below keep their original node IDs on page `User Interface` and were **not copied,
moved or modified**. `SUPPLEMENT_EXISTING` — the gallery entry detail and the
footer. `RECONCILE_EXISTING` — the Homepage and the APP10 contact handoff.
`NEW_DESIGN_REQUIRED` — only the shared content-page system and the two Admin
gallery screens, each proven live to have no covering frame.

**Data-model fidelity.** `gallery_entries` is flat and `APP11` creates no table, so
UI05's `Section / Member Works` (`336:3366`) — a collection owning child works —
is **absent from APP11 implementation authority**; the entry detail instead shows
the ordered `gallery_entry_assets` set with the approved Product Detail media
stage, thumbnail strip and lightbox, plus one optional `linked_product_id`
affordance. The 3-level breadcrumb was collapsed to the flat `feed / entry` model.
No field without a column is drawn: `docs/07-ADMIN-OPERATIONS` §4 also lists
"Categorize entries" and "Configure alt text", neither of which has persistence or
a planned operation, and both are recorded as a doc-vs-schema divergence rather
than invented in design.

**Reuse discipline.** All type uses the `Typography/*` styles and all colour the
`Color/*` variables. Header, Footer, MobileMenu, Button, Chip, SectionHeader and
Input instances are reused unmodified: **0 detached instances, 0 new components,
0 new tokens or text styles**, and `FIG-FILE-DS` was not touched. Imagery is
`TEMP_ASSET`; Vietnamese copy is `PROVISIONAL_COPY`; store contact values are
explicit placeholders because no canonical values exist yet.

Every row below entered as `REVIEW_REQUIRED` with approval evidence `—`.
`APP11-D01` does **not** self-approve (§2 rule 4).

**Note on the APP10-I01 rows (§4.16).** Their nodes were **not edited**. The two
dock frames plus `FIG-APP11-CONTACT-DOCK-MISSING-CONFIG` supersede those frames
**for placement only**; the handoff contract they specify is unchanged. The
runtime remains a floating bottom-right dock and was not reverted to the footer.

38 rows: **17 Storefront gallery/home · 7 content pages · 9 Admin · 3 footer &
dock · 2 phase specifications**, of which **5 register pre-existing UI05 nodes**
and 33 point at frames created on `APP_11`.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-APP11-GALLERY-FEED-DESKTOP | Storefront | /bo-suu-tap | Gallery Feed | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 329:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=329-2) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-FEED-TABLET | Storefront | /bo-suu-tap | Gallery Feed | Default | Tablet 1024 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 339:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=339-2) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-FEED-MOBILE | Storefront | /bo-suu-tap | Gallery Feed | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 343:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=343-2) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-FEED-INTERACTION-STATES | Storefront | /bo-suu-tap | Gallery Feed | Interaction States | All | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 353:2 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=353-2) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-FEED-LOADING-EMPTY-ERROR | Storefront | /bo-suu-tap | Gallery Feed | Loading / Empty / Error | All | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | User Interface | 357:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=357-3) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-HOME-DESKTOP | Storefront | / | Homepage | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 857:11 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=857-11) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-HOME-TABLET | Storefront | / | Homepage | Default | Tablet 1024 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 857:318 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=857-318) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-HOME-MOBILE | Storefront | / | Homepage | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 857:506 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=857-506) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-HOME-PROVENANCE | Storefront | / | Homepage Provenance & Routes | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 858:442 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=858-442) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-DETAIL-DESKTOP | Storefront | /bo-suu-tap/[slug] | Gallery Entry Detail | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 860:442 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=860-442) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-DETAIL-TABLET | Storefront | /bo-suu-tap/[slug] | Gallery Entry Detail | Default | Tablet 1024 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 861:4321 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=861-4321) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-DETAIL-MOBILE | Storefront | /bo-suu-tap/[slug] | Gallery Entry Detail | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 861:4487 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=861-4487) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-DETAIL-LIGHTBOX-DESKTOP | Storefront | /bo-suu-tap/[slug] | Gallery Entry Detail Lightbox | Open | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 862:626 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=862-626) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-DETAIL-LIGHTBOX-MOBILE | Storefront | /bo-suu-tap/[slug] | Gallery Entry Detail Lightbox | Open | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 862:641 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=862-641) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-GALLERY-DETAIL-PROVENANCE | Storefront | /bo-suu-tap/[slug] | Gallery Entry Detail Supplement & Provenance | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 862:656 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=862-656) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-TEMPLATE-DESKTOP | Storefront | content pages | Content Page Template | Canonical | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 863:677 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=863-677) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-TEMPLATE-TABLET | Storefront | content pages | Content Page Template | Canonical | Tablet 1024 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 864:1085 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=864-1085) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-TEMPLATE-MOBILE | Storefront | content pages | Content Page Template | Canonical | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 864:1253 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=864-1253) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-SERVICE-DESKTOP | Storefront | /dich-vu | Content Page — Service | Instance | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 864:677 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=864-677) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-FAQ-DESKTOP | Storefront | /cau-hoi-thuong-gap | Content Page — FAQ | Instance | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 864:779 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=864-779) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-LOCAL-DESKTOP | Storefront | /cua-hang | Content Page — Local/Store | Instance | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 864:881 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=864-881) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTENT-POLICY-DESKTOP | Storefront | /chinh-sach/[slug] | Content Page — Policy | Instance | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 864:983 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=864-983) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-LIST-DESKTOP | Admin | /gallery | Gallery List | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 866:905 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=866-905) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-LIST-EMPTY | Admin | /gallery | Gallery List | Empty | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 867:907 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=867-907) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-LIST-MOBILE | Admin | /gallery | Gallery List | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 867:946 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=867-946) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-EDITOR-DESKTOP | Admin | /gallery/[entryId] | Gallery Editor | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 868:909 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=868-909) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-EDITOR-MEDIA-SELECT | Admin | /gallery/[entryId] | Gallery Editor Media Select | Selecting | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 870:926 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=870-926) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-EDITOR-PUB-READY | Admin | /gallery/[entryId] | Gallery Editor Publication Panel | Ready | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 870:1104 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=870-1104) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-EDITOR-PUB-BLOCKED | Admin | /gallery/[entryId] | Gallery Editor Publication Panel | Blocked | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 870:1187 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=870-1187) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-EDITOR-PUB-UNPUBLISH | Admin | /gallery/[entryId] | Gallery Editor Publication Panel | Confirm Unpublish | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 870:1274 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=870-1274) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-ADMIN-GALLERY-EDITOR-MOBILE | Admin | /gallery/[entryId] | Gallery Editor | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 870:1368 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=870-1368) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-FOOTER-STORE-SUPPLEMENT | Storefront | shell footer | Footer Store Presentation Supplement | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 872:1029 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=872-1029) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTACT-DOCK-DESKTOP | Storefront | shell, all pages | Floating Contact Dock | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 872:1079 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=872-1079) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTACT-DOCK-MOBILE | Storefront | shell, all pages | Floating Contact Dock | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 872:1089 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=872-1089) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-CONTACT-DOCK-MISSING-CONFIG | Storefront | shell, all pages | Floating Contact Dock | Missing configuration | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 873:1018 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=873-1018) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-FOOTER-HANDOFF-RECONCILIATION | Shared | footer & contact handoff | Footer & Floating Handoff Reconciliation Record | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 873:1006 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=873-1006) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-AUTHORITY-MAP | Shared | APP11 phase authority | Authority Map & Handoff | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 874:1006 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=874-1006) | APP11-D01 | — | — | 2026-08-29 |
| FIG-APP11-RESPONSIVE-A11Y-SEO-NOTES | Shared | APP11 handoff | Responsive, States, Accessibility & SEO Notes | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_11 | 875:1006 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=875-1006) | APP11-D01 | — | — | 2026-08-29 |

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
| FIG-DS-SCRIM-TOKEN | DS | Tokens & Styles | overlay/scrim semantic token (swatch + demo) | Catalog | All | foundation | APPROVED_FOR_IMPLEMENTATION | hsxSjwkqQKM9vuyRgWSesU | HF01 · Foundations | 78:2 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=78-2) | APP3-D01-C1 | — | APP3-A01 §0 operator review | 2026-08-09 |
| FIG-DS-INPUT | DS | Forms | Input (State = Default/Focus/Filled/Error/Disabled) | Catalog | All | component-set | APPROVED_FOR_IMPLEMENTATION | hsxSjwkqQKM9vuyRgWSesU | HF01 · Components · Forms | 76:29 | [open](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=76-29) | APP3-D01-C1 | — | APP3-A01 §0 operator review | 2026-08-09 |

**`FIG-DS-INPUT` closed by `APP3-D01-C1`** under `D01_C1_DS_REPAIR_AUTHORIZATION` — an
operator-approved, narrowly scoped exception to `FIG-FILE-DS`'s read-only policy,
covering `FIG-DS-INPUT` and `FIG-DS-SCRIM-TOKEN` and nothing else. The set is the
canonical form text field: label, field and helper/error text, every visual
property bound to `Color`/`Radius`/`Spacing` tokens, no literal colours.

It does **not** duplicate `FIG-DS-SEARCHBAR`. SearchBar is a search affordance that
had been serving as the "login Input pattern source" for want of a real one; the
form field is now its own component and SearchBar keeps its own semantics
unchanged. No existing DS component, token or brand value was renamed or
re-styled.

Newly created DS assets are **not yet published to the library**. Publishing is a
manual Figma action; until an operator publishes `DS – Core Components (WF06)`,
`Input` cannot be instanced cross-file into `APP_03`. See
`FU-DESIGN-PUBLISH-DS-INPUT-01`.

### 6.1b APP2 design-system supplements (product file, not the DS library)

`FIG-FILE-DS` is **read-only** for this project, so a genuinely missing DS primitive is
supplemented inside `FIG-FILE-PRODUCT` and flagged for DS adoption rather than written
into the library. One supplement was activated by `APP2-D01` (`GAP-D01`); it is
`REVIEW_REQUIRED` and is **not** an adopted DS library component.

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIG-DS-INPUT-APP2 | DS Supplement | Forms | Input (Default/Focus/Filled/Error/Disabled) | Catalog | All | component-set | SUPERSEDED | BQwqV8GdfUIELvsQDB1UQE | APP_02 | 424:35 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=424-35) | APP2-D01 | FIG-DS-INPUT | — | 2026-08-09 |

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
- **Color** (20 semantic, mode Light): `background/{primary,secondary,surface,elevated}`, `text/{primary,secondary,tertiary,inverse}`, `border/{primary,secondary,strong}`, `action/{primary,hover,active,disabled}`, `status/{success,warning,error,info}`, **`overlay/scrim`**.
  - `overlay/scrim` = `ink/900` at 45%, scoped `FRAME_FILL`/`SHAPE_FILL` — the canonical modal/dialog/bottom-sheet scrim (`FIG-DS-SCRIM-TOKEN`), added by `APP3-D01-C1`. **One** semantic token on purpose: no 40/45/50 alpha family. Mirrored into the product file `Semantic` collection as `Color/Overlay/Scrim`, which is how every other APP3 token is consumed, and bound by all 9 `APP_03` dialog and bottom-sheet scrims.
- **Spacing** (10): `space/4…128`. **Radius** (5): `radius/{xs,sm,md,lg,xl}` = 8/12/16/24/32.
- **Text styles** (11): `Display/{XL,L,M}`, `Heading/{XL,L,M,S}`, `Body/{L,M,S}`, `Caption` — Inter.
- **Effect styles** (2): `Elevation/Floating`, `Elevation/Modal`.

### 6.3 Design-system references used per APP1-D01 screen

- **Login (all states):** DS `Button` (Primary/Disabled), composed **Input** (the canonical `FIG-DS-INPUT` now exists — see §6.1; this APP1 screen still uses its original `SearchBar`-derived composition and may adopt the component when the DS library is republished) styled from `SearchBar`; text styles `Heading/M·S`, `Body/L·S·M`, `Caption`; colors `background/{primary,secondary,surface}`, `text/{primary,secondary,tertiary,inverse}`, `border/primary`, `action/primary`, `status/{error,warning}`; `radius/{md,lg}`; `Elevation/Floating`.
- **Shell (all states):** DS `Button` (Ghost = logout, Primary = re-login), text/color/radius tokens as above; `Elevation/Modal` on the session-expired popup; overlay scrim uses `ink/900 @45%`, now canonicalized as the `overlay/scrim` token (§6.2); this APP1 screen keeps its original literal until it is next revised.
- **Reuse map / notes / annotations:** text + color + radius tokens only.

## 7. Missing / duplicate / superseded registry

| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

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
- **Files enumerated:** 2/2 — `FIG-FILE-PRODUCT` (**10 pages** as measured live at
  `APP6-D01`; 8 at `APP4-D01`, and the previous "6 pages" figure predates `APP_03`
  and `APP_04`) + `FIG-FILE-DS` (19 pages).
- **Product pages:** Information Architecture (`0:1`), APP_01 (`371:3` — Admin
  APP1-D01 section `375:11` + Storefront APP1-D02 section `405:2224`), **APP_02
  (`419:3` — APP2-D01 section `423:3`)**, **APP_03 (`592:3` — APP3-D01 section
  `596:3`)**, **APP_04 (`620:3` — APP4-D01 section `621:3`)**, **APP_05 (`641:3` —
  APP5-D01 section `644:3`)**, **APP_06 (`678:3` — APP6-D01 section `681:3`)**, Wireframe
  (`17:55`, WF01–WF09), User Interface (`166:1457`, UI01–UI05), **LOGO_SYSTEM
  (`544:2409` — BRD0-F01 sections `546:3`–`546:8`, all `REFERENCE_ONLY`, no
  implementation authority)**.
- **DS catalog:** 4 variable collections (Primitives 16 / Color 19 / Spacing 10 /
  Radius 5), 11 text styles, 2 effect styles, component sets across 8 HF01 pages.
- **Registry coverage:** 16 APP1-D01 rows (12 `APPROVED_FOR_IMPLEMENTATION` +
  3 annotation `REVIEW_REQUIRED`), 7 APP1-D02 Storefront shell/not-found rows (all
  `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP1-D02-STOREFRONT-001`),
  **25 APP2-D01 rows** (19 Admin `PRODUCT_OWNER_APPROVED — FROZEN`, of which the
  **7 Admin Assets rows are `APPROVED_FOR_IMPLEMENTATION`** under
  `FIG-APPROVAL-APP2-D01-ADMIN-001` since `APP2-D02` and the **3 Admin Product List
  (Catalog) rows are `APPROVED_FOR_IMPLEMENTATION`** under
  `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001` since `APP2-D03` and the **5 Admin Product
  Form rows are `APPROVED_FOR_IMPLEMENTATION`** under
  `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` since `APP2-A03-G01`; 4 Product Detail withheld,
  2 annotation), **1 APP2-D02 annotation row** (`FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY`,
  `REVIEW_REQUIRED`), **1 APP2-D03 annotation row**
  (`FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF`, `REVIEW_REQUIRED`),
  **1 APP2-A03-G01 annotation row**
  (`FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF`, `REVIEW_REQUIRED`),
  **1 APP2 DS-supplement row**, **4 UI02 authority rows
  (`DRAFT` content maturity, REQUIRED visual/structural authority — §4.4.1)**,
  3 Homepage shell-reference rows (`SUPERSEDED` → APP1-D02), 4 IA/flow rows
  (`REFERENCE_ONLY`), 7 DS catalog rows (`APPROVED`), 2 `MISSING`/gap rows.
  **10 `APP2-S02-G01` reconciled Product Detail rows** (all
  `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001` —
  §4.5.1) and **4 UI03 draft rows** (`REFERENCE_ONLY` —
  `HISTORICAL_DRAFT_SOURCE`, §4.5.2).
  **Total 86 registry IDs** (4 rejected Product List rows removed by `APP2-D01-C1`,
  4 UI02 authority rows added, 1 `APP2-D02` annotation added, 1 `APP2-D03` annotation
  added, **10 `APP2-S02-G01` rows + 4 UI03 draft rows added** — see §4.3.1, §4.4.1 and
  §4.5). The four `APP2-D01` Product Detail rows moved `REVIEW_REQUIRED` →
  `REFERENCE_ONLY`; the total is unchanged by that move.
  **The "86" above is an APP2-era subtotal and was never updated by `APP3-D01`.**
  The authoritative live count is whatever `node tools/check-figma-design-index.mjs`
  measures: **278 registry IDs / 278 node rows / 17 registry tables** as of
  `APP5-D01` (213 / 213 / 16 as of `APP4-D01`). Prose subtotals are historical;
  the gate is the count.
- **`APP4-D01` (2026-08-14):** APP4 design package created on the previously
  **empty** `APP_04` canvas (`620:3`) as section `621:3` — 8 sub-sections, **48
  frames**, **48 new registry rows**, all `REVIEW_REQUIRED`. Pre-draw audit
  outcome `NO_EXISTING_APP4_DESIGN`: the registry carried no APP4 row and the
  canvas had zero children, so nothing was reused, supplemented, repaired or
  superseded. Coverage: `APP4-S01` 13 desktop + 5 mobile, `APP4-S02` 4 desktop +
  2 mobile, `APP4-A01` 17 desktop + 1 narrow-1280 reference, plus 6 shared
  annotation frames. No APP1–APP3 or BRD0 node was modified (anchors `375:11`,
  `405:2224`, `423:3`, `529:2224`, `596:3`, `596:23`, `546:3` re-read and
  unchanged); no DS library file was touched; 0 component instances and 0 new
  tokens, text styles or components were created — every frame composes existing
  `Semantic`/`Foundation` variables and `Typography/*` text styles.
- **`APP5-D01` (2026-08-16):** APP5 design package created on the previously
  **empty** `APP_05` canvas (`641:3`) as section `644:3` — 10 sub-sections,
  **65 frames**, **65 new registry rows**, entered `REVIEW_REQUIRED` and
  promoted to `APPROVED_FOR_IMPLEMENTATION` on 2026-08-16 by the Product
  Owner under `FIG-APPROVAL-APP5-D01-PO-001`, recorded by `APP5-B01`
  without touching Figma (§4.11).
- **`APP6-D01` (2026-08-20):** APP6 design package created on the **pre-existing but
  empty** `APP_06` canvas (`678:3`) as section `681:3` — 11 sub-sections, **56
  frames**, **56 new registry rows**, all `REVIEW_REQUIRED` with approval evidence
  `—`. The canvas was **reused, not created** (§2 rule 1): it already existed and
  returned zero children, so no duplicate APP6 package exists. Pre-draw audit outcome
  `NO_EXISTING_APP6_DESIGN`: the registry carried no APP6 row and §3 listed no
  `APP_06` write target, so nothing was reused, supplemented, repaired or superseded.
  Coverage: `APP6-A01` 11 desktop + 1 narrow-1280, `APP6-A02` 12 desktop + 1
  narrow-1280, `APP6-S01` 9 desktop + 2 mobile, `APP6-S02` 10 desktop + 2 mobile,
  plus 7 shared specification frames (overview, five matrices, live frame index) and
  1 handoff frame. The APP4 secure-access states and the APP3-S09 watermark were
  **referenced, not redrawn**, and are mapped on `FIG-APP6-REUSE-MAP` (`716:128`).
  No APP1–APP5 or BRD0 node was modified (anchors `375:11`, `405:2224`, `423:3`,
  `529:2224`, `596:3`, `596:23`, `621:3`, `644:3`, `546:3` re-read after completion
  and unchanged); no DS library file was touched; **0 component masters, 0 instances,
  0 new variables, text styles, paint styles or effect styles** (3 collections / 52
  variables / 11 text styles / 0 effect styles / 0 paint styles measured identically
  before and after the package).
  Pre-draw audit outcome `NO_EXISTING_APP5_DESIGN`: the registry carried no APP5
  row and the canvas returned zero children, so nothing was reused, supplemented,
  repaired or superseded. Coverage: `APP5-S01` 26 desktop + 5 mobile,
  `APP5-S02` 7 desktop + 2 mobile, `APP5-A01` 5 desktop + 1 narrow-1280,
  `APP5-A02` 12 desktop + 1 narrow-1280, plus 8 shared specification frames
  (overview, five matrices, live frame index, handoff). The secure-link access
  states were **deliberately not duplicated** — they stay `APP4-D01` authority
  and are mapped on `FIG-APP5-MATRIX-STATUS`. No APP1–APP4 or BRD0 node was
  modified (anchors `375:11`, `405:2224`, `423:3`, `529:2224`, `596:3`,
  `596:23`, `621:3`, `546:3` re-read after completion and unchanged); no DS
  library file was touched; **0 component masters, 0 instances, 0 new variables,
  text styles or effect styles** (52 variables / 3 collections / 11 text styles /
  0 effect styles measured identically before and after the package).
- **`APP7-D01` (2026-08-23):** APP7 design package created on the **pre-existing but
  empty** `APP_07` canvas (`726:3`) as section `728:3` — 11 sub-sections, **39
  frames**, **39 new registry rows**, all `REVIEW_REQUIRED` with approval evidence
  `—`. The canvas was **reused, not created** (§2 rule 1). Pre-draw audit outcome
  `NO_EXISTING_APP7_DESIGN`: the registry carried no APP7 row and §3 listed no
  `APP_07` write target. Coverage: `APP7-A01` 16 desktop frames (queue 2, order +
  deposit detail 2, verification/review 9, evidence & reconciliation 3),
  `APP7-S01` 12 desktop + 3 mobile-390, plus 6 shared specification frames
  (journey, surface ownership, state/copy matrix, truth matrix, responsive,
  accessibility, reuse map — with handoff counted separately) and 1 handoff frame.
  The APP4 secure-access states (`629:3`, `629:20`, `629:37`, `629:53`, `629:70`,
  `629:87`), the APP6 step-up (`701:3`, `710:3`) and the APP1 shells (`385:10`,
  `405:2225`, `405:3786`) were **referenced, not redrawn**, and are mapped on
  `FIG-APP7-REUSE-MAP` (`753:179`). No APP1–APP6 or BRD0 node was modified; no DS
  library file was touched; **0 component masters, 0 instances, 0 new variables,
  text styles, paint styles or effect styles** — every frame composes the existing
  `Semantic`/`Foundation` variables and `Typography/*` text styles.
  **Layout verified visually.** An initial reflow mis-handled section-relative
  coordinates as absolute, pushing every frame below its own section (content
  extent 47 618 px against a 24 378 px root). It was corrected by re-flowing in
  section-relative space and **re-verified with an independent `absoluteBoundingBox`
  pass plus screenshots**: 39 frames, 0 frames escaping their section, 0
  section-to-section overlaps, 0 frame-to-frame overlaps, and a rendered root
  height (`17 081`) that now matches the root box exactly.
- **`APP7-D01` Product Owner approval (recorded by `APP7-A01`, 2026-08-23):** the
  Product Owner reviewed the complete package in Figma and passed it. All **39**
  `APP7-D01` rows promoted `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` under
  **`FIG-APPROVAL-APP7-D01-PO-001`**; `REVIEW_REQUIRED` remaining in the package:
  **0**. Registry edit only — no Figma node opened for mutation, no node id, deep
  link, page/section ownership, screen/state/viewport or visual content changed,
  and `Last Verified` deliberately left at `2026-08-23`. No row outside `APP7-D01`
  was touched. `A01_UI_IMPLEMENTATION_GATE = OPEN`; the `APP7-D01` completion
  report keeps its historical `SELF_APPROVAL = NO`, which the external human
  approval recorded here does not contradict.
- **Gaps:** GAP-D01 and GAP-D02 are **CLOSED by `APP3-D01-C1`** — `FIG-DS-INPUT` is now a real DS component set (§6.1, `76:29`) and `overlay/scrim` a real DS semantic token (§6.2). Both were repaired in `FIG-FILE-DS` under the operator-approved `D01_C1_DS_REPAIR_AUTHORIZATION` exception, which covered these two and nothing else. New DS assets still require a manual library publish before other files can instance them (`FU-DESIGN-PUBLISH-DS-INPUT-01`). Historical note — GAP-D01 (no DS Input — supplemented for APP2 as `FIG-DS-INPUT-APP2`, DS
  library gap still open), GAP-D02 (no scrim token — still local `ink/900 @45%`).
  The former `FIG-STOREFRONT-NOTFOUND` gap is closed by APP1-D02 (now
  `APPROVED_FOR_IMPLEMENTATION`, §4.2). APP2-D01 supersedes **no** APP1 row.
- **`APP2-D01-C1` (2026-07-26):** Storefront discovery authority corrected to UI02;
  four rejected card-grid nodes deleted from Figma; Admin frozen and verified unchanged
  (31/31 frozen nodes byte-identical); Product Detail withheld pending UI03 reconciliation.
- **`APP2-D02` (2026-07-27):** Admin Assets = `PRODUCT_OWNER_APPROVED — FROZEN —
  D02_RECONCILED`. Seven rows promoted to `APPROVED_FOR_IMPLEMENTATION` under
  `FIG-APPROVAL-APP2-D01-ADMIN-001`; the eight existing Admin Assets nodes amended in
  place for cursor continuation (`Tải thêm tài sản`) and server-backed identity
  (media-format label + `{size} · {createdAt}`); one annotation node added
  (`484:272`). No Product Draft / Catalog / Publication / Storefront row changed.
- **`APP2-D03` (2026-07-31):** Admin Product List = `PRODUCT_OWNER_APPROVED —
  D03_RECONCILED`. Three Catalog rows promoted to `APPROVED_FOR_IMPLEMENTATION` under
  `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`; the three existing nodes amended in place —
  `Trạng thái`/`Danh mục` filters and the `Tải thêm sản phẩm` continuation control added,
  every `APP2-A03`/`APP2-A04` control (`Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`,
  `Gỡ xuất bản`) removed, and the empty state given copy with no dead CTA; one annotation
  node added (`498:272`); the A02/A03 ownership lines in `450:404` corrected. No Product
  Draft, Publication or Storefront frame changed, and no row other than the three Catalog
  rows promoted.
- **`APP2-S02-G01` (2026-08-02):** Storefront Product Detail reconciled. All twelve UI03
  draft roots audited live and left byte-unchanged; a new sibling section `529:2224` holds
  nine reconciled roots (three viewport defaults, `Desktop / Media Empty`,
  `Mobile / Media Error`, two lightboxes, contract handoff `537:3`, state authority
  `537:38`) plus a scope board `538:3`. Route locked to `/san-pham/[slug]` (IMP-D039); the
  four `APP2-D01` Product Detail rows retired to `REFERENCE_ONLY`. No UI01/UI02/UI04/UI05
  node and no DS source was modified; 0 detached instances, 0 new component masters, 0 new
  tokens or text styles.
- **`APP8-D01` (2026-08-25):** APP8 design package created on the **pre-existing but
  empty** `APP_08` canvas (`766:3`) as section `771:3` — 9 sub-sections, **41
  frames**, **41 new registry rows**, all `REVIEW_REQUIRED` with approval evidence
  `—`. The canvas was **reused, not created** (§2 rule 1). Pre-draw audit outcome
  `NO_EXISTING_APP8_DESIGN`: the registry carried no APP8 row and §3 listed no
  `APP_08` write target. Coverage: `APP8-A01` 5 inventory desktop states + 6
  adjustment/ledger states, `APP8-A02` 6 production-queue desktop states,
  `APP8-A03` 5 job-detail desktop states + 6 transition dialogs, 3 narrow-1280
  Admin frames, and 10 shared specification frames (journey, surface ownership,
  two refusal catalogs, stale/conflict interaction spec, reservation truth matrix,
  scope boundary, reuse map, backend dependency map, responsive coverage).
  The APP1 Admin shell (`385:10`) and the APP7 queue/table/pill/dialog/field
  patterns (`732:3`, `732:31`, `737:3`, `737:57`, `740:111`, `741:87`) were
  **referenced, not redrawn**; APP8 adds exactly two sidenav entries. No APP1–APP7
  or BRD0 node was modified; no DS library file was touched; **0 component masters,
  0 instances, 0 new variables, text styles, paint styles or effect styles** —
  every frame composes the existing `Primitive`/`Semantic`/`Foundation` variables.
  **Layout verified in absolute space.** Learning from the `APP7-D01` reflow defect,
  sections were packed in section-relative coordinates and then audited with an
  independent `absoluteBoundingBox` pass: 41 frames, **0** frames escaping their
  section, **0** section-to-section overlaps, **0** frame-to-frame overlaps, and a
  rendered root size (`9260 × 11032`) that matches the root box exactly.
  13 review-useful prototype reactions and 2 flow starting points were added
  (queue → detail, filter open, the three transition dialogs, submitting →
  conflict, and the inventory adjustment outcomes).
- **Consistency gate:** `pnpm check:figma-design-index` — see
  `tools/check-figma-design-index.mjs`. Product Detail route/scope authority is separately
  gated by `pnpm check:storefront-product-detail-authority`.
