# APP8-D01 — Figma Design Package for Inventory and Production Operations

## 1. Verdict

```text
APP8-D01                      = COMPLETE
DESIGN_PACKAGE                = READY_FOR_PO_REVIEW
NEXT_IMPLEMENTATION_CHECKPOINT = BLOCKED_PENDING_PO_DESIGN_APPROVAL
NEXT_CHECKPOINT               = APP8-A01
SELF_APPROVAL                 = NO
NOT_PUSHED                    = true
```

One coherent APP8 Admin design package — Inventory, Production Queue and
Production Job Detail — was drawn on the **pre-existing, empty** `APP_08` page,
registered with exact node ids, and left in the repository's standard
`REVIEW_REQUIRED` state. `APP8-D01` does not self-approve, so `APP8-A01` is
`NEXT` but not yet executable (§20).

Zero runtime, schema, OpenAPI, generated-client and worker changes.

## 2. Branch and commit evidence

```text
BRANCH       = production
ENTRY_HEAD   = 139773b498cb6c1cacdcbd820781b43228b7bf51
               feat(app8): guard production transitions across order and inventory (APP8-B04)
FINAL_COMMIT = recorded by the commit that carries this report
PUSHED       = no
```

The hash is not restated in a second commit: this report is committed *with* the
index and phase-plan edits, so the hash is that commit's own.

## 3. Figma file and page

| Item | Value |
|---|---|
| File | `embroidery` — `FIG-FILE-PRODUCT` |
| File key | `BQwqV8GdfUIELvsQDB1UQE` |
| Page | `APP_08` — node `766:3` |
| Root section | `771:3` — `APP8-D01 · Inventory Reservation & Production Operations` |
| Sub-sections | 9 (`00` … `08`) |
| Frames | 41 |
| Root bounds | `9260 × 11032` at page `(160, 160)` |

## 4. Did the APP8 page target exist?

```text
APP_08_PAGE            = ALREADY_EXISTED (766:3), ZERO CHILDREN
DISPOSITION            = REUSED, NOT RE-CREATED  (index §2 rule 1)
APP8_FIGMA_BASELINE    = 0 rows  (R00's reading re-verified, not assumed)
APP_08_WRITE_TARGET    = ABSENT in index §3 → ADDED by this checkpoint
PRE_DRAW_AUDIT_OUTCOME = NO_EXISTING_APP8_DESIGN
DUPLICATE_PAGE_OR_PACKAGE = none
```

The mandatory preflight was performed against the **live file**, not against
R00's recorded value. `figma.root.children` returned 13 pages; `APP_08` was
present at `766:3` with `children.length === 0`. It was therefore reused. This
is the same situation `APP7-D01` met with `APP_07`, and the same ruling applies.

Nothing outside `APP_08` was opened for mutation. No APP1–APP7 or BRD0 node, and
no DS library file, was touched.

## 5. Exact frame list and node ids

### 5.1 `771:4` — 00 · APP8 Overview / Journey

| Node | Frame |
|---|---|
| `772:3` | APP8 · Journey Flow Map — Reservation → Production |
| `773:3` | APP8 · Surface & Route Ownership |

### 5.2 `771:5` — 01 · A01 · Admin Inventory · Desktop

| Node | Frame |
|---|---|
| `775:3` | A01 · Kho SKU — Mặc định (Desktop 1440) |
| `775:101` | A01 · Kho SKU — Sắp hết hàng / Khả dụng âm (Desktop 1440) |
| `776:3` | A01 · Kho SKU — Chưa từng kiểm kho (Desktop 1440) |
| `776:54` | A01 · Kho SKU — Đang tải (Desktop 1440) |
| `776:142` | A01 · Kho SKU — Lỗi & Từ chối (Desktop 1440) |

### 5.3 `771:6` — 02 · A01 · Inventory Adjustment & Ledger States

