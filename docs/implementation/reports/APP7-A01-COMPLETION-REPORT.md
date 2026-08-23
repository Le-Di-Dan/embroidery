# APP7-A01 — Completion Report

## Admin Order + Deposit Payment / Reconciliation Workspace

- Phase: `APP7 — Deposit Payment and Order Creation`
- Checkpoint: `APP7-A01`
- Mode: `IMPLEMENTATION / ADMIN FRONTEND`
- Date: 2026-08-24

---

## 1. Verdict

```text
APP7-A01 = COMPLETE
CHECKPOINT_SCOPE = ADMIN_ORDER_AND_DEPOSIT_PAYMENT_WORKSPACE

D01_PRODUCT_OWNER_APPROVAL =
  FIG-APPROVAL-APP7-D01-PO-001

D01_REGISTRY_ROWS_APPROVED = 39
D01_REVIEW_REQUIRED_REMAINING = 0
A01_UI_IMPLEMENTATION_GATE = OPEN_AND_CONSUMED

ADMIN_ROUTES =
  /orders
  /orders/{orderId}

ORDER_QUEUE = IMPLEMENTED
ORDER_DETAIL = IMPLEMENTED
PAYMENT_PANEL = IMPLEMENTED
VERIFY = IMPLEMENTED
REVIEW = IMPLEMENTED
EVIDENCE_PREVIEW = IMPLEMENTED
RECONCILIATION_HISTORY = IMPLEMENTED

EXPECTED_VS_OBSERVED = SEPARATED
OBSERVED_REFERENCE_UI_PATTERN = NONE
OBSERVED_REFERENCE_UI_MAX_LENGTH = NONE
ZERO_EVIDENCE_VERIFY = SUPPORTED

NETWORK_AMBIGUITY_RECONCILIATION = IMPLEMENTED
STALE_CONCURRENT_STATE_REFRESH = IMPLEMENTED

B06_LOCATOR = evidenceId
RAW_ASSET_ID_USAGE = NONE
PRIVATE_BLOB_URL_LIFECYCLE =
  createObjectURL after a successful fetch ·
  revoked on replacement, on dialog close and on unmount ·
  gcTime 0, staleTime 0, retry false ·
  never stored, logged, routed or held in module state

PROVIDER_UX = NONE
REMAINING_PAYMENT_UX = NONE
INVENTORY_PRODUCTION_UX = NONE

BACKEND_CHANGE = NONE
SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE
OPENAPI_CHANGE = NONE

FOCUSED_TESTS = 12 suites / 118 tests — PASS
PLAYWRIGHT = NOT_RUN_BY_DESIGN
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-S01
```

---

## 2. Product Owner approval, recorded before any UI work

The gate was opened first and nothing else was touched until the registry check
passed.

```text
APP7-D01 = COMPLETE — PRODUCT_OWNER_APPROVED
FIGMA_APPROVAL_ID = FIG-APPROVAL-APP7-D01-PO-001

APP7_D01_REGISTRY_ROWS = 39
APPROVED_FOR_IMPLEMENTATION = 39
REVIEW_REQUIRED = 0
```

All **39** `FIG-APP7-*` rows in `docs/design/FIGMA_DESIGN_INDEX.md` were promoted
`REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` with approval evidence
`FIG-APPROVAL-APP7-D01-PO-001`, following the `APP6-D01` precedent verbatim
(§4.12 of the registry).

**A registry edit only.** No Figma node was opened for mutation. Node ids, deep
links, file key, page/section ownership, screen/state/viewport metadata and
owning phase are byte-identical; `Last Verified` is deliberately unchanged at
`2026-08-23`, because it records when a row was last checked against the live
file, which a human approving a design does not re-perform. The other **13**
`REVIEW_REQUIRED` rows in the file (non-APP7) were counted before and after and
are untouched.

**The historical record is preserved.** `APP7-D01-COMPLETION-REPORT.md` was not
rewritten and keeps `SELF_APPROVAL = NO`, which remains true — the approval
recorded here is external and human. The registry states both facts side by
side, so neither contradicts the other.

Gate evidence:

```text
node tools/check-figma-design-index.mjs
→ PASS (373 registry IDs, 373 node rows, 19 registry tables;
        canonical files + statuses + deep links + composites verified)
```

