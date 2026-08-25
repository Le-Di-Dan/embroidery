# APP8-A03 — Admin Production Job Detail and Guarded Actions — Completion Report

## 1. Verdict

```text
APP8-A03 = COMPLETE
BACKEND_CHANGES        = 0
SCHEMA_CHANGES         = 0
WORKER_CHANGES         = 0
FIGMA_CHANGES          = 0
OPENAPI_CHANGES        = 0
GENERATED_CLIENT_CHANGES = 0
INVENTED_CAPABILITIES  = 0
```

The Admin production job detail is delivered at `/san-xuat/{jobId}`, with the
three guarded `APP8-B04` transitions behind approved confirmation dialogs. Every
value on the page comes from the single `APP8-B03` detail read; every legality
decision stays on the server.

## 2. Branch / entry HEAD / final commit

```text
Branch               : production
Entry HEAD           : bd1fe1c24b6ac67e107394aa2a5a1c733565c559
                       ("feat(app8): deliver the Admin production queue (APP8-A02)")
Final commit         : recorded by the delivering commit itself (see §27 note)
NOT_PUSHED           = true
```

Accepted entry confirmed: `APP8-D01 = COMPLETE / PO APPROVED`
(`FIG-APPROVAL-APP8-D01-PO-001`), `APP8-A01 = COMPLETE`, `APP8-A02 = COMPLETE`.

## 3. Route

```text
/san-xuat/{jobId}
```

Delivered as `apps/admin/src/app/(protected)/san-xuat/[jobId]/page.tsx` — a thin
async segment that awaits `params`, passes `jobId` down as a plain string and
renders nothing itself. The `(protected)` layout has already resolved the
session; the route key authorizes nothing, because `APP8-B03` and `APP8-B04`
re-check the Admin session on every request.

`APP8-A02` already links every queue row to `adminProductionJobRoute(jobId)`.
That link now resolves — the segment behind it exists, so the queue's "Mở →"
control is real rather than addressed.

The segment does **not** prefetch. A job's LC-18 state is decided under a row
lock by whoever commands it next, so a state baked into a server-rendered
document can be stale before the browser paints, and offering a transition
control from a dehydrated status is precisely the stale truth an operator must
not act on.

`/san-xuat` was not renamed. `FU-APP8-A01-03` (route-language inconsistency)
remains open and nonblocking.

## 4. Figma nodes consumed

All read through `get_design_context` / `get_metadata` at implementation time.
**No Figma node and no registry row was modified.**

| Node | Registry id | Use |
|---|---|---|
| `784:3` | `FIG-APP8-A03-DETAIL-PLANNED-CATALOG-DESKTOP` | PLANNED · Catalog layout, header, frozen-spec card, empty history, Start/Cancel |
| `784:129` | `FIG-APP8-A03-DETAIL-STARTED-MIXED-DESKTOP` | STARTED · mixed reservation truth, Complete/Cancel |
| `785:3` | `FIG-APP8-A03-DETAIL-COMPLETED-DESKTOP` | COMPLETED terminal card (aside read at `785:105`) |
| `785:134` | `FIG-APP8-A03-DETAIL-CANCELLED-DESKTOP` | Cancellation evidence card, boundary statement, released row |
| `785:270` | `FIG-APP8-A03-DETAIL-COP-DESKTOP` | COP-only neutral no-reservation state |
| `786:3` | `FIG-APP8-A03-START-CONFIRM` | Start confirmation |
| `786:39` | `FIG-APP8-A03-COMPLETE-CONFIRM` | Complete confirmation |
| `786:70` | `FIG-APP8-A03-CANCEL-FROM-PLANNED` | Cancel from PLANNED |
| `786:110` | `FIG-APP8-A03-CANCEL-FROM-STARTED` | Cancel from STARTED |
| `786:150` | `FIG-APP8-A03-CANCEL-REASON-MISSING` | Blocked-in-place missing reason |
| `786:177` | `FIG-APP8-A03-TRANSITION-SUBMITTING` | Pending state |
| `787:3` | `FIG-APP8-REFUSAL-PRODUCTION` | Refusal catalog → operator copy |
| `787:149` | `FIG-APP8-STALE-CONFLICT-SPEC` | The five-step conflict flow and the three prohibitions |
| `788:3` | `FIG-APP8-MATRIX-RESERVATION-TRUTH` | Catalog / COP / mixed rendering |
| `788:52` | `FIG-APP8-SCOPE-BOUNDARY` | The fifteen deliberately-absent capabilities |
| `789:160` | `FIG-APP8-A03-DETAIL-NARROW` | Narrow 1280 reflow |