| Node | Frame |
|---|---|
| `777:3` | A01 · Điều chỉnh tồn kho — Mặc định |
| `777:33` | A01 · Điều chỉnh tồn kho — Lỗi nhập liệu (400) |
| `777:60` | A01 · Điều chỉnh tồn kho — Đang gửi |
| `777:83` | A01 · Điều chỉnh tồn kho — Thành công |
| `777:99` | A01 · Điều chỉnh tồn kho — Từ chối vì âm tồn (409) |
| `777:125` | A01 · Lịch sử chuyển động — Bị cắt bớt (truncated) |

### 5.4 `771:7` — 03 · A02 · Admin Production Queue · Desktop

| Node | Frame |
|---|---|
| `780:3` | A02 · Hàng đợi sản xuất — Mặc định (Desktop 1440) |
| `780:105` | A02 · Hàng đợi sản xuất — Mở bộ lọc trạng thái (Desktop 1440) |
| `782:3` | A02 · Hàng đợi sản xuất — Rỗng (Desktop 1440) |
| `782:44` | A02 · Hàng đợi sản xuất — Rỗng do bộ lọc (Desktop 1440) |
| `782:89` | A02 · Hàng đợi sản xuất — Đang tải (Desktop 1440) |
| `782:206` | A02 · Hàng đợi sản xuất — Lỗi (Desktop 1440) |

### 5.5 `771:8` — 04 · A03 · Admin Production Job Detail · Desktop

| Node | Frame |
|---|---|
| `784:3` | A03 · Chi tiết lệnh — PLANNED · Catalog (Desktop 1440) |
| `784:129` | A03 · Chi tiết lệnh — STARTED · Đơn hỗn hợp (Desktop 1440) |
| `785:3` | A03 · Chi tiết lệnh — COMPLETED (Desktop 1440) |
| `785:134` | A03 · Chi tiết lệnh — CANCELLED (Desktop 1440) |
| `785:270` | A03 · Chi tiết lệnh — PLANNED · Chỉ COP, không cần giữ kho (Desktop 1440) |

### 5.6 `771:9` — 05 · A03 · Production Transition Dialogs

| Node | Frame |
|---|---|
| `786:3` | A03 · Bắt đầu sản xuất — Xác nhận |
| `786:39` | A03 · Hoàn tất sản xuất — Xác nhận |
| `786:70` | A03 · Huỷ lệnh sản xuất — Từ PLANNED |
| `786:110` | A03 · Huỷ lệnh sản xuất — Từ STARTED |
| `786:150` | A03 · Huỷ lệnh sản xuất — Thiếu lý do (400) |
| `786:177` | A03 · Chuyển trạng thái — Đang gửi |

### 5.7 `771:10` — 06 · Shared · Refusal, Conflict & Stale-state Catalog

| Node | Frame |
|---|---|
| `787:3` | Shared · Danh mục từ chối sản xuất |
| `787:94` | Shared · Danh mục từ chối kho |
| `787:149` | Shared · Xung đột & trạng thái cũ — Đặc tả tương tác |

### 5.8 `771:11` — 07 · Shared · Truth Matrices, Scope Boundary & Reuse

| Node | Frame |
|---|---|
| `788:3` | Shared · Catalog / COP / Mixed — Ma trận sự thật giữ kho |
| `788:52` | Shared · Ranh giới phạm vi APP8 |
| `788:136` | Shared · Reuse Map |
| `788:179` | Shared · Backend Dependency & Handoff Map |

### 5.9 `771:12` — 08 · Admin · Narrow 1280

| Node | Frame |
|---|---|
| `789:3` | A01 · Kho SKU (Narrow 1280) |
| `789:85` | A02 · Hàng đợi sản xuất (Narrow 1280) |
| `789:160` | A03 · Chi tiết lệnh — PLANNED (Narrow 1280) |
| `789:267` | Shared · Responsive Coverage & Behaviour |

## 6. Design-index rows added or updated

```text
ROWS_ADDED    = 41   (all REVIEW_REQUIRED, Approval Evidence = —)
ROWS_UPDATED  = 0
ROWS_DELETED  = 0
ROWS_SUPERSEDED = 0
SECTION_ADDED = §4.14 APP8-D01
WRITE_TARGET_ADDED = `APP_08` → page 766:3   (index §3)
CHANGELOG_ENTRY_ADDED = 1
INDEX_TOTAL   = 373 → 414 registry IDs / 414 node rows / 19 → 20 tables
```

