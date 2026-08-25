# APP8-A01 — Admin Inventory (SKU Stock Workspace)

## 1. Verdict

```text
APP8-A01 = COMPLETE
NEXT_CHECKPOINT = APP8-A02
NOT_PUSHED = true
```

The Product Owner's approval of the **complete** `APP8-D01` package is recorded
in the canonical registry, and the first Admin inventory surface is delivered
against those approved rows: a SKU-scoped stock workspace that renders the
server's own figures, offers exactly one audited write, and invents no
capability the backend does not publish. No backend, schema, worker, OpenAPI or
generated-client change was made.

## 2. Branch and commit evidence

```text
BRANCH        = production
ENTRY_HEAD    = 3f478d6ffae47c74f11ef4bf77d68203de69a2e8
                docs(app8): deliver the Figma design package for inventory and
                production (APP8-D01)
FINAL_COMMIT  = recorded by the commit that carries this report
PUSHED        = no
```

The commit hash is not restated in a second commit: this report is committed
*with* the implementation, so the hash is the commit's own.

## 3. Product Owner design approval recorded

```text
APPROVAL_EVIDENCE = FIG-APPROVAL-APP8-D01-PO-001
A01_UI_IMPLEMENTATION_GATE = OPEN
```

Recorded in `docs/design/FIGMA_DESIGN_INDEX.md` §4.14, in the same wording and
the same position as `APP7-A01` recorded `FIG-APPROVAL-APP7-D01-PO-001`. The
`APP8-D01` completion report keeps its no-self-approval verdict, which remains
true: the approval is external and human.

## 4. Registry promotion result

| Fact | Value |
|---|---|
| Rows promoted | **41 / 41** (`REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION`) |
| Approval evidence written | `FIG-APPROVAL-APP8-D01-PO-001` on all 41 |
| APP8 rows still `REVIEW_REQUIRED` | **0** |
| Rows outside `APP8-D01` touched | **0** (44 other `REVIEW_REQUIRED` occurrences before and after) |
| Node ids changed | **0** |
| Deep links changed | **0** |
| Screen/state/viewport identity changed | **0** |
| Frame ownership changed | **0** |
| `Last Verified` changed | **0** — all remain `2026-08-25` |
| Figma nodes opened for mutation | **0** |

The whole package was promoted rather than only the thirteen rows `APP8-A01`
consumes, because the approval the Product Owner granted was for the whole
package. `APP8-A02` and `APP8-A03` therefore start against approved rows without
a second promotion, and `APP8-D01-C1` remains **unused**.

Reads against the live Figma file were **read-only** (`get_design_context`,
`get_metadata`) and were made to transcribe copy and layout, not to alter
anything.

## 5. Route implemented

```text
/kho/skus/{skuId}
```

Segment: `apps/admin/src/app/(protected)/kho/skus/[skuId]/page.tsx`, inside the
existing authenticated route group, whose layout already resolves the session
and renders the shell. The route identity is the one the approved D01 package
fixes (`775:27` breadcrumb `Quản trị / Kho / SKU`).

**No all-SKU list route exists**, and none was built: `APP8-B01` exposes stock
**by SKU** and publishes no all-SKU availability query.

### Navigation — deliberately not added, and why

`775:20` draws a `Kho` sidenav entry. It was **not** implemented. The Admin
shell's navigation model states its own rule — *"Every item points at a route
that exists — the shell never renders an anchor to an unbuilt screen"* — and a
`Kho` entry needs a parameterless `/kho` destination, which would be the all-SKU
list §15 forbids. The brief's condition ("if … consistent with the existing
Admin shell") is therefore not met, so global navigation was not redesigned.

Reachability instead comes from the one place in the Admin app that holds a
`skuId`: the order-detail items table renders a per-line **"Xem tồn kho"** link
for catalog lines. It adds no column and no request, and a customer-owned line
has no SKU so it cannot appear on one. This is the minimal navigation needed to
reach the route; it is recorded as a change to an APP7 file in §15.

## 6. Approved Figma nodes consumed