All rows were `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP8-D01-PO-001` before implementation and are unchanged after it.
`node tools/check-figma-design-index.mjs` was **not** re-run: no design or
registry file changed, so it had no changed input (see §23).

## 5. Generated-client operations and types

Consumed, unchanged:

```text
GET  /api/admin/production-jobs/{jobId}              → adminProductionJobGet
POST /api/admin/production-jobs/{jobId}/transitions  → adminProductionJobTransition
```

Types used: `AdminProductionJobDetailResponse`,
`AdminProductionSpecificationResponse`,
`AdminProductionReservationSummaryResponse`,
`AdminProductionReservationResponse`, `AdminProductionTransitionResponse`,
`AdminProductionTransitionResultResponse`, `TransitionProductionJobBody`, and
`TransitionProductionJobBodyTo` as a **value**.

No OpenAPI artifact, generated file or codegen run changed.

## 6. Public api-client boundary disposition

`packages/api-client/src/index.ts` gained exactly the two operations, one
enum value and seven types listed above — the minimum A03 consumes.

`adminProductionJobCreate` stays **unexported**. Creation is nested under a
specific order and requires that order's exact approval snapshot and a satisfied
deposit, so no Admin screen has anything to submit it with; leaving it off the
boundary keeps "APP8's Admin surfaces do not create production jobs" a fact of
the module graph rather than a convention.

`TransitionProductionJobBodyTo` crosses as a value for the reason
`AdminProductionJobListStatusItem` did in A02: the three destinations come from
the contract rather than from string literals that can drift. It is three
values, not four — `PLANNED` is a creation state, never a destination.

`FU-APP8-A01-02` (oversized public barrel) is **carried, not absorbed**. The
barrel grew 1135 → 1168 lines and continues to fail the repository file-size
gate; splitting it is the follow-up's job, not this checkpoint's (§21).

## 7. Shared production-status disposition

`production-status.ts` moved from the production-queue capability to Admin shared
scope:

```text
apps/admin/src/features/production-queue/model/production-status.ts
  → apps/admin/src/shared/presentation/production-status.ts
```

`APP8-A02` recorded that this should be promoted when a second real caller
appeared. That is now the case: the queue row, the detail status pill, the
transition-history rows and the dialog prose all name the same four states, so
A02 and A03 consume **one** mapping (`PLANNED` / `STARTED` / `COMPLETED` /
`CANCELLED` → label · symbol · tone), with the same `UNKNOWN` neutral fallback.

Only the narrow presentation mapping moved. The queue's filters, query keys,
cursor logic and row builders stayed in the queue; no state-machine framework and
no generalised status abstraction was created. Four A02 imports were repointed
and the A02 copy module's cross-reference comment updated; no A02 behaviour
changed.

## 8. Detail sections

Rendered from the B03 response and nothing else:

1. **Header** — job id (shortened, full value in `title`), `orderCode` with a
   link to `/orders/{orderId}`, approval snapshot id, status pill, rework
   lineage when published, and `createdAt` / `startedAt` / `completedAt` /
   `cancelledAt` / `updatedAt` as they apply. A PLANNED job renders
   "Chưa bắt đầu" rather than an empty or invented date.
2. **Cancellation evidence** (CANCELLED only) — the recorded reason plus the
   binding boundary statement.
3. **Frozen production specification** — §9.
4. **Transition history** — §11.
5. **Reservation context** (aside) — §10.
6. **Actions** (aside) — §12.

No live enrichment of any kind: no Catalog/Product, quotation, Design Session,
payment, customer, artifact/storage or machine/operator read exists in the
feature, and there is no per-row second request. Exactly one HTTP request per
page load, asserted in test.

## 9. Frozen specification

Rendered as read-only authority, with the `🔒` banner stating that the values
were copied from the exact approval at creation and are never re-read from the
live catalog.

Fields: `productName`, `variantLabel`, `sideName`, `areaName`,
`physicalWidthMm × physicalHeightMm` (joined with the approved `×` and unit,
never parsed, rounded or converted), `quantityTotal`, `documentHash` (provenance
only — no download link, no storage key, no original file) and
`productionParameters`.

