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

All rows are `REVIEW_REQUIRED` pending human design approval — `APP3-D01` does not self-approve. **No APP3 frontend checkpoint may start against a `REVIEW_REQUIRED` row**; approval must land first and flip the rows to `APPROVED_FOR_IMPLEMENTATION` with an approval-evidence id.

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
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY | Admin | Admin template lifecycle | Publish Readiness | Ready | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-3) | APP3-D01 | — | — | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-GUARDFAIL | Admin | Admin template lifecycle | Publish Readiness | Guard Failure | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:54 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-54) | APP3-D01 | — | — | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-PUBLISHCONFIRM | Admin | Admin template lifecycle | Publish Confirmation | Confirmation | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:105 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-105) | APP3-D01 | — | — | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-ARCHIVE | Admin | Admin template lifecycle | Archive Dialog | Destructive Confirmation | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:152 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-152) | APP3-D01 | — | — | 2026-08-09 |
| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED | Admin | Admin template lifecycle | Restore from Archive | Blocked by APP3-B04A | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 602:204 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=602-204) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-DEFAULT | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:5 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-5) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-PREVIEWPENDING | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Preview Pending (B05A) | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:46 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-46) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-EMPTY | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Empty | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:73 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-73) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-SHELL-DESKTOP-EXPIRED | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Session Expired | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:85 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-85) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-SHELL-MOBILE-DEFAULT | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 604:100 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=604-100) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-STAGE-DESKTOP-UNSELECTED | Storefront | Studio stage & selection | Design Stage | Nothing Selected | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-3) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-STAGE-DESKTOP-SELECTED | Storefront | Studio stage & selection | Design Stage | Element Selected | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:63 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-63) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-STAGE-DESKTOP-EMPTY | Storefront | Studio stage & selection | Design Stage | Empty Document | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:133 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-133) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-TRANSFORM-DESKTOP-MOVE | Storefront | Studio transform controls | Transform Controls | Move | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:186 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-186) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE | Storefront | Studio transform controls | Transform Controls | Resize | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:256 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-256) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-TRANSFORM-DESKTOP-ROTATE | Storefront | Studio transform controls | Transform Controls | Rotate | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 606:326 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=606-326) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-LAYERS-DESKTOP-DEFAULT | Storefront | Studio layers | Layers Panel | List & Selection | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-3) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-LAYERS-DESKTOP-REORDER | Storefront | Studio layers | Layers Panel | Reordering | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:68 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-68) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-LAYERS-DESKTOP-EMPTY | Storefront | Studio layers | Layers Panel | Empty | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:136 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-136) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-TEXT-DESKTOP-EDITING | Storefront | Studio text | Text Editing | Editing | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:176 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-176) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-TEXT-DESKTOP-FONTPICKER | Storefront | Studio text | Text Editing | Font Picker | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:231 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-231) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-TEXT-DESKTOP-VALIDATION | Storefront | Studio text | Text Editing | Validation & Font Loading | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:286 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-286) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-IMAGE-DESKTOP-UPLOADING | Storefront | Studio image & asset | Customer Image | Uploading | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:343 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-343) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-IMAGE-DESKTOP-NORMALIZING | Storefront | Studio image & asset | Customer Image | Normalizing | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:393 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-393) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-IMAGE-DESKTOP-READY | Storefront | Studio image & asset | Customer Image | Ready & Placed | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:441 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-441) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-IMAGE-DESKTOP-FAILED | Storefront | Studio image & asset | Customer Image | Failed Inspection | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 608:503 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=608-503) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-ZOOM-DESKTOP-FIT | Storefront | Studio zoom pan & safe area | Zoom & Safe Area | Fit to Stage | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-3) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-ZOOM-DESKTOP-ZOOMED | Storefront | Studio zoom pan & safe area | Zoom & Safe Area | Zoomed In & Panned | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:51 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-51) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-ZOOM-DESKTOP-SAFEAREAHIDDEN | Storefront | Studio zoom pan & safe area | Zoom & Safe Area | Safe Area Hidden | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:99 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-99) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY | Storefront | Studio undo & redo | Undo / Redo | Mid History | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:147 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-147) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-UNDO-DESKTOP-DISABLED | Storefront | Studio undo & redo | Undo / Redo | Nothing to Undo | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:209 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-209) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-WATERMARK-DESKTOP-LIGHT | Storefront | Studio watermark | Watermark | Over Light Imagery | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:263 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-263) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-WATERMARK-DESKTOP-DARK | Storefront | Studio watermark | Watermark | Over Dark Imagery | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:299 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-299) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-WATERMARK-MOBILE-DEFAULT | Storefront | Studio watermark | Watermark | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:335 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-335) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-WATERMARK-POLICY | Storefront | Studio watermark | Watermark Policy | Specification | Desktop | annotation | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 609:371 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=609-371) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED | Storefront | Studio autosave conflict & resume | Autosave | Saved | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:3 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-3) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVING | Storefront | Studio autosave conflict & resume | Autosave | Saving | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:41 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-41) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-OFFLINE | Storefront | Studio autosave conflict & resume | Autosave | Failed / Offline | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:77 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-77) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-CONFLICT | Storefront | Studio autosave conflict & resume | Autosave | Stale Revision Conflict | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:118 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-118) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-RESUME | Storefront | Studio autosave conflict & resume | Session Resume | Resume Prompt | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:159 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-159) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-AUTOSAVE-DESKTOP-EXPIRED | Storefront | Studio autosave conflict & resume | Session Resume | Expired / Credential Lost | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:201 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-201) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-MOBILE-STAGE-SELECTED | Storefront | Studio mobile & touch | Mobile Stage | Selected | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:242 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-242) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-MOBILE-TRANSFORMSHEET | Storefront | Studio mobile & touch | Mobile Transform Sheet | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:294 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-294) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-MOBILE-LAYERSSHEET | Storefront | Studio mobile & touch | Mobile Layers Sheet | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:353 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-353) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-MOBILE-TEXTSHEET | Storefront | Studio mobile & touch | Mobile Text Sheet | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:409 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-409) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-MOBILE-IMAGESHEET | Storefront | Studio mobile & touch | Mobile Image Sheet | Default | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:465 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-465) | APP3-D01 | — | — | 2026-08-09 |
| FIG-STUDIO-MOBILE-CONFLICT | Storefront | Studio mobile & touch | Mobile Conflict Sheet | Stale Revision Conflict | Mobile 390 | high-fidelity | REVIEW_REQUIRED | BQwqV8GdfUIELvsQDB1UQE | APP_03 | 610:514 | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=610-514) | APP3-D01 | — | — | 2026-08-09 |
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
- **Files enumerated:** 2/2 — `FIG-FILE-PRODUCT` (**6 pages** since `BRD0-F01`
  added `LOGO_SYSTEM`) + `FIG-FILE-DS` (19 pages).
- **Product pages:** Information Architecture (`0:1`), APP_01 (`371:3` — Admin
  APP1-D01 section `375:11` + Storefront APP1-D02 section `405:2224`), **APP_02
  (`419:3` — APP2-D01 section `423:3`)**, Wireframe (`17:55`, WF01–WF09), User
  Interface (`166:1457`, UI01–UI05), **LOGO_SYSTEM (`544:2409` — BRD0-F01
  sections `546:3`–`546:8`, all `REFERENCE_ONLY`, no implementation authority)**.
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
- **Consistency gate:** `pnpm check:figma-design-index` — see
  `tools/check-figma-design-index.mjs`. Product Detail route/scope authority is separately
  gated by `pnpm check:storefront-product-detail-authority`.