Registry-id prefixes: `FIG-APP8-OVERVIEW-*`, `FIG-APP8-A01-*`, `FIG-APP8-A02-*`,
`FIG-APP8-A03-*`, `FIG-APP8-REFUSAL-*`, `FIG-APP8-STALE-CONFLICT-SPEC`,
`FIG-APP8-MATRIX-RESERVATION-TRUTH`, `FIG-APP8-SCOPE-BOUNDARY`,
`FIG-APP8-REUSE-MAP`, `FIG-APP8-HANDOFF-DEPENDENCY-MAP`,
`FIG-APP8-RESPONSIVE-SPEC`.

No duplicate registry id and no duplicate canonical composite key
`(App/Library, Route/Capability, Screen/Asset, State, Viewport)` — asserted by the
row generator before the splice, and independently re-asserted by the gate.

## 7. Inventory design summary (Screen A)

Route identity proposed: `/kho/skus/{skuId}`, reachable from Catalog/SKU
operations and from the new `Kho` sidenav entry.

**Implementable from B01 without inventing an all-SKU API.** `B01` publishes
stock **by SKU** only, so the IA begins at a known SKU rather than at a list.
`FIG-APP8-OVERVIEW-SURFACES` (`773:3`) states this explicitly, and no frame
draws an all-SKU stock table.

Covered:

- SKU context header with `skuId` / `skuStockId`, and the audited adjustment action.
- Four metrics exactly as published: `quantityOnHand`, `heldQuantity`,
  `reservedQuantity`, and computed `available` — labelled as computed under the
  anchor row lock and never stored.
- Truthful low-stock indication: `lowStock` is shown as comparing **on-hand**
  with `lowStockThreshold`, and the copy states that holds and reservations do
  not move the flag. The no-threshold case renders `lowStock = false` with no
  inferred threshold.
- Negative `available` is designed as a **valid** consequence of reservations
  exceeding on-hand (`775:101`), not as data corruption.
- Bounded ledger (`entryKind`, `quantity`, `onHandDelta`, `reason?`,
  `occurredAt`), newest-first, max 100, with a dedicated truncation state
  (`777:125`).
- Loading, empty/new-anchor, and error/refusal states.

Adjustment dialog (`777:3` … `777:99`): signed integer delta, mandatory reason,
explicit consequence statement, validation (`delta = 0`, blank reason),
submitting, success, and the `INVENTORY_STOCK_WOULD_GO_NEGATIVE` refusal which
states that **nothing was written** — no stock change and no ledger row.

Deliberately absent: absolute stock overwrite, threshold authoring, manual
reservation actions, COP stock, ledger pagination.

## 8. Production Queue design summary (Screen B)

Route identity proposed: `/san-xuat`, a first-class Admin work queue.

- Filters are exactly the two published: multi-select `status[]` over the whole
  four-value LC-18 vocabulary, and `orderId`. The filter dropdown (`780:105`)
  states that "all" is not a submitted value — an empty selection means no filter.
- Keyset load-more consistent with the APP7 order queue, with the same copy about
  `hasNext` / `nextCursor`, no page numbers and no total count.
- Deterministic ordering stated as newest-first on `(createdAt, id)` — the same
  key the cursor uses.
- Status chips reuse the APP7 pill; timestamps show creation plus the most recent
  lifecycle milestone.
- Loading, error, empty and **filtered-empty** are separate frames with
  deliberately different copy.

Not drawn: priority, SLA, operator assignment, machine assignment, attempts,
claims, customer timeline, artifact readiness.

## 9. Production Job Detail design summary (Screen C)

Route identity proposed: `/san-xuat/{jobId}`, reachable from the queue and from
the APP7 order detail.

**A. Header/state** — `jobId`, `orderCode` with a link to the order,
`approvalSnapshotId`, status pill, and `createdAt` / `startedAt` / `completedAt` /
`cancelledAt` / `updatedAt` as they apply.