Run twice, and both runs are against changed input rather than for confidence:
once immediately after the 39 rows were promoted, and once at the end because
the repository-wide Prettier pass rewrote `FIGMA_DESIGN_INDEX.md` along with the
other changed files. The second run is the one that certifies the committed
bytes. It was not re-run after that.

---

## 3. Approved design nodes consumed

Read in full from the live file through `get_design_context` before any
component was written, as `CLAUDE.md` §3 requires.

| Registry ID | Node | What it governed |
|---|---|---|
| `FIG-APP7-A01-QUEUE-DEFAULT-DESKTOP` | `732:3` | Queue columns, cursor pagination, filter scope statement, nav placement |
| `FIG-APP7-A01-QUEUE-FILTER-DESKTOP` | `732:110` | Status **multi-select** over the eleven contract values, "Tất cả" resting state, token beside each label |
| `FIG-APP7-A01-DETAIL-AWAITING-DESKTOP` | `734:3` | Two-column layout, frozen facts card, order-line table, size-absence rule, deposit card, attempts, zero-evidence state, action card |
| `FIG-APP7-A01-DETAIL-EVIDENCE-DESKTOP` | `736:3` | Evidence list with per-state preview affordance (read via `get_metadata` for its evidence card, `736:149`…`736:210`) |
| `FIG-APP7-A01-VERIFY-EMPTY-DESKTOP` | `737:3` | Expected/observed separation, three required fields, the no-prefill rule, the reference non-constraints |
| `FIG-APP7-A01-VERIFY-SUCCESS-DESKTOP` | `740:3` | Exact-success panel, three-fact state table, APP8/APP9 exclusion note |
| `FIG-APP7-A01-VERIFY-MISMATCH-DESKTOP` | `740:56` | `REQUIRES_REVIEW` as a durable business outcome, the "not a failure" rule |
| `FIG-APP7-A01-REVIEW-FORM-DESKTOP` | `740:111` | Required reason, optional observations, no caller-chosen status |
| `FIG-APP7-A01-REVIEW-RESOLUTION-DESKTOP` | `741:3` | Reopen-verify resolution, no resolve endpoint, `RESOLVE_REVIEW` evidence |
| `FIG-APP7-A01-NETWORK-AMBIGUITY` | `741:51` | The five-step lost-response recovery |
| `FIG-APP7-A01-STALE-CONFLICT` | `741:87` | The four-step concurrent-conflict reconciliation, and the language ban |
| `FIG-APP7-A01-EVIDENCE-PREVIEW-ACCEPTED` | `742:3` | Lightbox, metadata sidebar, `evidenceId` addressing, eligible-only navigation |
| `FIG-APP7-A01-EVIDENCE-PREVIEW-BLOCKED` | `743:3` | `UPLOADED`/`INSPECTING`/`REJECTED` blocked states and their exact wording |
| `FIG-APP7-A01-RECONCILIATION-HISTORY` | `743:35` | History columns, absent-field rule, long-reference truncation rule |
| `FIG-APP7-MATRIX-STATE-COPY` | `751:3` | Every Vietnamese label, and the three-groups-never-collapse rule |
| `FIG-APP7-ACCESSIBILITY-SPEC` | `753:120` | Symbol vocabulary, colour-is-never-the-message, dialog focus rules |

`FIG-APP7-MATRIX-TRUTH` (`751:175`), `FIG-APP7-RESPONSIVE-SPEC` (`753:3`),
`FIG-APP7-REUSE-MAP` (`753:179`) and `FIG-APP7-HANDOFF-DEPENDENCY-MAP` (`754:3`)
were consulted through the `APP7-D01` report's transcription of them. The 15
`APP7-S01` customer frames were **not** consumed — they belong to the next
checkpoint.

The Admin shell is reused unchanged from `APP1-D01` (`385:10`); A01 fills the
content area and redraws no shell.

---

## 4. API-client operations consumed, and the curated export

Six operations, all pre-existing and unchanged:

| Operation | Method and path | Surface |
|---|---|---|
| `adminOrderList` | `GET /api/admin/orders` | Queue |
| `adminOrderDetail` | `GET /api/admin/orders/{orderId}` | Detail — frozen facts |
| `adminOrderPaymentRead` | `GET /api/admin/orders/{orderId}/payments` | Deposit workbench |
| `adminPaymentAttemptVerify` | `POST /api/admin/payment-attempts/{attemptId}/verify` | Verification |
| `adminPaymentAttemptReview` | `POST /api/admin/payment-attempts/{attemptId}/review` | Manual review |
| `adminPaymentEvidenceGet` | `GET /api/admin/payment-evidence/{evidenceId}/content` | Private preview (`Blob`) |

The generated names differ mechanically from the plan's `adminOrder_list` style;
the delivered camelCase names are used.

**Curated export change** — one block appended to `packages/api-client/src/index.ts`
(+83 lines, 0 deletions, nothing removed or reordered):

- the six operations;
- 14 status enums as **values**, so the queue's filter options and every label
  are derived from the contract rather than a hand-kept list — `AdminOrderListStatusItem`
  above all, which is what the eleven checkboxes are built from;
- 12 response and body **types**.

`APP7-B06` deliberately deferred its export to this checkpoint on the delivered
`APP5-B06` → `APP5-A02` precedent; `B02` and `B04` crossed here for the same
reason. No `export *`, no generated file edited, no OpenAPI regeneration.

---

## 5. Architecture and reuse

Two features, mirroring the delivered `custom-request-queue` / `custom-request-detail`
split exactly:

```text
apps/admin/src/features/order-queue/     19 files   (queue)
apps/admin/src/features/order-detail/    33 files   (detail + deposit workbench)
apps/admin/src/shared/status/             2 files   (shared Admin status badge)
apps/admin/src/shared/presentation/       4 files   (order status, amount, instant, identifier)
```

Nothing new was introduced: one `QueryClient` (the app provider), one Axios
instance (`getBrowserApiClient`), TanStack Query for all server state, no
Zustand, no form library, no table library, no modal library. Server state is
**never** mirrored into local state — the panel renders the refetched payment
truth, and no decision receipt is projected into the cache.

**One shared status primitive, not a second colour system.** `AdminStatusBadge`
lives in Admin shared scope because two features need it, and it tints with the
same `Color/Status/*` tokens the existing `custom-request-status` and
`design-template-status` badges use. Every badge renders symbol + label + tone,
so colour is always redundant (`753:127`).

**Modal shell.** `PaymentDialog` is the seventh hand-rolled Admin dialog;
`FU-ADMIN-SHARED-DIALOG-01` remains open and unowned. It was written locally
rather than reached across a feature boundary, for the reason `APP5-A02`
recorded — the follow-up is the right place to resolve all seven at once.

---

## 6. Query keys and invalidation

```text
['admin','orders','queue',{ pageSize, statuses }]        queue page (infinite)
['admin','orders','detail',orderId]                      frozen order
['admin','orders','detail',orderId,'payments']           payment truth
['admin','orders','detail',orderId,'evidence',evidenceId] one private Blob
```

The queue key carries the **sorted** selection, so two spellings of one filter
are one cache entry. No cursor is ever a key part.

After a settled decision, `refreshAll()` invalidates exactly three things and
justifies each: the payment truth (the attempt, obligation, satisfying attempt
and new reconciliation row), the order (its own status may have moved
`AWAITING_DEPOSIT → DEPOSIT_PAID`), and the **queue root** — imported from
`order-queue`'s published `orderQueueKeys.lists()` rather than re-spelled, so
the invalidation cannot silently stop matching. Evidence entries are deliberately
not invalidated by a decision: a verification changes no image, and `gcTime: 0`
drops them the moment nothing renders them.

`refreshPayments()` is the narrow variant awaited by the ambiguity recovery: it
returns the payment truth the caller must inspect and does not touch the queue,
because at that moment nothing is yet known to have moved.

---

## 7. Verify / review result mapping

`200` is **not** success. The mapping branches on the canonical response:

| Response | Kind | Rendered |
|---|---|---|
| `SUCCEEDED` **and** `SATISFIED` **and** `DEPOSIT_PAID` | `verified` | "Đã xác nhận tiền cọc" + the three-fact table |
| `attemptStatus = REQUIRES_REVIEW` | `requiresReview` | "Đã chuyển giao dịch sang cần đối chiếu" — an outcome, with the durable-transition note |
| anything else the contract can produce | `recorded` | Neutral "máy chủ đã ghi nhận", pointing at the refetched truth |