The two contract absences are rendered as *meanings*, not gaps:
`variantLabel` absent → "— (khách tự mang: luôn vắng)" (INV-13);
`productionParameters` absent → "— (không ghi tham số khi tạo lệnh)". Nothing is
reconstructed from live data to fill either.

No input, select or editable control exists on the card (asserted in test).
`specification` absent — an unreachable-state fallback on the contract — is
reported as an absence rather than papered over.

## 10. Catalog / COP / mixed reservation rendering

Display only, in every mode. The "Đây là ngữ cảnh, KHÔNG phải cổng chặn" note
renders on every mode that has rows.

| Order | Rendering |
|---|---|
| **Catalog** | `catalogItemCount`, `customerOwnedItemCount`, and every returned reservation row (id-labelled, quantity, state). Terminal rows are kept, so "held then released" stays distinguishable from "never held". |
| **COP-only** (`required = false`) | The approved neutral state: "Đơn này không cần giữ kho" on a neutral surface — no error tone, no warning glyph, no "missing" wording, **no fabricated SKU or reservation row**. Start remains offered. |
| **Mixed** | Real Catalog rows only, plus the explicit note that the COP portion has none and never will. **No placeholder COP row.** |

Reservation states are labelled in Vietnamese (`Đang giữ`, `Đã tiêu thụ`,
`Đã giải phóng`, `Đã hết hạn`); the tone only tints the label, so meaning is
never colour-only.

**GRD-015 is not reconstructed.** `productionJobActions()` reads `job.status` and
nothing else; a boundary test asserts that the module contains no
`reservationSummary`, `catalogItemCount`, `customerOwnedItemCount`, `required`,
`deposit` or `orderStatus` reference, and that the actions card carries no
`disabled` prop at all.

## 11. Transition history

Mapped one-for-one from `transitions` in server insert order. No sort, no
reverse, no grouping.

Each row: `from → to` (stored tokens, with the Vietnamese labels as the
accessible `title`), safe actor attribution (`ADMIN · 7c19…8b41`, or the actor
kind with the system job key), timestamp, and the reason where present. A
customer never appears; `correlationId` is not surfaced.

**No synthetic `(created) → PLANNED` row.** A fresh PLANNED job renders the
approved empty-history state, which states why the history is empty. Both facts
are asserted in test.

## 12. Actions by status

| Status | Controls |
|---|---|
| `PLANNED` | Bắt đầu sản xuất · Huỷ lệnh sản xuất |
| `STARTED` | Hoàn tất sản xuất · Huỷ lệnh sản xuất |
| `COMPLETED` | none — prose only |
| `CANCELLED` | none — prose only |
| unrecognised | none |

`COMPLETED` states that APP8 has no move left and that remaining payment,
shipping and settlement belong to a later phase. `CANCELLED` states that the job
cannot be restarted and that a redo would be a separate new job APP8 does not
create. Neither renders a button (asserted: `queryByRole('button')` finds none).

Every action set carries "Tính hợp lệ do máy chủ sở hữu…" — visibility follows
the read status; legality does not follow visibility.

## 13. Start behaviour

Dialog `786:3`. Sends exactly:

```json
{"to":"STARTED"}
```

No reason field exists on the dialog at all, because the contract refuses a
`reason` on this command (`787:88`). The dialog states the single transaction
(job `PLANNED → STARTED`, order `DEPOSIT_PAID → IN_PRODUCTION`, reservation
`RESERVED → CONSUMED`), that consumption is one-way, that a COP-only order simply
consumes nothing, and that the server may refuse because authoritative state
changed. No lock or transaction-internal language reaches the operator beyond
"máy chủ quyết định… dưới khoá dòng", which the approved frame itself uses.

## 14. Complete behaviour

Dialog `786:39`. Sends exactly:

```json
{"to":"COMPLETED"}
```

States job `STARTED → COMPLETED`, order `IN_PRODUCTION → PRODUCTION_COMPLETED`,
that completion moves **no** inventory (the goods were issued at start), and that
APP8 stops there — remaining payment, shipping and settlement get no control on
this screen, before or after success. No APP9 behaviour is implemented.

## 15. Cancel behaviour

Dialogs `786:70` (from PLANNED), `786:110` (from STARTED), `786:150` (missing
reason). Sends:

```json
{"to":"CANCELLED","reason":"<operator reason>"}
```