**B. Frozen specification** — a locked, read-only card carrying `productName`,
`variantLabel`, `sideName`, `areaName`, `physicalWidthMm × physicalHeightMm`,
`quantityTotal`, `documentHash` in operator-safe form, and `productionParameters`.
The banner states the values were copied from the exact approval and are never
re-read from the live catalog, so a later catalog rename cannot change them. It
is visually and textually not an editable catalog form. No artifact payload, no
storage key, no download.

**C. Reservation backing** — `required`, `catalogItemCount`,
`customerOwnedItemCount`, and Catalog reservation rows with SKU, quantity and
reservation state. Every variant carries the warning that this section is
**display context, not client-side eligibility authority**.

**D. Transition history** — ordered `from → to`, safe actor attribution
(`ADMIN` + shortened admin id; a customer never appears), timestamp and reason
where applicable. A `PLANNED` job renders an **empty** history with copy stating
that job creation is not recorded as a transition — **no creation row is
invented** (`784:3`).

**E. Guarded actions** — `PLANNED` → Start / Cancel; `STARTED` → Complete /
Cancel; `COMPLETED` and `CANCELLED` → no APP8 mutation, with copy explaining that
a cancelled job cannot be restarted and that a redo would be a separate new job
APP8 does not deliver.

## 10. Dialogs and prototyped interactions

| Dialog | Node | What it states |
|---|---|---|
| Start production | `786:3` | job `PLANNED → STARTED`, order `DEPOSIT_PAID → IN_PRODUCTION`, reservations `RESERVED → CONSUMED`; consumption is one-way; the server may refuse if deposit/order/approval/reservation state changed; COP orders simply consume nothing |
| Complete production | `786:39` | job `STARTED → COMPLETED`, order `IN_PRODUCTION → PRODUCTION_COMPLETED`; no inventory movement; remaining payment and shipping happen later |
| Cancel — from PLANNED | `786:70` | mandatory reason, destructive styling, explicit "this is not order cancellation/refund", still-`RESERVED` reservations released, order commercial state unchanged |
| Cancel — from STARTED | `786:110` | mandatory reason; **consumed stock is not restored**; returning stock would be a separate audited adjustment |
| Cancel — reason missing | `786:150` | blocked in place; also states that Start/Complete accept no reason at all, which is why they have no reason field |
| Transition submitting | `786:177` | no optimistic advance; do not resubmit on a dropped connection; waiting on a row lock is correct behaviour, not a hang |

Prototype: **13** `ON_CLICK` reactions and **2** flow starting points, covering
exactly the review-useful paths — queue → detail, filter open, the three
transition dialogs, submitting → conflict/reload, complete → COMPLETED detail,
cancel → CANCELLED detail, and the inventory adjustment outcomes. No decorative
animation. (Prior approved D01 packages carry zero reactions; this addition is
additive and changes no frame content.)

## 11. Catalog / COP / mixed representation

`FIG-APP8-MATRIX-RESERVATION-TRUTH` (`788:3`) is the authority, and every detail
frame conforms:

| Order | Design rule |
|---|---|
| Catalog-only | Full reservation table; start consumes it |
| **COP-only** (`785:270`) | "Đơn này không cần giữ kho" on a **neutral** surface — no red, no warning icon, no "missing" wording. `required = false`; start consumes nothing and returns an empty list |
| Mixed (`784:129`) | Real Catalog rows plus explicit copy that the COP portion has none and never will. **No fabricated COP reservation row** |
| Released / expired | Terminal-state row still shown, so "existed then released" is distinguishable from "never existed" (`785:134`) |
| Insufficient | Held quantity shown next to approved quantity so the shortfall is visible |

## 12. Stale, concurrent and conflict states

`FIG-APP8-STALE-CONFLICT-SPEC` (`787:149`) designs the required five-step
interaction: submit → server refuses because authoritative state changed → focused
conflict message → reload job truth → recompute available actions. It also states
three prohibitions: no optimistic lifecycle advance, no automatic retry of a
refused command, and no invented "retryable conflict" code (§14).

Operator-facing states are designed for every published refusal:

- Production (`787:3`): deposit not satisfied, order on hold/cancelling,
  production blocked, approval mismatch, job already exists, reservation not
  active, reservation insufficient, invalid/stale transition, cancellation reason
  missing, job/order not found, invalid cursor.
- Inventory (`787:94`): negative-stock refusal, SKU not found, body validation,
  `401`, `403`, `500`.

No raw backend code is ever the only copy: each state carries a Vietnamese title
and an action sentence, with the technical code as an engineer-facing annotation.
No automated recovery action is invented — every recovery is a human step.

## 13. Backend / design mismatches found

All four are recorded on `FIG-APP8-HANDOFF-DEPENDENCY-MAP` (`788:179`) and in the
index §4.14 prose. **None was resolved by inventing a capability.**

| # | Brief expectation | Contract truth | Design response |
|---|---|---|---|
| 1 | Queue shows "concise frozen-spec labels" | `AdminProductionJobQueueItemResponse` publishes **no specification and no `orderCode`** — only `jobId`, `orderId`, `approvalSnapshotId`, `status` and timestamps | Queue is keyed on the three ids plus status/timestamps. No spec column, no `ORD-…` column. Both appear on the detail surface, which does publish them |
| 2 | "Retryable concurrency conflict" state | **No such code exists.** B04 resolves contention with row locks: the loser blocks, re-reads, and receives an ordinary `409` (`PRODUCTION_INVALID_TRANSITION`, `PRODUCTION_ORDER_ON_HOLD`, …) | Designed as the generic "state changed — reload" conflict path. Explicitly **no** automatic-retry flow, and the spec frame says why |
| 3 | Low-stock signal | `lowStockThreshold` and `lowStock` are **published but read-only**; B01 has no threshold-authoring operation | Threshold rendered, never editable; the frame states the absence is a contract fact |
| 4 | "Bounded ledger" | No pagination contract at all — one page plus a `truncated` flag | Truncation banner with no "load more", no infinite scroll, no page numbers |

Two further contract facts shaped the design without contradicting the brief:
`specification` and `reservationSummary` are optional **only** as unreachable-state
fallbacks (the detail query comments say so), so no screen state was designed for
their absence; and `variantLabel` is always absent for a customer-owned product,
which the COP frame renders as an em dash with that reason.

## 14. Confirmation that unsupported capabilities were not invented

```text
INVENTED_CAPABILITIES = 0
```

`FIG-APP8-SCOPE-BOUNDARY` (`788:52`) enumerates fifteen deliberately-absent
capabilities with the reason for each: remaining payment, shipping/delivery,
order cancellation/refund, operator assignment, machine assignment, priority/SLA,
attempts/claims, artifact management, low-stock-threshold authoring, absolute
stock overwrite, manual reservation actions, ledger pagination, an all-SKU stock
list, production-note mutation, and rework-job creation. No customer surface and
no APP9 surface exists anywhere in the package.

## 15. Visual consistency and reuse

`FIG-APP8-REUSE-MAP` (`788:136`) records the mapping. Reused without redrawing:
the Admin shell (`APP1-D01` `385:10`) and the APP7 queue table, cursor pagination
control, status pill, confirmation dialog, input/error field and
skeleton/empty/error patterns (`732:3`, `732:31`, `737:3`, `737:57`, `740:111`,
`741:87`).

```text
NEW_COMPONENT_MASTERS = 0
NEW_INSTANCES         = 0
NEW_VARIABLES         = 0
NEW_TEXT_STYLES       = 0
NEW_PAINT_STYLES      = 0
NEW_EFFECT_STYLES     = 0
HARD_CODED_COLOURS    = 0   (every fill/stroke binds a Semantic/Primitive variable)
IA_ADDITION           = 2 sidenav entries (`Kho`, `Sản xuất`); the shell itself is unchanged
```

Responsive scope follows the existing Admin policy and creates no new one:
Desktop 1440 plus the already-precedented **Narrow 1280**. The single 1280
reduction is hiding the `approvalSnapshotId` column in the queue — a technical
identifier always available on the detail surface. No metric, specification field
or action is dropped at the narrow breakpoint, and nothing below 1280 is designed
(`789:267`).