All three facts, or none. A response where the attempt succeeded but the
obligation did not is `recorded`, never a paid deposit — proved by a test.

The words "xác nhận thất bại" appear exactly once in the delivered UI: inside
the approved note that **forbids** them. The verify suite asserts against the
outcome *title* element rather than the document, precisely so that the
prohibition cannot satisfy the assertion.

**Expected vs observed is shown; the verdict is not computed.** The frames
annotate rows "khớp" / "lệch 100.000 VND", and this implementation deliberately
does **not** reproduce a per-row verdict. `740:48` is the proof it could not:
the drawn *success* matches expected `ORDK7M2Q9XR4TDC` against observed
`CK COC DON HANG ordk7m2q9xr4tdc - Nguyen Van A…` — lower-case and embedded in a
longer sentence. Any client-side comparison would have called that a mismatch and
contradicted the outcome shown directly beneath it. The table shows both values
and states in one line that the match is the server's decision; the overall
verdict is the badge, which comes from `attemptStatus`.

---

## 8. `observedTransferReference` — the non-constraints, proved

`APP7-B04` publishes an unrestricted string: no `pattern`, no `maxLength`, no
`minLength`. The delivered control declares none of them, and no code path
touches the value:

```text
uppercase                NOT APPLIED
canonical 15-char form   NOT APPLIED
maxLength 2000           NOT APPLIED
minLength                NOT APPLIED
trim                     NOT APPLIED
punctuation stripping    NOT APPLIED
whitespace collapsing    NOT APPLIED
Unicode normalization    NOT APPLIED
HTML pattern attribute   ABSENT
HTML maxLength attribute ABSENT
CSS text-transform       ABSENT (asserted in the SCSS comment and the test)
```

Two discriminating tests: a messy value —
`"  ck coc DON hang ordk7m2q9xr4tdc - Nguyen Van A / GD 20260823.140233 ref#998877  "`,
leading and trailing spaces included — reaches the generated operation
byte-for-byte; and a 2400-character value submits at full length, past any bound
the UI might have invented.

Truncation exists in exactly one place: read-only history and comparison cells,
via `LongTextValue`, with a keyboard-reachable reveal. Nothing on the submitting
side truncates anything.

`observedAmount` mirrors `^\d{1,12}(?:\.\d{1,2})?$` exactly, checked against the
*text*. No `Number`, `parseFloat`, `parseInt`, unary `+`, `Math.round` or
arithmetic operator is applied to any amount anywhere in either feature; a
`999999999999.00` total renders exactly, which a parsed value could not.

---

## 9. Network ambiguity — the proof

`741:51` implemented literally. On a transport failure with no status line — and
on **every 5xx**, because the platform replaces a 5xx code and message with a
generic pair, leaving nothing to distinguish "refused" from "committed then
failed to answer":

1. the dialog stays open in `đang kiểm tra lại trạng thái giao dịch…`, submit locked;
2. `adminOrderPaymentRead` is re-read;
3. attempt `SUCCEEDED` + `SATISFIED` + `DEPOSIT_PAID` → the approved success, marked as recovered;
4. attempt `REQUIRES_REVIEW` → that outcome;
5. unchanged → say so, keep the typed values, and let the operator re-send **the same values** explicitly.

The discriminating test: `adminPaymentAttemptVerify` rejects with a network
error while the server's current read says `DEPOSIT_PAID` — the UI refetches and
renders committed success, never a failure, with exactly **one** write attempted.
No financial mutation is ever retried automatically; the unchanged path asserts
the second send is byte-identical to the first, which `APP7-B04` converges on
with `replayed: true`.

A `409` reconciles instead of insisting (`741:87`): the payment truth and the
order are reloaded, the winner is shown, and a new decision is required. A test
feeds a 409 carrying `could not obtain lock on relation payment_attempts` and
asserts no lock, transaction, version or relation language reaches the operator.

---

## 10. Evidence — locator, eligibility and Blob cleanup