The reason is mandatory, trimmed before measurement and before sending, and
bounded at the contract's 1000 characters. A blank or whitespace-only reason is
blocked in place — **zero requests reach the server** (asserted) — and the
blocked state names `PRODUCTION_CANCELLATION_REASON_REQUIRED · 400` as an
engineer-facing annotation while telling the operator what to do.

**From PLANNED**: the copy states this cancels the *production job*, not the
customer order — no move to `CANCELLING`, no refund, no payout — and that a
still-`RESERVED` hold is released. The effect rows show
`RESERVED → RELEASED` and order `không đổi → không đổi`.

**From STARTED**: the copy states that consumed stock is **not** restored and
that returning it would be a separate audited inventory adjustment. The
reservation effect row names `CONSUMED → CONSUMED`; the word `RELEASED` does not
appear (asserted). No stock-adjust, refund or restore control exists anywhere.

## 16. Stale / conflict / refusal mapping

Classified from the structured envelope `code` first, then `httpStatus`.
`normalized.message` is never read and never rendered (asserted in the boundary
test and in a render test that feeds `pg: could not serialize access…` and
asserts it does not reach the DOM).

| Published code / condition | HTTP | Operator title |
|---|---|---|
| `PRODUCTION_DEPOSIT_NOT_SATISFIED` | 409 | Đơn chưa thanh toán cọc |
| `PRODUCTION_ORDER_ON_HOLD` | 409 | Đơn hàng đang bị giữ |
| `PRODUCTION_BLOCKED` | 409 | Trạng thái đơn không cho phép |
| `PRODUCTION_APPROVAL_MISMATCH` | 409 | Bản duyệt không khớp |
| `PRODUCTION_RESERVATION_NOT_ACTIVE` | 409 | Giữ kho đã thay đổi |
| `PRODUCTION_RESERVATION_INSUFFICIENT` | 409 | Giữ kho không đủ số lượng |
| `PRODUCTION_INVALID_TRANSITION` | 409 | Trạng thái sản xuất đã thay đổi |
| `PRODUCTION_CANCELLATION_REASON_REQUIRED` | 400 | Thiếu lý do huỷ |
| `PRODUCTION_JOB_NOT_FOUND` | 404 | Không tìm thấy lệnh sản xuất |
| — | 401 | Phiên đăng nhập đã hết hạn |
| — | 403 | Yêu cầu bị từ chối |
| no response line / 5xx | — | Không rõ máy chủ đã ghi hay chưa |
| other 4xx | — | Không thực hiện được thao tác |

Read failures classify separately: 404 → not found (with a link back to the
queue), 401 → unauthenticated, 403 → forbidden, everything else → retryable. A
failed read renders a failure, never an empty job.

Conflict flow, exactly `787:149`:

```text
submit → server refuses → one focused message → NO auto retry
       → authoritative detail re-read → action availability recalculated
```

`retry: false` on both the query and the mutation; no `setInterval`, no
`refetchInterval`. There is **no** retryable-conflict band, because the backend
publishes no such code (`787:186`). The ambiguous band concludes nothing, offers
no resend and re-reads truth.

## 17. Detail / queue cache reconciliation

- Detail query key: `['admin','production-jobs','detail',jobId]`.
- On a committed transition: `invalidateQueries` on the detail key, awaited, then
  `invalidateQueries` on the production-queue root — because a status-filtered
  queue's membership changed.
