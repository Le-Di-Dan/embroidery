# APP7-D01 — Completion Report

## Complete APP7 Design Package — Manual Bank Transfer, Optional Evidence, Admin Order/Payment Reconciliation

- Phase: `APP7 — Deposit Payment and Order Creation`
- Checkpoint: `APP7-D01`
- Mode: `DESIGN ONLY / FIGMA + DESIGN REGISTRY`
- Date: 2026-08-23

---

## 1. Verdict

```text
APP7-D01 = COMPLETE
DESIGN_PACKAGE = DELIVERED_FOR_PRODUCT_OWNER_REVIEW
SELF_APPROVAL = NO

FIGMA_FILE = BQwqV8GdfUIELvsQDB1UQE
FIGMA_PAGE = APP_07 / 726:3
ROOT_SECTION = 728:3

PRE_DRAW_AUDIT = NO_EXISTING_APP7_DESIGN
APP_07_PAGE = PRE_EXISTING_AND_EMPTY — REUSED, NOT CREATED

APP7_REGISTRY_ROWS = 39
REVIEW_REQUIRED = 39
APPROVED_FOR_IMPLEMENTATION = 0
APPROVAL_EVIDENCE = —

ADMIN_DESIGN = COMPLETE
CUSTOMER_DESIGN = COMPLETE
RESPONSIVE_DESIGN = COMPLETE
STATE_TRUTH_MATRIX = COMPLETE
BACKEND_DEPENDENCY_MAP = COMPLETE

MANUAL_BANK_TRANSFER = LOCKED
PROVIDER_UX = NONE
DYNAMIC_QR = DESIGNED
QR_DOWNLOAD = DESIGNED

TRANSFER_EVIDENCE_REQUIRED = false
TRANSFER_EVIDENCE_SUPPORTED = true
EVIDENCE_REMINDER = PROMINENT
EVIDENCE_AUTHORITY = SUPPORTING_ONLY

ADMIN_ZERO_EVIDENCE_VERIFY = DESIGNED
ADMIN_EVIDENCE_PREVIEW = ASSOCIATION_ID / ACCEPTED_ONLY
EXPECTED_VS_OBSERVED = SEPARATED

CUSTOMER_PAYMENT_TRUTH =
  TRANSFER_EXTERNAL != EVIDENCE_SUBMITTED != PAYMENT_VERIFIED

APP8_PRODUCTION_UX = NONE
APP9_REMAINING_PAYMENT_UX = NONE

FIGMA_INDEX_CHECK = PASS
RUNTIME_CHANGE = NONE

NEXT_CHECKPOINT = APP7-A01
A01_GATE = BLOCKED_PENDING_PRODUCT_OWNER_D01_APPROVAL
```

---

## 2. Pre-draw audit

The registry was searched for every APP7-owned term — `APP7`, `APP_07`, `APP7-D01`,
`APP7-A01`, `APP7-S01`, `/orders`, `deposit`, `payment`, `evidence`, `bank transfer`
— across all 1163 lines of `docs/design/FIGMA_DESIGN_INDEX.md`. **Zero matches.**
§4 ended at `4.12 APP6-D01`; §3 listed `APP_01`…`APP_06` write targets only.

The live file was then read. `get_metadata` with no `nodeId` initially listed **one**
page (`0:1 Information Architecture`) — under-reporting, since the registry records
`APP_01`…`APP_06` as existing pages. Rather than create a page against a stale
listing, `726:3` was queried directly and returned `<canvas id="726:3" name="APP_07"
… />` with **zero children**. A full read then confirmed **11 pages**. Per §2 rule 1
the page was **reused, not re-created**; no `APP7`, `APP_7` or `APP_07_v2` duplicate
exists.

```text
PRE_DRAW_AUDIT = NO_EXISTING_APP7_DESIGN
```

Nothing was reused, supplemented, repaired or superseded. No APP1–APP6 or BRD0 node
was modified.

---

## 3. Package structure

Root section **`728:3`** — [APP7-D01 · Deposit Payment, Transfer Evidence & Order
Reconciliation](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=728-3)
on page **APP_07** (`726:3`). Eleven numbered sub-sections, matching the
`APP5-D01`/`APP6-D01` naming convention.