| Registry ID | Node | Use |
|---|---|---|
| `FIG-APP8-A01-STOCK-DEFAULT-DESKTOP` | `775:3` | Page frame, context card, metrics, ledger head/table, source notes |
| `FIG-APP8-A01-STOCK-LOWSTOCK-DESKTOP` | `775:101` | Low-stock pill and banner; negative-availability tone |
| `FIG-APP8-A01-STOCK-NEWANCHOR-DESKTOP` | `776:3` | Never-counted lead, empty-history state, no-threshold note |
| `FIG-APP8-A01-STOCK-LOADING-DESKTOP` | `776:54` | Skeleton preserving the final layout |
| `FIG-APP8-A01-STOCK-ERROR-DESKTOP` | `776:142` | Not-found, server-failure and session-expired states |
| `FIG-APP8-A01-ADJUST-DEFAULT` | `777:3` | Adjustment form, consequence note, preview note |
| `FIG-APP8-A01-ADJUST-VALIDATION` | `777:33` | Field errors and the "blocked locally" note |
| `FIG-APP8-A01-ADJUST-SUBMITTING` | `777:60` | Pending state and its instruction not to resend |
| `FIG-APP8-A01-ADJUST-SUCCESS` | `777:83` | Success report and the ledger-is-the-rebuild-source note |
| `FIG-APP8-A01-ADJUST-NEGATIVE-REFUSAL` | `777:99` | 409 refusal, override explanation, "Sửa chênh lệch" |
| `FIG-APP8-A01-LEDGER-TRUNCATED` | `777:125` | Bounded-history banner; no pagination |
| `FIG-APP8-REFUSAL-INVENTORY` | `787:94` | Refusal vocabulary for 409/404/400/401/403/500 |
| `FIG-APP8-A01-STOCK-NARROW` | `789:3` | Narrow-1280 metric wrap and table behaviour |

All thirteen are `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP8-D01-PO-001`, and `test/boundary/sku-stock-source.test.ts`
asserts that on every one of them.

## 7. Generated-client operations consumed

```text
adminSkuStock_get      GET  /api/admin/skus/{skuId}/stock          -> adminSkuStockGet
adminSkuStock_adjust   POST /api/admin/skus/{skuId}/stock/adjustments -> adminSkuStockAdjust
adminSkuStock_ledger   GET  /api/admin/skus/{skuId}/stock/ledger   -> adminSkuStockLedger

NEW_HTTP_OPERATIONS   = 0
OPENAPI_REGENERATED   = no
CLIENT_REGENERATED    = no
GENERATED_FILES_EDITED = 0
```

The three operations already existed in the generated tree from `APP8-B01`;
they were not re-exported on the `@embroidery/api-client` **public boundary**,
which is a hand-written index every prior frontend checkpoint extends the same
way. Adding those re-exports (three functions and four types) is the only change
to that package. It is not a contract change: no OpenAPI artifact, no generated
file and no operation shape was touched, and both
`packages/api-client` contract tests still pass.

No enum crosses as a value: the screen renders `entryKind` as the stored token
and never branches on it, so importing the vocabulary would create a second
place for it to drift.

## 8. Stock metrics behavior

- All four figures — `quantityOnHand`, `heldQuantity`, `reservedQuantity`,
  `available` — are rendered **exactly as `adminSkuStock_get` published them**.
- `available` is **never recomputed**. A regression test feeds a response whose
  `available` (21) deliberately disagrees with `onHand − held − reserved` (25)
  and asserts the screen shows **21**. The server computes it under the
  `sku_stocks` row lock; a client recomputation would disagree the moment a
  reservation landed between two renders.
- A **negative** `available` renders as the number in the error tone
  (`775:151`). It is not clamped, not hidden and never described as corrupt —
  reservations exceeding on-hand is a valid consequence of the reservation
  model.
- `lowStock` is the server's flag. The banner states the semantics the design
  fixes: it compares **on-hand** with the threshold; holds and reservations do
  not raise it.
- `lowStockThreshold` is **read-only**. There is no threshold control anywhere;
  a test asserts the whole screen exposes no text input while the dialog is
  closed.