- The queue root comes from `APP8-A02`'s own `productionQueueKeys.lists()`
  factory (published on the queue's index for exactly this purpose), not from a
  literal spelled here, so the two features cannot drift into two namespaces.
  That is the smallest legitimate key reuse; no query framework was built.
- No `queryClient.clear()`, no `invalidateQueries()` without a key, no
  `resetQueries` anywhere (asserted).
- No Zustand: no server state is duplicated into a browser store (asserted).
- The mutation receipt is used only for the post-commit announcement sentence;
  it is never written into the cache as a substitute for re-reading.

## 18. Navigation, responsive, accessibility

**Navigation.** No nav item was added. `resolveNavItemState` already returns
`section` for `/san-xuat/{jobId}`, so `Sản xuất` renders with the current styling
and stays a link back to the queue (covered by the existing
`production-navigation` and `admin-shell-model` tests). The page also carries the
approved breadcrumb `Quản trị / Sản xuất / Lệnh …` and an explicit back link to
`/san-xuat`. No `Kho` nav entry was added — `FU-APP8-A01-04` stays open.

**Responsive.** Desktop 1440 is the two-column layout (main + 366px aside). At
the `789:160` narrow reference the columns collapse to one and the aside is
re-ordered above the main column, so the status, the action set and the
reservation truth stay above the fold; the specification grid reflows from three
tracks to two. **Nothing is dropped, nothing is hidden and nothing scrolls
sideways** — asserted against the stylesheet: every `display: none` in the
feature belongs to an `:empty` live-region rule, and there is no `overflow-x`.
No behaviour below 1280 was invented.

**Accessibility.**
- Dialogs are `role="dialog" aria-modal="true"` with an `aria-labelledby` title
  and an `aria-describedby` subtitle; focus enters on mount, is trapped while
  open and is restored to the trigger on close.
- The cancellation reason is a labelled `<textarea>` with `aria-invalid` and
  `aria-describedby` wired to its error, which is announced (`role="alert"`).
- The pending state sets `aria-busy` on the confirm control and is announced
  through a polite live region; the post-commit result is announced through the
  page's own live region.
- The destructive action is named for its object — "Huỷ lệnh sản xuất" — so it
  cannot be read as cancelling the customer order.
- Status and reservation meaning are always words; tone only tints them.
- Existing components reused: `AdminStatusBadge`, `truncateIdentifier`,
  `formatInstant`, `STATUS_SYMBOLS`, the Admin shell and the token foundation.

## 19. Unsupported capability count

```text
UNSUPPORTED_CAPABILITIES_IMPLEMENTED = 0
```

Not implemented, and not present anywhere in the feature: production-job
creation, order cancellation/refund, remaining payment, shipping/delivery,
artifacts, note mutation, machine/operator assignment, priority/SLA,
attempts/claims, rework creation, any customer surface, inventory adjustment,
manual reservation actions, APP9 behaviour.

Terminal APP8 state remains `job = COMPLETED`, `order = PRODUCTION_COMPLETED`,
with no "next commercial action" control.

## 20. Changed files

**Added — feature (`apps/admin/src/features/production-job/`)**

```text
index.ts
model/production-job-copy.ts
model/production-transition-copy.ts
model/production-job-keys.ts
model/production-job-failure.ts
model/production-job-actions.ts
model/production-job-history.ts
model/production-job-reservation.ts
model/production-job-specification.ts
model/cancellation-reason.ts
services/production-job.service.ts
services/production-transition.service.ts
hooks/use-production-job-query.ts
hooks/use-production-transition.ts
components/production-job-screen.tsx
components/production-job-header.tsx
components/production-cancellation-card.tsx
components/production-specification-card.tsx
components/production-reservation-card.tsx
components/production-history-card.tsx
components/production-actions-card.tsx
components/production-job-dialog.tsx
components/production-transition-dialog.tsx
components/production-transition-effects.tsx
components/production-transition-notes.tsx
components/production-job-skeleton.tsx
components/production-job-failure-state.tsx
styles/production-job.scss
styles/_production-job-layout.scss
styles/_production-job-cards.scss
styles/_production-job-sections.scss
styles/_production-job-dialog.scss
```

**Added — route and tests**

```text
apps/admin/src/app/(protected)/san-xuat/[jobId]/page.tsx
apps/admin/test/components/production-job-detail.test.tsx
apps/admin/test/components/production-job-transitions.test.tsx
apps/admin/test/boundary/production-job-source.test.ts
apps/admin/test/support/production-job-fixture.ts
```

**Moved**

```text
apps/admin/src/features/production-queue/model/production-status.ts
  → apps/admin/src/shared/presentation/production-status.ts
```

**Modified**

```text
packages/api-client/src/index.ts                                   (+2 ops, +1 value, +7 types)
apps/admin/src/styles/main.scss                                    (register the feature stylesheet)
apps/admin/src/features/production-queue/components/production-queue-empty.tsx    (import repoint)
apps/admin/src/features/production-queue/hooks/use-production-queue-filters.ts    (import repoint)
apps/admin/src/features/production-queue/model/production-queue-filters.ts        (import repoint)
apps/admin/src/features/production-queue/model/production-queue-rows.ts           (import repoint)
apps/admin/src/features/production-queue/model/production-queue-copy.ts           (comment reference)
apps/admin/test/components/production-queue-render.test.tsx                       (boundary assertion, §22)
```

## 21. File-size disposition

Every new or moved file this checkpoint owns is inside the limits:

```text
largest owned source file  : components/production-transition-dialog.tsx  218 lines
largest owned model file   : model/production-transition-copy.ts          232 lines
largest owned test file    : production-job-detail / -transitions          380 lines each
shared/presentation/production-status.ts                                  100 lines
```

`node tools/check-file-size.mjs` reports **no FAIL and no REVIEW** for any
`production-job`, `[jobId]` route or `production-status` file.

Splits were by responsibility, as §24 requires: detail model / query, frozen
spec, reservation section, history, actions, dialogs and mutation/error mapping
are each their own module, and the stylesheet is four partials (layout, card
frame + authority cards, sections, dialog) rather than one sheet.

**Carried, not fixed**: `packages/api-client/src/index.ts` is 1168 lines and
continues to FAIL the gate's 400-line source limit. That violation pre-existed
this checkpoint (1135 lines at entry) and is `FU-APP8-A01-02`; §4 and §23
explicitly instruct A03 to carry it.

## 22. Focused test ledger

All commands run from `apps/admin` unless noted.

| # | Command | Scope | Result | Why it was run |
|---|---|---|---|---|
| 1 | `pnpm test -- test/components/production-job-detail.test.tsx` | 18 tests | PASS | New screen: the five approved states, frozen spec, history, read states |
| 2 | `pnpm test -- test/components/production-job-transitions.test.tsx` | 14 tests | PASS | New mutations: three commands, bodies, duplicate submit, refusals |
| 3 | `pnpm test -- test/boundary/production-job-source.test.ts` | 18 tests | PASS | Source-level facts a rendered test cannot settle, incl. narrow viewport |
| 4 | `pnpm test -- test/components/production-queue-render.test.tsx` | 18 tests | PASS | Directly impacted: the api-client boundary assertion it makes changed |
| 5 | `pnpm test -- test/components/production-queue-filters.test.tsx` | 16 tests | PASS | Directly impacted: imports the moved status presentation |
| 6 | `pnpm test -- test/components/production-navigation.test.tsx` | 5 tests | PASS | Directly impacted: asserts the detail route's nav section state |
| 7 | `pnpm test -- test/boundary/production-queue-source.test.ts` | 14 tests | PASS | Directly impacted: scans the queue feature dir the file left |
| 8 | `pnpm test -- test/model/admin-shell-model.test.ts` | 14 tests | PASS | Directly impacted: nav-state resolution for a nested production route |
| 9 | `pnpm typecheck` (`apps/admin`) | tsc --noEmit | PASS | New feature + moved module + changed imports |
| 10 | `pnpm typecheck` (`packages/api-client`) | tsc --noEmit | PASS | Public boundary changed |
| 11 | `pnpm test` (`packages/api-client`) | 44 jest + 7 node:test | PASS | Public-boundary smoke and generated-client contract tests |
| 12 | `pnpm build` (`apps/admin`) | next build | PASS | Only real check that the new SCSS compiles and `/san-xuat/[jobId]` registers |
| 13 | `npx prettier --write` on the changed governed files | formatting | PASS | Global quality control, changed files only |
| 14 | `npx eslint` on the changed scopes | lint | PASS (0 problems) | Global quality control, smallest changed scopes |
| 15 | `node tools/check-file-size.mjs` | repo gate | see §21 | §24 file-size policy |

Test coverage against the §22 checklist:

1. PLANNED Catalog — detail/spec/reservation render, Start + Cancel only ✓ (#1)
2. STARTED Mixed — mixed truth, Complete + Cancel only ✓ (#1)
3. COMPLETED — no mutation, no APP9 action ✓ (#1)
4. CANCELLED — reason/history, no restart/refund/order-cancel ✓ (#1)
5. COP-only — `required = false`, neutral state, no fake rows ✓ (#1)
6. Frozen spec — API values exact, one request, no live Catalog call ✓ (#1, #3)
7. History — server order, no synthetic creation row ✓ (#1)
8. Start success — exact `{to:'STARTED'}`, no reason, duplicate blocked, refetch ✓ (#2)
9. Complete success — exact `{to:'COMPLETED'}`, no APP9 call ✓ (#2)
10. Cancel PLANNED — mandatory reason, production-job wording ✓ (#2)
11. Cancel STARTED — consumed stock not restored, no stock-adjust call ✓ (#2)
12. Cancel missing reason — blocked locally, zero requests ✓ (#2)
13. Stale/invalid 409 — focused copy, no auto retry, refresh path ✓ (#2)
14. Representative guard refusal — server authority, no optimistic advance ✓ (#2)
15–17. Loading, not found, generic read failure ✓ (#1)
18. Narrow 1280 behaviour ✓ (#3, stylesheet)
Shared impact — moved status helper, queue key reuse ✓ (#4–#8)
api-client boundary — typecheck + public-boundary/contract tests ✓ (#10, #11)

No passing command was repeated on unchanged input.

## 23. Deliberately not run

| Not run | Reason |
|---|---|
| `apps/api` production suites (B03/B04, integration, races) | Zero backend change; no input to those suites changed |
| Worker suites, inventory race suites | Zero worker change |
| Full monorepo Jest, all Admin tests | No demonstrated impact; the changed Admin surface is enumerated in §22 |
| Full Playwright / E2E | No E2E asset changed; a browser run for one breakpoint is a broad run with no demonstrated impact |
| APP7 acceptance, DB9 benchmarks, Docker/compose | Untouched by this change |
| `node tools/check-figma-design-index.mjs` | No design or registry file changed — the gate had no changed input |
| SonarQube | Not required by this checkpoint's governance |

## 24. Nonblocking findings

| Id | Finding |
|---|---|
| **NF-APP8-A03-01** | The approved reservation rows draw a SKU **code** (`TEE-BLK-M-001`), but `AdminProductionReservationResponse` publishes only `skuId` and `skuStockId` — no `skuCode`. Rows are labelled by shortened id with the full value in `title`; resolving a code would require a per-row Catalog read (`788:179` refuses it) and would put a live catalog string beside a frozen specification. Same gap as `FU-APP8-A01-01`. |
| **NF-APP8-A03-02** | `AdminProductionReservationResponseStatus` publishes `EXPIRED`, but no approved frame draws it. It is labelled ("Đã hết hạn") and reuses the terminal (neutral) treatment rather than being assigned a colour no design fixes. |
| **NF-APP8-A03-03** | `FU-ADMIN-SHARED-DIALOG-01` remains open. The Admin app now has nine hand-rolled modal shells; A03 added the ninth rather than promoting one for a single new caller, which would create the shared abstraction without reconciling the other eight. |
| **NF-APP8-A03-04** | `packages/api-client/src/index.ts` grew 1135 → 1168 lines and still fails the file-size gate (`FU-APP8-A01-02`). Carried per §4/§23. |
| **NF-APP8-A03-05** | `production-queue-render.test.tsx` previously asserted that `adminProductionJobGet` and `adminProductionJobTransition` were absent from the whole api-client package. A03 legitimately publishes both, so that assertion was narrowed to `adminProductionJobCreate`; the queue's own "cannot mutate" invariant is still enforced by its single-export service seam and its source-boundary test. |
| **NF-APP8-A03-06** | `.job-effects` rows print raw contract tokens (`DEPOSIT_PAID`, `IN_PRODUCTION`, `RESERVED`, `CONSUMED`) exactly as `786:10`…`786:130` draw them. This is the one place English enum members appear on an otherwise Vietnamese surface; the approved frames specify it, and the surrounding prose carries the meaning. |

None blocks acceptance.

## 25. Roadmap

```text
APP8-R00 = COMPLETE
APP8-G01 = COMPLETE (corrected by G01-C1)
APP8-B01 = COMPLETE
APP8-B02 = COMPLETE
APP8-W01 = COMPLETE
APP8-B03 = COMPLETE
APP8-B04 = COMPLETE
APP8-D01 = COMPLETE / PO APPROVED
APP8-A01 = COMPLETE
APP8-A02 = COMPLETE
APP8-A03 = COMPLETE
APP8-E01 = NEXT
APP8-X01 = INCOMPLETE
```

Exactly one `NEXT`.

## 26. Stop

```text
APP8-A03 = COMPLETE
NEXT_CHECKPOINT = APP8-E01
NOT_PUSHED = true
```

APP8-E01 was not started.

## 27. Note on the final commit hash

This report is written before the delivering commit and is included in it, so it
cannot name its own hash. No second commit was created to record one.