```text
B06_LOCATOR = evidenceId          (the payment_transfer_evidence association)
RAW_ASSET_ID_USAGE = NONE         (B04 publishes none; no route accepts one)
STORAGE_URL / DOWNLOAD LINK / TOKEN = NONE
```

The preview is enabled exactly when `previewEligible` is true. `UPLOADED` and
`INSPECTING` render identically (`743:34`) with the button disabled and labelled
*Đang kiểm tra*; `REJECTED` is disabled and labelled *Không xem được*, stays in
the list, and **does not** disable, hide or discourage verification anywhere.
Listing three associations issues zero byte requests — proved.

Blob lifecycle, proved by the recorder in `installObjectUrl`:

- created only after a successful fetch;
- the previous handle revoked before a replacement is on screen (navigation between images);
- every created handle revoked on dialog close and on unmount — asserted as `revoked === created`, not "most of them";
- `gcTime: 0` and `staleTime: 0`, so a closed dialog leaves no private bytes in the cache and re-opening re-authorizes against the server;
- never in `localStorage`, `sessionStorage`, a route, a query parameter, a log or module state.

A `404` re-reads the payment metadata (`previewEligible` may be stale) and offers
no retry, because `APP7-B06` collapses ten refusals into one indistinguishable
answer and will refuse again. A `503` offers one manual retry and does **not**
re-read metadata. Neither writes any payment state — asserted directly on the
deposit and order badges after a failed preview.

---

## 11. Accessibility

- every status is symbol + text + tone, never colour alone (`753:127`);
- the symbol vocabulary is `753:130` exactly: `○ ◷ ◐ ▶ ✓ ✕`;
- real `<label for>` on every field, required marker inside the label, error wired through `aria-describedby` so it is announced *with* the control and not only in the summary (`753:158`);
- dialogs trap focus, close on `Escape`, and restore focus to the trigger (`753:172`) — and ignore a dismiss while a decision is in flight;
- lightbox navigation is real buttons with real word labels, never bare glyphs (`753:175`);
- evidence alt text describes the image by its position in the eligible sequence, never an id;
- the loading state is announced via `role="status"` rather than being a silent skeleton (`753:164`);
- `role="status"` for in-flight bands, `role="alert"` for settled outcomes;
- the queue's append is announced once per successful page, in a visually-hidden live region;
- real `<table>` / `<dl>` semantics throughout, with the order code as the row header.

Desktop-first, as the phase requires. The two-column workbench stacks below
`1180px` and the filter grid collapses below `900px`, so a long observed
reference, the lightbox and the payment cards never overflow the Admin shell;
no separate mobile Admin product was created.

---

## 12. Truth separation (`751:3`), enforced structurally

Three vocabularies in three modules, with no shared phrase and **no shared
"Đã thanh toán" badge anywhere in the delivered code**:

| Group | Module | Example |
|---|---|---|
| Order (LC-14) | `shared/presentation/order-status.ts` | `DEPOSIT_PAID` → *Đã xác nhận cọc* |
| Obligation / attempt | `order-detail/model/payment-vocabulary.ts` | `SATISFIED` → *Đã thu đủ*; `REQUIRES_REVIEW` → *cần đối chiếu* |
| Evidence | same module, separate map | `ACCEPTED` → *Đã tiếp nhận* |

Only authoritative payment truth renders *Đã xác nhận tiền cọc*. Values the
contract publishes but APP7 never produces (`PROCESSING`, `REFUNDED`,
`PARTIALLY_REFUNDED`, obligation `CANCELLED`/`SUPERSEDED`, and the eight LC-14
states from `PRODUCTION_COMPLETED` on) are named plainly and tinted **neutral** —
naming them is what the filter requires, tinting them would be APP7 asserting a
meaning for a state it neither creates nor owns a screen for. An unrecognised
value degrades to *Không xác định*, never a raw English enum on a Vietnamese page.

---

## 13. A defect the tests caught

The first run of the exact-success case timed out looking for the outcome panel.
The cause was real and would have shipped: a successful verification satisfies
the deposit, `selectActionableAttempt` then returns `undefined`, and
`PaymentActionCard` early-returned a *differently shaped* tree — so React
unmounted and remounted the dialog at the exact moment it had a result to show.
The operator would have watched the success they were waiting for disappear.