- When `lowStockThreshold` is **absent**, no threshold is inferred, no fallback
  is offered, and **no pill is rendered** — with no threshold configured the
  server's `lowStock` is always `false`, which is the absence of a judgement
  rather than a healthy one, and `776:3` draws no pill either.
- The stock-anchor identity (`skuStockId`) is displayed alongside `skuId`.

### One design/contract mismatch, recorded rather than resolved by invention

`775:33` draws a SKU **code** (`TEE-BLK-M-001`) as the card's heading.
`AdminSkuStockResponse` publishes **no `skuCode`** — only `skuId` and
`skuStockId` — and A01 may not open a Catalog read to find one. The card
therefore shows the shortened `skuId` where the frame shows the code, with both
full identifiers beneath and in `title`. Nonblocking finding `FU-APP8-A01-01`
(§20).

## 9. Adjustment behavior

**Input.** Exactly two fields. The body on the wire is exactly
`{ delta, reason }`, built in one place:

- `delta` — a signed integer, non-zero, within the published `int32` band. A
  **decimal is rejected, not truncated**: truncating `-2.5` to `-2` would submit
  a quantity nobody asked for. The control is a text field with
  `inputMode="numeric"`, following the Admin convention that forbids
  `type="number"` where the stored value must be what the operator typed.
- `reason` — mandatory, validated on its trimmed form, **submitted as typed**.
  Whitespace-only is refused.
- **No absolute overwrite** exists anywhere. A test asserts the dialog has
  exactly two text inputs.
- Client validation mirrors the accepted `AdjustSkuStockBody` schema exactly —
  nothing loosened, nothing invented — and every locally-refused case is one the
  server would answer `400`.

**Submit.** The submit button is disabled while in flight **and** the controller
refuses a second `submit()` regardless, so neither a double click nor a keyboard
repeat can send the operation twice. A test drives a click against a disabled
button mid-flight and asserts exactly one call. No metric is optimistically
mutated: the page behind the dialog keeps showing the server's figures until the
write returns.

Dismissal is refused while submitting, including `Escape`. This is **stricter
than `777:79`**, which draws the cancel button in its ordinary treatment; the
frame's own note (`777:77` — *"Không đóng cửa sổ và không bấm lại"*) is what
settles it, and closing over a running write would leave the operator with no
way to learn how it ended.

**Success.** The dialog reports **two server readings** — the record as it stood
before the write, beside the record `adminSkuStock_adjust` returned with it.
Nothing adds the delta to anything. Both queries are then invalidated and
re-read, and the page renders the refreshed server figures (tested).

## 10. Error and refusal mapping

Classified from HTTP status and business code only; **nothing reads
`normalized.message`** (asserted by the source-boundary test). No raw backend
code is ever the only copy — each state has a Vietnamese title and an action
sentence, with the technical code as an engineer-facing annotation, exactly as
`787:94` requires.

| Condition | Classification | Rendered |
|---|---|---|
| `409` + `INVENTORY_STOCK_WOULD_GO_NEGATIVE` | `negativeStock` | "Điều chỉnh sẽ làm tồn kho âm" + the arithmetic + "không có gì được ghi" + the override explanation + **Sửa chênh lệch** |
| `404` (`INVENTORY_SKU_NOT_FOUND`) — read | `missing` | "Không tìm thấy SKU" + catalog link + retry |
| `404` — write | `missing` | "Không tìm thấy SKU · không có gì được ghi" |
| `400` — write | `invalid` | Field errors in place; the request is stopped **before** it is sent in every case the UI can produce |
| `401` | `unauthenticated` | "Phiên đăng nhập đã hết hạn" + sign-in; **no retry offered**, because none could succeed |
| `403` | `forbidden` | "Thao tác bị từ chối" |
| `5xx` — read | `retryable` | "Không tải được tồn kho" + reload |
| `5xx` — write | `ambiguous` | Treated as **unknown**, not as failure (see below) |
| no response line | `ambiguous` | "Chưa biết kết quả"; stock re-read; **no resend offered** |