| Sub-section | Node | Frames |
|---|---|---|
| `00 — APP7 Overview / Journey` | `728:4` | 2 |
| `01 — A01 · Admin Order Queue · Desktop` | `728:5` | 2 |
| `02 — A01 · Admin Order + Deposit Detail · Desktop` | `728:6` | 2 |
| `03 — A01 · Admin Verification / Review · Desktop` | `728:7` | 9 |
| `04 — A01 · Admin Evidence Preview / Reconciliation · Desktop` | `728:8` | 3 |
| `05 — S01 · Customer Deposit Instructions / QR · Desktop` | `728:9` | 3 |
| `06 — S01 · Customer Evidence Intake · Desktop` | `728:10` | 6 |
| `07 — S01 · Customer Payment Status / Confirmation · Desktop` | `728:11` | 3 |
| `08 — S01 · Customer · Mobile 390` | `728:12` | 3 |
| `09 — Shared · State, Truth, Responsive & Reuse Matrices` | `728:13` | 5 |
| `10 — Handoff / Backend Dependency Notes` | `728:14` | 1 |
| **Total** | | **39** |

---

## 4. Node inventory and primary links

### 4.1 Admin — order queue and detail

| Frame | Node | Link |
|---|---|---|
| Order Queue — Default | `732:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=732-3) |
| Order Queue — Status Filter Open | `732:110` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=732-110) |
| Order + Deposit Detail — AWAITING_DEPOSIT, zero evidence | `734:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=734-3) |
| Order + Deposit Detail — evidence present | `736:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=736-3) |

### 4.2 Admin — verification and review

| Frame | Node | Link |
|---|---|---|
| Verify — form, observed empty | `737:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=737-3) |
| Verify — filled, long observed reference | `737:57` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=737-57) |
| Verify — submitting | `737:110` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=737-110) |
| Verify — success, DEPOSIT_PAID | `740:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=740-3) |
| Verify — mismatch → REQUIRES_REVIEW | `740:56` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=740-56) |
| Explicit review — form | `740:111` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=740-111) |
| REQUIRES_REVIEW — state & resolution | `741:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=741-3) |
| Mutation network ambiguity — spec | `741:51` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=741-51) |
| Concurrent & stale result — spec | `741:87` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=741-87) |

### 4.3 Admin — evidence and reconciliation

| Frame | Node | Link |
|---|---|---|
| Evidence preview — ACCEPTED | `742:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=742-3) |
| Evidence preview — INSPECTING / REJECTED blocked | `743:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=743-3) |
| Reconciliation history — audit-safe timeline | `743:35` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=743-35) |

### 4.4 Customer — deposit, QR and step-up

| Frame | Node | Link |
|---|---|---|
| Deposit instructions + dynamic QR — attempt PENDING | `745:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=745-3) |
| Deposit — before attempt initiation | `747:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=747-3) |
| STEP_UP composition — reuse note | `747:41` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=747-41) |

### 4.5 Customer — evidence intake

| Frame | Node | Link |
|---|---|---|
| Evidence — empty / optional (0 of 5) | `748:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-3) |
| Evidence — uploading | `748:29` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-29) |
| Evidence — INSPECTING | `748:57` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-57) |
| Evidence — ACCEPTED | `748:86` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-86) |
| Evidence — REJECTED | `748:115` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-115) |
| Evidence — quota reached (5 of 5) | `748:144` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=748-144) |

### 4.6 Customer — status and confirmation

| Frame | Node | Link |
|---|---|---|
| Attempt REQUIRES_REVIEW — customer-safe | `749:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=749-3) |
| Attempt FAILED / EXPIRED — new attempt | `749:26` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=749-26) |
| DEPOSIT verified — order confirmation (desktop) | `749:50` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=749-50) |

### 4.7 Customer — Mobile 390