Fixed by giving the card **one** return with the dialog at a stable position, and
by capturing the attempt id at open time rather than reading it from props on
every render. Both reasons are recorded in the component.

---

## 14. Frozen-facts guarantees

- no Catalog operation is reachable from the capability at all — the read seam
  exports exactly `fetchOrderDetail`, `fetchOrderPayments`, `fetchPaymentEvidence`,
  asserted by a test, so a later edit could not enrich a historical line even by
  mistake;
- `sizeLabel` absent → `—` / *không có*, never rebuilt from the variant label,
  the SKU or a live `product_variants` row; the explanatory note appears only
  when no line carries a size, and disappears when one does;
- a customer-owned line shows no SKU value and no variant; a catalog line whose
  stored ids are both absent shows nothing rather than borrowing the
  customer-owned note;
- money is transported: no `unitPrice × quantity`, no sum over lines, no deposit
  percentage recomputed, and the currency is always the row's own `currencyCode`.

---

## 15. Validation ledger

| Command | Scope | Result |
|---|---|---|
| `node tools/check-figma-design-index.mjs` | registry integrity, once after approval | **PASS** — 373 IDs / 373 node rows / 19 tables |
| `pnpm --filter @embroidery/admin test -- order- design-template-navigation admin-shell-model` | focused A01 + directly-affected shell tests | **PASS** — 12 suites, 118 tests |
| `pnpm --filter @embroidery/admin typecheck` | app whose source changed | **PASS** |
| `pnpm --filter @embroidery/api-client typecheck` | package whose curated export changed | **PASS** |
| `npx eslint <changed src + test paths>` | changed files only | **PASS** — 0 errors |
| `npx prettier --check <changed + new files>` | changed files only | **PASS** |
| `git diff --check` | whitespace | clean |

Focused suites (all new unless noted):

```text
test/components/order-queue-render.test.tsx        11
test/components/order-queue-filters.test.tsx       12
test/components/order-detail-render.test.tsx       11
test/components/order-payment-panel.test.tsx       15
test/components/order-payment-verify.test.tsx      13
test/components/order-payment-review.test.tsx       9
test/components/order-payment-ambiguity.test.tsx    9
test/components/order-evidence-preview.test.tsx    13
test/components/order-navigation.test.tsx           5
test/smoke/order-routes.test.tsx                    2
test/components/design-template-navigation.test.tsx (updated) 4
test/model/admin-shell-model.test.ts (updated)     14
```

The two updated files are the shared assertions that pin the shell's navigation
list — they exist to go red when an entry is added, and they did. Both were
updated to record the new `orders` entry rather than relaxed.

Deliberately **not** run: `quality:e2e`, the full Jest run, the full Admin suite,
Playwright, backend API tests, the `B02`/`B04`/`B06` suites, worker tests,
OpenAPI generation or check, database gates, SonarQube. No backend, contract,
schema or worker input changed, so none of them had anything to re-measure.

Every gate above was run **after** the Prettier pass rewrote 25 files, so the
recorded results are against the committed bytes. No PASS was re-run against
unchanged input.

---

## 16. Changed files

```text
docs/design/FIGMA_DESIGN_INDEX.md
  §4.13  39 rows REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION
         + Product Owner approval paragraph and registry-edit-only note
  §10    + APP7-D01 approval audit entry

packages/api-client/src/index.ts
  + curated APP7 Admin order/payment block (6 operations, 14 enums, 12 types)

apps/admin/src/app/(protected)/orders/page.tsx                      (new)
apps/admin/src/app/(protected)/orders/[orderId]/page.tsx             (new)

apps/admin/src/features/order-queue/**                               (new, 19 files)
apps/admin/src/features/order-detail/**                              (new, 33 files)

apps/admin/src/shared/status/admin-status-badge.tsx                  (new)
apps/admin/src/shared/status/admin-status.scss                       (new)
apps/admin/src/shared/presentation/order-status.ts                   (new)
apps/admin/src/shared/presentation/exact-amount.ts                   (new)
apps/admin/src/shared/presentation/instant.ts                        (new)
apps/admin/src/shared/presentation/identifier.ts                     (new)

apps/admin/src/features/admin-shell/model/admin-shell-nav.ts         (+1 nav entry)
apps/admin/src/styles/main.scss                                      (+3 @use)

apps/admin/test/support/order-fixture.ts                             (new)
apps/admin/test/components/order-*.test.tsx                          (new, 8 files)
apps/admin/test/smoke/order-routes.test.tsx                          (new)
apps/admin/test/components/design-template-navigation.test.tsx       (nav list +1)
apps/admin/test/model/admin-shell-model.test.ts                      (implemented routes +1)
```