**The negative-stock refusal is answered with re-read truth.** It states an
arithmetic fact ("on hand is 8; −20 would reach −12"), so quoting the figure the
dialog was opened with could state a number that has since changed. The refusal
therefore re-reads the stock record and quotes that. The delta is **not clamped**
— how much less to remove is the operator's decision — and the entered delta and
reason survive so they can make it. Nothing is resubmitted: `APP8-B01` publishes
no idempotency key for this operation, so a resend is a *second* adjustment.
There is no retry loop anywhere in the feature (asserted).

A `5xx` on the write is deliberately **not** reported as a failure: the platform
replaces a 5xx code and message with a generic pair, so nothing distinguishes
"refused" from "committed then failed to answer".

## 11. Ledger and truncation

- Five columns, one per published field: `entryKind`, `quantity`, `onHandDelta`,
  `reason`, `occurredAt`. Nothing else — the ledger carries no order, no
  customer, no reservation holder and no operator identity, so no column invents
  one.
- An **absent** `reason` renders as `—` in the muted tone. Absent is not empty
  and not unknown: a hold that was placed simply has no reason.
- `onHandDelta` renders `+20` / `−25` / `0`. The **sign is text**, so the column
  reads correctly with no colour at all.
- `truncated === true` renders the approved bounded-history notice; `false`
  renders **nothing** — no empty band (`777:170`).
- **No pagination affordance of any kind.** The source-boundary test asserts the
  feature contains no `cursor`, no `useInfiniteQuery` and no `nextPage`, and a
  rendered test asserts no load-more / next-page control exists in the truncated
  state.
- The ledger is a **separate query**, so a history that cannot be read leaves
  the metrics intact and offers its own retry (tested).

## 12. Loading, empty and responsive behavior

- **Loading** (`776:54`): a skeleton reproducing the final layout — context
  strip, four metric cards, five table rows — so nothing reflows when the answer
  arrives. `role="status"` with a real sentence; the bars are `aria-hidden`.
- **Never counted** (`776:3`, `776:47`): derived from server truth — the stock
  read succeeded *and* the separate ledger read returned an empty array. It
  renders real zeros, the ordinary-empty explanation and the adjustment CTA. It
  is never confused with a failure, no quantity is fabricated, and **no
  adjustment is auto-submitted** (tested).
- **Responsive** (`789:3`): the four metric cards carry their own flex basis and
  wrap. At the 1440 content column all four fit; at the approved narrow 1280
  they do not, so they fall into the 2×2 grid the frame draws. **Nothing is
  hidden at any width** — the stylesheet contains no `display: none` and no
  `visibility: hidden` (asserted). The ledger table scrolls inside its own
  `overflow-x: auto` container so the Admin body never scrolls horizontally.
  No new mobile Admin policy was invented.

## 13. Accessibility

- Every control has a real `<label for>` via the shared `AdminTextField`; field
  errors are wired through `aria-describedby` with `aria-invalid`, so the reason
  a field is refused is announced **with** the field (tested).
- The dialog moves focus in on mount, traps `Tab`/`Shift+Tab`, and restores
  focus to its trigger on close.
- "Xem lịch sử chuyển động" closes the dialog and moves focus to the history
  heading, after the dialog's own focus restoration rather than racing it.
- Loading and status meaning is never colour-only: the skeleton carries a
  sentence, the status pill carries a symbol **and** a text label, and every
  signed ledger figure carries its sign as text.
- Required fields say "bắt buộc" **inside the label**, so the requirement is
  announced with the control. `777:9` draws it as a separate chip beside the
  label; encoding it in the label text was chosen over adding a `required` prop
  to the shared `AdminTextField`, which would have pulled several unrelated
  features' tests into this checkpoint's impact (§16 forbids the broader run).

## 14. Shared component reuse

Reused unchanged: `AdminTextField` (labels, help/error wiring, `aria-invalid`),
`AdminStatusBadge` (the low-stock pill — symbol + label + tone),
`truncateIdentifier`, `formatInstant`, the `(protected)` layout and Admin shell,
`getBrowserApiClient`, `normalizeApiClientError`, the `@embroidery/styles` token
foundation, and the feature-owned-leaf-stylesheet composition in
`src/styles/main.scss`.