## 16. Live Figma checker result

```text
node tools/check-figma-design-index.mjs
→ PASS — "Figma Design Index check passed (414 registry IDs, 414 node rows,
   20 registry table(s); canonical files + statuses + deep links + composites verified)."
```

The repository's gate is **static** by construction (index §1 says so). The live
half was therefore executed directly against the file through the Figma MCP after
the registry was finalized:

```text
LIVE_NODE_RESOLUTION   = 41 / 41 resolved, 0 missing
NODE_TYPE              = 41 / 41 FRAME
PAGE_CONTAINMENT       = 41 / 41 under APP_08 (766:3)
UNREGISTERED_FRAMES    = 0   (no frame on the page lacks a registry row)
APP_08_PAGE_CHILDREN   = 1   (the single root section — no stray top-level node)
```

## 17. Targeted validation ledger

| Check | Exact changed input | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| Live preflight (`use_figma`, read-only) | whether `APP_08` and any APP8 rows already existed | PASS — page existed, 0 children | 0 | The only way to avoid a duplicate page; R00's value was re-verified, not trusted |
| Live design-system read | variable collections, text styles, APP7 frame idiom | PASS — 3 collections / 52 variables / 11 text styles | 0 | Ensures reuse of existing tokens rather than new ones |
| `absoluteBoundingBox` containment audit | the 41 new frames and 9 new sections | PASS — 0 escapes, 0 section overlaps, 0 frame overlaps | 1 (after the packing pass) | §18 — a relative-space check would be vacuous |
| Rendered-size cross-check (`get_screenshot` on `771:3`) | the packed root | PASS — `original 9260 × 11032` == root box `9260 × 11032` | 0 | The independent signal that caught the `APP7-D01` reflow defect |
| Text-overflow repair pass | wrapping text vs parent inner width | PASS — 16 clamped over two passes, 0 remaining | 2 | Found by screenshot review of `777:99`; re-run after the final frames |
| Visual review (`get_screenshot`) | `772:3`, `775:3`, `777:99`, `780:3`, `784:3`, `786:70`, `771:3` | PASS | 1 (`780:3` re-shot after the pill fix) | Structural checks cannot see a stretched pill or clipped text |
| Composite/id uniqueness assertion | the 41 generated rows | PASS — 41 unique ids, 41 unique composites | 0 | Fails the row generator before the index is touched |
| `node tools/check-figma-design-index.mjs` | the index gained §4.14, 41 rows, a write target and a changelog entry | PASS | 0 | `CMD-CHECK-FIGMA-DESIGN-INDEX`; the mandated gate for a design checkpoint |
| `git diff --check` | the four changed text files | PASS — no whitespace error | 0 | Cheap, and the only diff-hygiene control this change justifies |
| Report secret scan (scoped, via `findSecretDisclosures`) | the three changed documents | PASS — 0 findings | 0 | Required for a new report |
| `node tools/check-report-secrets.mjs` (repository-wide) | — | **FAIL on a pre-existing file** — see §17.1 | 0 | Run for completeness; the failure is not in this checkpoint's changes |

No passing check was re-run against unchanged input; each rerun above names the
input that changed.

### 17.1 Pre-existing secret-checker failure (not introduced here, not fixed here)

```text
node tools/check-report-secrets.mjs
→ FAIL
  docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93:
  "token" is followed by what looks like a plaintext value.
```

The checker walks **every** tracked `docs/**/*.md`, so it reports a finding in a
report this checkpoint did not write and did not touch (`git status` shows only
the three files in §22 as modified). Scoping the same detector to the three
changed documents returns **0 findings**, which is the evidence this checkpoint
owes.

The APP6-B04 line is left **unrepaired**: it belongs to a closed phase's accepted
report, editing a historical completion report is outside a design checkpoint's
scope, and CLAUDE.md §7 forbids unrelated refactoring. Recorded here rather than
silently skipped, and routed onward as a nonblocking follow-up:

```text
FU-APP8-D01-SECRET-CHECKER-APP6-B04-01
  owner  = APP6 report custodian / next checkpoint that legitimately touches it
  action = redact or rephrase the value on line 93 so the repository-wide
           secret gate is green again
  blocking = no  (design-only checkpoint; no secret is disclosed by APP8-D01)
```

## 18. The geometry trap, and how it was avoided

`APP7-D01` shipped a broken layout because Figma section children carry
**section-relative** `x`/`y`, and its self-check compared relative child boxes
against relative section boxes — self-consistent, so it reported clean while the
canvas was visibly wrong.

This checkpoint placed every frame in section-relative space from the start
(`x = 60`, `y = 120`, siblings spaced along `x`), sized each section from
`max(child.x + child.width)` in the same space, and then verified in a **different**
space: an `absoluteBoundingBox` pass over all 41 frames and 9 sections, plus the
rendered-height cross-check in §17. Both agree with the root box exactly.

## 19. Deliberately-not-run implementation validations

```text
BROAD_REGRESSION = NOT_RUN_BY_DESIGN
```

| Not run | Why |
|---|---|
| Jest — unit, contract, integration | No source file changed. Running them would be confidence, not evidence |
| API integration, inventory race, production transaction suites | No runtime, repository or transaction code was opened |
| Worker suites | No worker code changed |
| Playwright / any E2E | No UI is implemented by a design checkpoint |
| OpenAPI generate/check, API client generate/check | The contract is unchanged; this checkpoint only reads it |
| Drizzle migrations | 0 schema changes |
| Docker, app build | Nothing to build |
| Repository-wide ESLint / Prettier / SonarQube | Forbidden as an aggregate; the changed files are Markdown, and the Markdown-affecting controls that apply were run |

## 20. Design approval and readiness state

Following the `APP3-D01` … `APP7-D01` precedent exactly:

```text
ROW_STATUS        = REVIEW_REQUIRED   (all 41)
APPROVAL_EVIDENCE = —                 (all 41)
SELF_APPROVAL     = NO
A01_UI_IMPLEMENTATION_GATE = CLOSED
```

A human Product Owner must review the package in Figma and promote the rows their
checkpoint consumes, recording an approval-evidence id (the precedent form is
`FIG-APPROVAL-APP8-D01-PO-001`). That promotion is a registry edit only and must
not change any node id, deep link, page/section ownership, screen/state/viewport
or `Last Verified` value. No APP8 frontend checkpoint may start against a
`REVIEW_REQUIRED` row.

## 21. Roadmap next state

```text
R00 = COMPLETE
G01 = COMPLETE (corrected by G01-C1)
B01 = COMPLETE
B02 = COMPLETE
W01 = COMPLETE
B03 = COMPLETE
B04 = COMPLETE
D01 = COMPLETE
A01 = NEXT — BLOCKED_PENDING_PO_DESIGN_APPROVAL
A02 = INCOMPLETE
A03 = INCOMPLETE
E01 = INCOMPLETE
X01 = INCOMPLETE
```

Exactly one `NEXT`. `APP8-A01` is not executable until the design rows it
consumes are promoted by a human.

## 22. Files changed

```text
docs/design/FIGMA_DESIGN_INDEX.md                          +1 write target, +§4.14 (41 rows), +1 changelog entry
docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md status header + §12 checkpoint ledger (D01, A01)
docs/implementation/reports/APP8-D01-COMPLETION-REPORT.md   new (this file)
```

Figma changes are external to the repository and are enumerated by node id in §5.

```text
RUNTIME_CHANGES  = 0
SCHEMA_CHANGES   = 0
OPENAPI_CHANGES  = 0
CLIENT_CHANGES   = 0
WORKER_CHANGES   = 0
```

## 23. Correction budget

```text
APP8-D01-C1 = AVAILABLE (unused)
APP8-D01-C2 = DOES NOT EXIST
```

## 24. Stop condition

```text
APP8-D01 = COMPLETE
DESIGN_PACKAGE = READY_FOR_PO_REVIEW
NEXT_IMPLEMENTATION_CHECKPOINT = BLOCKED_PENDING_PO_DESIGN_APPROVAL
NOT_PUSHED = true
```

`APP8-A01` was not started.