No file under `apps/api/**`, `apps/worker/**`, `packages/contracts/**`,
`packages/database/**`, OpenAPI artifacts, generated client files, migrations,
`package.json` or the lockfile was touched.

---

## 17. File-size governance

All TypeScript/TSX source is within the 400-line limit (largest: 254, the copy
catalog). All tests are within 600 (largest: 312).

**One value worth flagging:** `order-detail/styles/order-detail.scss` is **869**
lines — the largest stylesheet in the Admin app. It is one leaf stylesheet per
feature, which is the established convention (`product-placement` 783,
`product-form` 753, `custom-request-detail` 712), and order-detail is the largest
single Admin screen: two columns, five cards, three dialogs, a lightbox and three
tables. It is consistent with precedent rather than an exception, but it is now
the high-water mark and a reasonable candidate for a split
(`payment-dialogs.scss` is the natural seam) if the convention is ever tightened.

---

## 18. Assumptions and limitations

1. **Per-row match verdicts are not computed** (§7). The design annotates them;
   the contract makes them underivable client-side. The two values are shown
   side by side and the server's verdict is the badge. This is the one place the
   implementation renders less than the frame draws, and the reason is that
   drawing it would require inventing the server's comparison rule.
2. **The eight undrawn LC-14 states are neutral-toned** with the approved labels
   from the filter list (`732:110`). Tinting them would assert semantics APP7
   does not own.
3. **The actionable attempt is the newest open one** (`PENDING` or
   `REQUIRES_REVIEW`) while the obligation is `PENDING`. This selects *which*
   attempt a control addresses and hides the control where the design hides it;
   it is not a lifecycle authority, and the server still refuses anything it
   should.
4. **`exact-amount.ts` duplicates the string-grouping logic** already in
   `request-quotation/model/exact-money.ts`, which hard-codes a `₫` suffix while
   APP7 must render the server's `currencyCode`. Consolidating them would mean
   editing an APP6 screen that is not in this change's impact, so it is left as a
   follow-up rather than done here.
5. **`FU-ADMIN-SHARED-DIALOG-01` grew from six to seven** hand-rolled dialogs.
   Unchanged in kind; the follow-up remains the right place to resolve them all.
6. **Playwright was not run** — `NOT_RUN_BY_DESIGN`. `APP7-E01` owns cross-layer
   acceptance, and no route-level browser evidence was claimed here.

---

## 19. Commits

```text
Commit A = record the D01 Product Owner approval + the A01 Admin UI,
           focused tests and curated api-client export
Commit B = A01 completion report + phase/master roadmap evidence

NOT_PUSHED = true
```

```text
a3956fd  feat(app7): deliver the Admin order + deposit payment workspace (APP7-A01)
         docs/design/FIGMA_DESIGN_INDEX.md
         packages/api-client/src/index.ts
         apps/admin/src/** · apps/admin/test/**   (77 files)

f6d6f26  docs(app7): record APP7-A01 and advance the roadmap (APP7-A01)
         docs/implementation/reports/APP7-A01-COMPLETION-REPORT.md
         docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
         docs/implementation/10-MASTER-APPLICATION-ROADMAP.md

NOT_PUSHED = true
```

No predecessor commit was amended and no third ceremonial approval-only commit
was created: the approval is metadata the implementation consumed, so it travels
with the implementation that consumed it.

---

## 20. Next

```text
APP7-A01 = COMPLETE
NEXT_CHECKPOINT = APP7-S01
```

`APP7-S01` (customer deposit, QR, evidence intake and confirmation at
`/truy-cap/thanh-toan`) was **not** started. `E01`, `X01`, APP8 and APP9 were not
started. No customer-facing route, operation or frame from the `APP7-S01` set was
touched.