### `FU-ADMIN-SHARED-DIALOG-01` — carried, not half-paid

The Admin app has no accepted shared dialog; it has seven hand-rolled ones, one
per capability that needed a modal. A01 adds an eighth. Borrowing
`order-detail`'s copy would couple inventory to the payment workspace for
markup; promoting one into `src/shared` for a single caller would create the
shared abstraction without doing any of the work of reconciling the other seven,
making the follow-up harder rather than closing it. Closing it properly is a
debt-only refactor across seven features, which §14 explicitly says not to
start. **The follow-up remains open and unowned**, and the reasoning is recorded
in `stock-dialog.tsx` itself.

## 15. Exact changed files

**New — feature (`apps/admin/src/features/sku-stock/`)**

```text
index.ts
model/sku-stock-route.ts
model/sku-stock-keys.ts
model/sku-stock-copy.ts
model/sku-stock-failure.ts
model/stock-adjustment-form.ts
model/stock-presentation.ts
services/sku-stock.service.ts
services/stock-adjustment.service.ts
hooks/use-sku-stock-queries.ts
hooks/use-stock-adjustment.ts
components/sku-stock-screen.tsx
components/sku-stock-header.tsx
components/sku-stock-metrics.tsx
components/sku-stock-skeleton.tsx
components/sku-stock-failure-state.tsx
components/low-stock-note.tsx
components/stock-ledger-section.tsx
components/stock-ledger-table.tsx
components/stock-dialog.tsx
components/stock-adjustment-dialog.tsx
components/stock-adjustment-form.tsx
components/stock-adjustment-outcome.tsx
styles/sku-stock.scss
styles/_sku-stock-layout.scss
styles/_sku-stock-panels.scss
styles/_sku-stock-dialog.scss
```

**New — route and tests**

```text
apps/admin/src/app/(protected)/kho/skus/[skuId]/page.tsx
apps/admin/test/components/sku-stock-render.test.tsx
apps/admin/test/components/sku-stock-adjustment.test.tsx
apps/admin/test/boundary/sku-stock-source.test.ts
apps/admin/test/support/sku-stock-fixture.ts
```

**Modified**