| Frame | Node | Link |
|---|---|---|
| Deposit instructions + QR | `750:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=750-3) |
| Evidence intake | `750:376` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=750-376) |
| DEPOSIT verified — confirmation | `750:415` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=750-415) |

### 4.8 Shared specifications

| Frame | Node | Link |
|---|---|---|
| Journey flow map | `729:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=729-3) |
| Surface & route ownership | `729:103` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=729-103) |
| Payment state & copy matrix | `751:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=751-3) |
| Product truth matrix | `751:175` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=751-175) |
| Responsive coverage & behaviour | `753:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=753-3) |
| Accessibility specification | `753:120` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=753-120) |
| Reuse map | `753:179` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=753-179) |
| Handoff & backend dependency map | `754:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=754-3) |

---

## 5. Contract findings that changed the design

The package was drawn against the **generated OpenAPI contract**, not planning prose.
Three findings contradicted the brief's assumptions and the design follows the
contract.

### 5.1 `publicOrderDeposit_current` returns no attempt state

The customer deposit read publishes exactly `orderCode`, `orderStatus`,
`depositStatus`, `depositAmount`, `currencyCode`, `accessExpiresAt` and
`bankInstructions{bankBin, bankDisplayName, accountNumber, accountName,
transferReference}`. There is **no attempt field**.

Attempt status — `PENDING`, `REQUIRES_REVIEW`, `SUCCEEDED`, `FAILED`, `EXPIRED` — is
reachable only through `publicOrderDeposit_initiate`, which is idempotent and returns
`replayed: true` with the current attempt. The customer bootstrap therefore **must**
call `initiate` to know which state it is in. This is recorded on `747:3` and on the
handoff map (`754:3`). §14.10–14.11 states are designed on that basis.

### 5.2 `assetStatus` publishes four values, not three

`UPLOADED` precedes `INSPECTING` in both the Admin and customer contracts. The brief's
§34 matrix lists three. `UPLOADED` is designed and rendered **identically to
`INSPECTING`** — preview disabled, label *Đang kiểm tra* — and the rule is stated on
`743:3` and in the state matrix (`751:3`).

### 5.3 `previewEligible` is Admin-only

`publicOrderDepositEvidence_status` returns `evidenceId`, `assetStatus`, `mediaType`,
`byteSize`, `createdAt` and nothing else — no preview flag and no binary route. This
matches the §10 rule that the customer has no binary download, and the customer frames
show no preview affordance at all.

### 5.4 Constraints honoured exactly

| Field | Contract | Design consequence |
|---|---|---|
| `observedTransferReference` | **no `maxLength`, no `pattern`** | No uppercase forcing, no punctuation stripping, no 15-character canonical form, no invented 2000-character bound. `737:57` draws a long mixed-case punctuated value wrapping in full; truncation exists only in table cells (`743:35`), never on the submitted value. |
| `observedAmount` | `^\d{1,12}(?:\.\d{1,2})?$` | Client validation states exactly this expression, neither loosened nor tightened. |
| `verify` request | `note`, `observedAmount`, `observedTransferReference` **all required** | All three fields marked `* bắt buộc`; submit disabled until all three are present (`737:3`). |
| `review` request | `reviewReason` required; observed fields optional | Drawn exactly so (`740:111`). No caller-supplied status — the endpoint itself means `REQUIRES_REVIEW`. |
| `adminOrder_list` | `status[]` + `limit` (≤100) + `cursor` only | No product search, SKU search, provider filter, evidence filter, inventory filter or date range. Pagination is *Tải thêm* with no page numbers and no total count. |
| `adminOrder_detail` items | `sizeLabel` optional and currently absent | Size column renders `— không có` with an explicit note; no fake label is derived from the variant or from live Catalog. |

---

## 6. State coverage

### 6.1 Admin

| State | Frame |
|---|---|
| Order queue default | `732:3` |
| Order queue status-filter | `732:110` |
| Order detail — AWAITING_DEPOSIT | `734:3` |
| Order detail — zero evidence | `734:3` |
| Order detail — evidence present | `736:3` |
| Verification form | `737:3`, `737:57` |
| Verification pending | `737:110` |
| Verification success / DEPOSIT_PAID | `740:3` |
| Mismatch → REQUIRES_REVIEW | `740:56` |
| Explicit review form | `740:111` |
| REQUIRES_REVIEW resolution | `741:3` |
| Mutation network ambiguity | `741:51` |
| Concurrent / stale result | `741:87` |
| Evidence preview — ACCEPTED | `742:3` |
| Evidence preview — INSPECTING / REJECTED blocked | `743:3` |
| Reconciliation history | `743:35` |

### 6.2 Customer

| State | Desktop | Mobile 390 |
|---|---|---|
| Deposit instructions + QR | `745:3` | `750:3` |
| Before attempt initiation | `747:3` | spec |
| STEP_UP composition | `747:41` (reuse) | reuse |
| Evidence — empty / optional | `748:3` | `750:376` |
| Evidence — uploading | `748:29` | spec |
| Evidence — INSPECTING | `748:57` | spec |
| Evidence — ACCEPTED | `748:86` | `750:376` |
| Evidence — REJECTED | `748:115` | `750:376` |
| Evidence — quota reached | `748:144` | spec |
| PENDING / waiting for confirmation | `745:3` | `750:3` |
| REQUIRES_REVIEW customer-safe | `749:3` | spec |
| FAILED / EXPIRED + new attempt | `749:26` | spec |
| DEPOSIT verified / confirmation | `749:50` | `750:415` |

The three high-risk states named by §15 — QR + instructions with evidence reminder,
evidence intake, verified deposit — are **drawn** at Mobile 390. The remainder are
specified on `753:3`.

---

## 7. The three facts, never collapsed

`751:3` (state & copy matrix) and `751:175` (truth matrix) enforce the central
invariant. Only two rows in the entire package may read as *paid*:

| Fact | Caused by | Payment verified? |
|---|---|---|
| QR shown | system | No |
| Customer transfers externally | customer / bank | Not knowable automatically |
| Evidence submitted | customer | No |
| Evidence ACCEPTED | asset inspection | No |
| Admin review required | Admin / reconciliation | No |
| Attempt SUCCEEDED + obligation SATISFIED | **Admin verification** | **Yes** |
| Order DEPOSIT_PAID | payment lifecycle | **Yes** |

Wording is separated accordingly: attempt *Chờ xác nhận tiền cọc*; evidence *Đã gửi /
Đang kiểm tra / Đã được tiếp nhận / Không hợp lệ*; authoritative payment *Đã xác nhận
tiền cọc*. No shared "Đã thanh toán" badge exists anywhere in the package.

Mismatch is drawn as a **durable business outcome** — *Đã chuyển giao dịch sang cần
đối chiếu*, HTTP 200, reconciliation recorded, deposit and order unchanged — and never
as *Xác nhận thất bại* (`740:56`). `REQUIRES_REVIEW` resolves through the **same**
verify action, recorded as `RESOLVE_REVIEW`; no custom resolve endpoint is designed
(`741:3`, `743:35`).

---

## 8. Reuse map

| Component | Node | Owning phase | APP7 action |
|---|---|---|---|
| Secure-link bootstrap | `629:3` | APP4-D01 | Reused unchanged |
| Secure-link authorized shell | `629:20` | APP4-D01 | APP7 fills the content area only |
| Unavailable — single indistinguishable state | `629:37` | APP4-D01 | Reused unchanged |
| Transient network error | `629:53` | APP4-D01 | Reused unchanged |
| Secure shell — mobile authorized | `629:70` | APP4-D01 | Reused unchanged |
| Secure shell — mobile unavailable | `629:87` | APP4-D01 | Reused unchanged |
| STEP_UP | `701:3` | APP6-D01 | Reused for attempt initiation |
| STEP_UP (variant) | `710:3` | APP6-D01 | Second reference to the same pattern |
| Storefront shell — desktop | `405:2225` | APP1-D02 | Reused unchanged |
| Storefront shell — mobile | `405:3786` | APP1-D02 | Reused unchanged |
| Admin shell — desktop | `385:10` | APP1-D01 | Reused; APP7 fills the content area |

A second copy of a security state is a second authority for the same behaviour — the
`APP5-D01`/`APP6-D01` ruling, applied unchanged. APP7 owns the payment content,
states, QR, evidence UX and Admin reconciliation workbench; it owns no secure-link
framework and no verification system.

---

## 9. Backend dependency map

| Surface | Operation | Method and path |
|---|---|---|
| Admin order queue | `adminOrder_list` | `GET /api/admin/orders` |
| Admin order detail | `adminOrder_detail` | `GET /api/admin/orders/{orderId}` |
| Admin payment panel | `adminOrderPayment_read` | `GET /api/admin/orders/{orderId}/payments` |
| Admin verify | `adminPaymentAttempt_verify` | `POST /api/admin/payment-attempts/{attemptId}/verify` |
| Admin review | `adminPaymentAttempt_review` | `POST /api/admin/payment-attempts/{attemptId}/review` |
| Admin evidence preview | `adminPaymentEvidence_get` | `GET /api/admin/payment-evidence/{evidenceId}/content` |
| Customer deposit read | `publicOrderDeposit_current` | `POST /api/public/orders/deposit` |
| Customer attempt initiation | `publicOrderDeposit_initiate` | `POST /api/public/orders/deposit/attempts` |
| Customer dynamic QR | `publicOrderDeposit_qr` | `POST /api/public/orders/deposit/qr` |
| Customer evidence upload | `publicOrderDepositEvidence_upload` | `POST /api/public/orders/deposit/evidence` |
| Customer own-evidence status | `publicOrderDepositEvidence_status` | `POST /api/public/orders/deposit/evidence/status` |

All eleven were resolved from `packages/contracts/openapi/openapi.generated.json`. **No
frame depends on an API that does not exist**, and no design requirement for a new
endpoint was created. The B06 annotation uses `evidenceId`, never `assetId`; no raw
`assetId`, storage URL, download token or object-storage link appears in any frame.

---

## 10. Routes

| Surface | Route | Basis |
|---|---|---|
| Admin queue | `/orders` | Matches `apps/admin/src/app/(protected)/` convention (`assets`, `products`, `requests`, `support`) |
| Admin detail | `/orders/{orderId}` | Same |
| Customer secure payment | `/truy-cap/thanh-toan` | Joins the existing `truy-cap/{bao-gia,duyet-thiet-ke}` secure family in `apps/storefront/src/app/` |

Deposit instructions, attempt status, evidence status and the verified-deposit
confirmation live on the **single** customer route — `APP7-R00` deliberately merged the
confirmation into S01's secure flow, and it is not split into a second page.

---

## 11. Design data safety

```text
REAL_BANK_ACCOUNT = NONE
REAL_CUSTOMER_CONTACT = NONE
REAL_SECURE_TOKEN = NONE
REAL_ADMIN_ACCOUNT = NONE
REAL_CUSTOMER_SCREENSHOT = NONE
PRODUCTION_DATABASE_ID = NONE
PRODUCTION_OBJECT_URL = NONE
```

Synthetic values used throughout: order `ORD-K7M2Q9XR4T` (alphabet-valid), reference
`ORDK7M2Q9XR4TDC` (15 characters, matching
`^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}DC$`), amount `5.100.000 VND` (40 % of a
synthetic `12.750.000 VND` total), bank `NGAN HANG DEMO — MINH HOA`, account
`0000 1111 2222`, holder `CONG TY TNHH NET THEU (DEMO)`, bank BIN `970000`
(unassigned). Customer and admin identifiers are truncated placeholders
(`7c19…8b41`).

**QR safety.** Both QR frames render a deterministic pseudo-random module grid with
finder patterns. They are **not** valid EMVCo/NAPAS payloads, carry no CRC, and cannot
initiate a transfer to any account. Both are labelled `DỮ LIỆU MINH HOẠ /
NON-PRODUCTION`, as is the receipt mock in the evidence preview (`742:3`), which is
drawn from vector shapes rather than any real screenshot.

---

## 12. Design-system usage

```text
COMPONENT_MASTERS_CREATED = 0
COMPONENT_INSTANCES_CREATED = 0
NEW_VARIABLES = 0
NEW_TEXT_STYLES = 0
NEW_PAINT_STYLES = 0
NEW_EFFECT_STYLES = 0
DS_LIBRARY_FILE_TOUCHED = NONE
```

Every frame composes the existing local collections — `Primitive` (16), `Semantic`
(17), `Foundation` (19) — binding `Color/Background/*`, `Color/Surface/*`,
`Color/Text/*`, `Color/Border/*`, `Color/Action/*`, `Color/Status/*` and
`Color/Overlay/Scrim` as bound variable paints, never literal hex.

---

## 13. Layout defect found and repaired inside this checkpoint

An initial reflow pass treated Figma's **section-relative** child coordinates as
absolute. Every frame was consequently pushed below its own section by exactly its
section's offset — the evidence-intake frames landed at `y=26600` instead of
`y≈13440`, the handoff frame at `y=46800`, and total content spanned **47 618 px**
against a root section of **24 378 px**.

The failure was compounded by my own verification: the overlap check compared
relative coordinates against relative coordinates, so it was self-consistent and
reported `sectionOverlaps: []`, `frameOverlaps: []`, `childrenEscapingTheirSection:
[]` — **clean, and wrong**. The defect was caught by the Product Owner looking at the
file, not by the check.

Repair: all 39 frames re-flowed in section-relative space (left-to-right with wrap at
6200 px, sections fitted to content, sections stacked inside the root).

Re-verification used an **independent** measurement — `absoluteBoundingBox` only —
plus screenshots:

```text
frameCount = 39
sectionsOutsideRoot = []
framesEscapingSection = []
sectionOverlaps = []
frameOverlaps = []
rootBox = 160,160 6300×17081
contentExtent = 320…6300 × 400…17061   (inside the root box)
```

The decisive independent signal: the rendered screenshot of the root section now
reports `original_height: 17081`, **matching the root box exactly**. Before the
repair the same render reported `47618`, which is what proved content was escaping.

---

## 14. Validation ledger

| Command / action | Scope | Result |
|---|---|---|
| `node tools/check-figma-design-index.mjs` | registry integrity gate | **PASS** — 373 registry IDs, 373 node rows, 19 registry tables; canonical files, statuses, deep links and composite keys verified |
| Live Figma re-read (`use_figma`, read-only) | all 11 sub-sections + 39 frames | every registered node resolves; geometry clean |
| `get_screenshot` — root `728:3` | visual layout verification | 11 tidy bands, no overlap; render height matches root box |
| `get_screenshot` — `728:7`, `729:3`, `732:3`, `734:3`, `737:57`, `742:3`, `745:3` | per-frame visual review | alignment, spacing, hierarchy, overflow checked; two overflow defects found and fixed (order-item table columns, attempt amount) |
| `git diff --check` | whitespace | clean |

Deliberately **not** run, per §45: `pnpm quality`, unit/integration/API tests,
Playwright, typecheck, build, OpenAPI generation, api-client generation, DB
migrations, worker tests, SonarQube, and every APP5/APP6/APP7 runtime suite. No
runtime input changed, so no runtime gate had anything to re-measure.

---

## 15. Changed files

```text
docs/design/FIGMA_DESIGN_INDEX.md
  §3  + APP_07 write target (726:3)
  §4.13 + 39 REVIEW_REQUIRED rows, pre-draw audit, contract findings, reuse note
  §10 + APP7-D01 audit metadata incl. the layout defect and its verification

docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
  §checkpoint table — D01 acceptance criterion corrected to REVIEW_REQUIRED
  §8 status — D01 COMPLETE, A01 sole Next with the approval gate

docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
  APP7 row — D01 recorded, Next advanced to A01 with the gate

docs/implementation/reports/APP7-D01-COMPLETION-REPORT.md   (new)
```

No file under `apps/**`, `packages/**`, OpenAPI, api-client, database, worker,
`package.json`, lockfile or runtime SCSS was touched.

---

## 16. Design assumptions

1. **Customer route `/truy-cap/thanh-toan`.** No accepted route existed for the
   customer payment surface. The name follows the delivered `/truy-cap/bao-gia` and
   `/truy-cap/duyet-thiet-ke` siblings. If the Product Owner prefers another slug,
   only the registry `Route/Capability` column and the frame annotations change — no
   layout is affected.
2. **Admin routes `/orders` and `/orders/{orderId}`.** Inferred from the existing
   `(protected)` route group. No router entry exists yet; `APP7-A01` creates it.
3. **Vietnamese copy is proposed, not locked.** The semantic separations in §7 are
   mandatory; the exact wording is open to Product Owner revision.
4. **Deposit split shown as 40 %** (`5.100.000` of `12.750.000`) to match the
   `APP6-G01` policy. The figure is illustrative; the UI always renders the
   server-returned obligation amount.
5. **`UPLOADED` copy reuses the `INSPECTING` wording.** The contract distinguishes
   them but the customer-visible difference is nil, and inventing a fourth label
   would add a distinction the product does not need.

---

## 17. Product Owner review

Open the root section and review top to bottom:

**[APP7-D01 · Deposit Payment, Transfer Evidence & Order
Reconciliation](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=728-3)**

Suggested order: `729:3` (journey) → `751:175` (truth matrix) → `745:3` (the customer
flagship) → `734:3` and `737:57` (the Admin flagships) → `751:3` (state & copy) →
`754:3` (handoff).

```text
SELF_APPROVAL = NO
```

All 39 rows are `REVIEW_REQUIRED` with `Approval Evidence = —`. The identifier
`FIG-APPROVAL-APP7-D01-PO-001` is **reserved** for the eventual human approval and has
**not** been written anywhere. Promotion to `APPROVED_FOR_IMPLEMENTATION` is external
to Claude and must be recorded by a later checkpoint.

---

## 18. Next

```text
NEXT_CHECKPOINT = APP7-A01
A01_UI_IMPLEMENTATION_GATE = BLOCKED_UNTIL_RELEVANT_D01_ROWS_ARE_PRODUCT_OWNER_APPROVED
```

`APP7-A01` and `APP7-S01` were **not** started. No UI code exists for this phase.