| File | Change |
|---|---|
| `apps/admin/src/styles/main.scss` | one `@use` for the feature's leaf stylesheet |
| `packages/api-client/src/index.ts` | re-export the three existing `APP8-B01` operations and four types on the public boundary |
| `apps/admin/src/features/order-detail/model/order-item-presentation.ts` | publish the catalog line's `skuId` on the row |
| `apps/admin/src/features/order-detail/model/order-detail-copy.ts` | one new string, `items.stockLink` |
| `apps/admin/src/features/order-detail/components/order-items-table.tsx` | render the per-line "Xem tồn kho" link |
| `apps/admin/src/features/order-detail/styles/_order-tables.scss` | style that link; no column added |
| `docs/design/FIGMA_DESIGN_INDEX.md` | 41-row approval promotion + §4.14 approval paragraph |
| `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | §12 status; header status |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP8 cell; `NEXT_CHECKPOINT` |

## 16. File-size disposition

Every new source file is within the 400-line hard limit and every new test file
within the 600-line limit. Largest new files: `_sku-stock-panels.scss` (304),
`sku-stock-adjustment.test.tsx` (263), `sku-stock-render.test.tsx` (246),
`sku-stock-source.test.ts` (198), `sku-stock-copy.ts` (197),
`use-stock-adjustment.ts` (189).

`_sku-stock-panels.scss` is the one new file above the 300-line **review
threshold**. It is a single responsibility — the panel/banner/table/skeleton
treatments every state of the screen is built from — and splitting it by line
range would break the cascade order its sibling partials depend on. Recorded
rather than split arbitrarily.

`node tools/check-file-size.mjs` reports **80 hard-limit violations both before
and after** this checkpoint; **none** is in a file A01 created. One is a file A01
**modified**: `packages/api-client/src/index.ts` was already failing at 1078
lines and is now **1106** (+28). It is the hand-written re-export boundary every
frontend checkpoint since APP1 has extended; splitting it is a package-wide
refactor outside A01's scope and outside §19. Recorded as `FU-APP8-A01-02`.

## 17. Focused test ledger

| Command / check | Exact changed question | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `node tools/check-figma-design-index.mjs` | 41 rows changed status and gained approval evidence | **PASS** — 414 registry IDs, 414 node rows, 20 tables; canonical files + statuses + deep links + composites verified | 1 | The registry-integrity gate, run once after the promotion, exactly as §17 requires |
| `pnpm --filter @embroidery/admin exec tsc --noEmit` | a new feature graph, new client imports, `exactOptionalPropertyTypes` | **PASS** | 3 — first run found the missing public re-exports, a tone widened past what the stylesheet defines, and two optional-property writes; second and third after each fix | The smallest Admin workspace typecheck; the only thing that proves the new graph lines up with the accepted contract |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | four types and three functions added to the public boundary | **PASS** | 1 | The package whose surface changed |
| `pnpm --filter @embroidery/api-client exec jest src/public-api.smoke.test.ts src/generated-client.contract.test.ts` | the public surface gained exports | **PASS** (21) | 1 | The two suites that assert what the boundary publishes; run because the boundary is what changed |
| `pnpm --filter @embroidery/admin exec jest test/components/sku-stock-render.test.tsx` | render, metrics, negative available, thresholds, never-counted, truncation, loading, 404/500/401, ledger-only failure | **PASS** (17) | 1 | Proofs **A**, **E**, **F**, **G** |
| `pnpm --filter @embroidery/admin exec jest test/components/sku-stock-adjustment.test.tsx` | body on the wire, duplicate submit, invalid input, success refresh, 409 refusal, ambiguous transport | **PASS** (13) | 2 — an `act()` warning from a deliberately-unsettled promise; the test now lets the single in-flight write finish | Proofs **B**, **C**, **D** |
| `pnpm --filter @embroidery/admin exec jest test/boundary/sku-stock-source.test.ts` | operation set, no invented capability, no availability recomputation, no cache flush, narrow-viewport layout, approved registry rows | **PASS** (15) | 2 — the first run caught the copy module printing the endpoint on screen, which is display text and is now the rule's one named exemption | Proof **H**, plus everything a rendered test cannot see |
| `pnpm --filter @embroidery/admin exec jest test/components/order-detail-render.test.tsx test/components/order-navigation.test.tsx` | the APP7 items table and its row model changed | **PASS** (16) | 1 | §16: the test files directly affected by the shared change, and only those |
| `pnpm --filter @embroidery/admin build` | a new App Router segment and a new SCSS leaf | **PASS** — `/kho/skus/[skuId]` registered; SCSS compiled | 1 | The only executable proof the new stylesheet compiles and the route resolves; the `sass` CLI cannot resolve `@use '@embroidery/styles'` outside Next's loader |
| `pnpm exec prettier --write` (changed governed files only) | formatting of the changed files | **PASS** | 1 | Global control, applied to the changed files only |
| `pnpm --filter @embroidery/admin lint` | ESLint over the changed workspace | **PASS for every file A01 touched** | 2 — one `eslint-disable` of mine named a rule this config does not define; removed | Global control at the smallest supported Admin scope. See §20 for the one pre-existing error |
| `pnpm --filter @embroidery/api-client lint` | ESLint over the other changed workspace | **PASS**, clean | 1 | Same control, second changed workspace |
| `node tools/check-styling-boundaries.mjs` | a new SCSS leaf and an edited APP7 partial | **19 violations before and after; 0 in `apps/admin`, 0 in A01 files** | 2 (once on the change, once on a stashed baseline to prove the count is identical) | `CMD-CHECK-STYLES`, required by any styling change |
| `node tools/check-file-size.mjs` | 27 new source files and 4 new test files | **80 violations before and after; 0 in files A01 created** | 2 (change + stashed baseline) | §18 |

No passing command was repeated against unchanged input; every rerun above names
the input that changed.

## 18. Tests deliberately not run, and why

| Not run | Why |
|---|---|
| `APP8-B01` / `B02` / `B03` / `B04` API and unit suites | Explicitly forbidden by §16. No backend file changed; B01's evidence is accepted |
| Inventory DB race suites, `inventory-races`, `inventory-reservations` | No persistence, reservation or concurrency code was touched |
| Worker suites | No worker file changed |
| Production suites | `APP8-A02`/`A03` are unstarted; no production code was opened |
| Full monorepo Jest, all Admin tests, all API tests | Forbidden without a demonstrated changed dependency; the shared change's real blast radius is two APP7 test files, and those were run |
| Playwright / any E2E project | §16 forbids a broad Playwright run solely for viewport proof. The 1280 behaviour is settled at the stylesheet, which is where it lives — jsdom applies no CSS, so a rendered test at 1280 would assert nothing |
| APP7 acceptance / payment suites | Untouched. The two APP7 files edited are the items table and its row model; their own tests were run |
| DB9 benchmarks | No query, plan or index changed |
| OpenAPI generate/check, client generate/check | No contract changed. Regenerating would produce an identical artifact and prove nothing |
| SonarQube | Reserved by the repository's checkpoint workflow for the phase/closure policy; a single Admin screen does not trigger it. Recorded rather than silently skipped |

## 19. Figma-index checker result

```text
node tools/check-figma-design-index.mjs
Figma Design Index check passed
(414 registry IDs, 414 node rows, 20 registry table(s);
 canonical files + statuses + deep links + composites verified).
```

Run **once**, after the approval-status edit. No live geometry check was
re-run: the design is approved and no implementation ambiguity in a specific
frame required one.

## 20. Nonblocking findings

| Id | Finding |
|---|---|
| `FU-APP8-A01-01` | **Design/contract mismatch — SKU code.** `775:33` heads the card with a SKU code; `AdminSkuStockResponse` publishes none. A01 shows the shortened `skuId` instead. Resolving it needs either a `skuCode` on the B01 response or an accepted Catalog read — a backend decision, not a UI one |
| `FU-APP8-A01-02` | **`packages/api-client/src/index.ts` is 1106 lines**, over the 400-line hard limit. Pre-existing (1078 at entry); A01 added 28. Splitting the public boundary is a package-wide refactor |
| `FU-APP8-A01-03` | **Route language is inconsistent with the Admin IA.** `/kho/skus/{skuId}` is the D01-approved identity and was implemented as briefed, but every other Admin route is an English slug (`/orders`, `/products`, `/requests`). `APP8-A02` will add `/san-xuat`. Worth a deliberate IA ruling before the phase closes rather than after |
| `FU-APP8-A01-04` | **No sidenav entry for inventory**, because there is no parameterless destination to point at (§5). Reachability is the per-line order-detail link. If `APP8-E01` wants a `Kho` nav entry, it needs an all-SKU stock list, which needs an operation `APP8-B01` deliberately did not build |
| `FU-APP8-A01-05` | **Pre-existing ESLint error**, unrelated: `test/components/request-quotation-bootstrap.test.tsx:35` — unused `UNKNOWN_REQUEST_STATUS_LABEL` (APP6). Present at the stashed baseline; not fixed here (§19 forbids unrelated repair) |
| `FU-APP8-A01-06` | **Pre-existing styling-gate violations**: 19, all in `apps/storefront`, identical before and after |
| `FU-ADMIN-SHARED-DIALOG-01` | **Still open**, now eight hand-rolled Admin dialogs. Carried deliberately (§14) |

## 21. Roadmap

```text
R00 = COMPLETE
G01 = COMPLETE (corrected by G01-C1)
B01 = COMPLETE
B02 = COMPLETE
W01 = COMPLETE
B03 = COMPLETE
B04 = COMPLETE
D01 = COMPLETE / PO APPROVED
A01 = COMPLETE
A02 = NEXT
A03 = INCOMPLETE
E01 = INCOMPLETE
X01 = INCOMPLETE
```

Exactly one `NEXT`.

## 22. Stop

```text
APP8-A01 = COMPLETE
NEXT_CHECKPOINT = APP8-A02
NOT_PUSHED = true
```

`APP8-A02` is **not** started.
