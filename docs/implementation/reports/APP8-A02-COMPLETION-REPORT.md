# APP8-A02 — Admin Production Queue

## 1. Verdict

```text
APP8-A02 = COMPLETE
NEXT_CHECKPOINT = APP8-A03
NOT_PUSHED = true
```

The Admin production work queue is delivered at `/san-xuat` against the already
approved `APP8-D01` rows. It is a read-only surface built entirely from what
`adminProductionJob_list` publishes: it invents no order code, no specification
label, no priority, no operator, no machine and no attempt count, and it reaches
no production mutation. No backend, schema, worker, OpenAPI, generated-client or
Figma change was made.

## 2. Branch and commit evidence

```text
BRANCH        = production
ENTRY_HEAD    = e593aa5bb83c88dd8d3125c17f0c30066cf7922e
                feat(app8): deliver the Admin SKU stock workspace (APP8-A01)
FINAL_COMMIT  = recorded by the commit that carries this report
PUSHED        = no
```

The commit hash is not restated in a second commit: this report is committed
*with* the implementation, so the hash is the commit's own.

## 3. Route implemented

```text
/san-xuat
```

Segment: `apps/admin/src/app/(protected)/san-xuat/page.tsx`, inside the existing
authenticated route group whose layout already resolves the session and renders
the shell. The segment is a thin boundary and does not prefetch, for the reason
`APP3-A02` recorded and `APP5-A01`/`APP7-A01` repeated: the filters live in the
URL, so a server-dehydrated first page would have to guess the filter set and
would be superseded by the client's first request the moment the operator
narrowed it.

### Route language

The Product Owner's ruling is followed exactly. `/san-xuat` is the identity the
approved D01 package fixes (`780:27` breadcrumb `Quản trị / Sản xuất`) and it
was **not** renamed to an English slug for consistency with older Admin
segments. `FU-APP8-A01-03` remains an open, nonblocking IA follow-up and was not
touched.

### `/san-xuat/{jobId}` was deliberately not created

Rows link to it; no segment, no stub and no placeholder screen exists behind it.
This is the `APP5-A01` precedent applied unchanged — that checkpoint linked
`/requests/{requestId}` one checkpoint before `APP5-A02` built it, recording
that "the detail route is A02's to create, and a stub would be a screen that
exists without content". The disposition is therefore **link now, build in
A03**, and `adminProductionJobRoute()` spells the address in exactly one place
so A03 inherits the spelling rather than inventing a second one.

## 4. Approved Figma nodes consumed

| Registry ID | Node | Use |
|---|---|---|
| `FIG-APP8-A02-QUEUE-DEFAULT-DESKTOP` | `780:3` | Page frame, source note, filter bar, table columns, status pills, load-more, ordering note |
| `FIG-APP8-A02-QUEUE-FILTER-DESKTOP` | `780:105` | Status multi-select, the four LC-18 options with their stored tokens, the "tất cả is not a value" sentence, the last-page statement |
| `FIG-APP8-A02-QUEUE-EMPTY-DESKTOP` | `782:3` | Unfiltered empty state and its "Mở danh sách đơn hàng" affordance |
| `FIG-APP8-A02-QUEUE-FILTERED-EMPTY-DESKTOP` | `782:44` | Filtered-empty state, the active-conditions read-back and the three clear controls |
| `FIG-APP8-A02-QUEUE-LOADING-DESKTOP` | `782:89` | Skeleton preserving the table's column count and row height; the no-premature-empty note |
| `FIG-APP8-A02-QUEUE-ERROR-DESKTOP` | `782:206` | The three read failures and their distinct recoveries |
| `FIG-APP8-A02-QUEUE-NARROW` | `789:85` | Narrow-1280 layout and the single column reduction (`789:157`) |
| `FIG-APP8-REUSE-MAP` | `788:136` | Reuse reference |
| `FIG-APP8-HANDOFF-DEPENDENCY-MAP` | `788:179` | The recorded queue/contract mismatch |

All are `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP8-D01-PO-001`.

```text
FIGMA_NODES_MUTATED       = 0
REGISTRY_ROWS_CHANGED     = 0
APPROVAL_METADATA_CHANGED = 0
FIGMA_CHECKER_RUN         = no (neither Figma nor the registry changed)
```

Reads against the live Figma file were **read-only** (`get_design_context`) and
were made to transcribe copy and layout.

## 5. Generated-client operation and types consumed

```text
adminProductionJob_list   GET /api/admin/production-jobs -> adminProductionJobList

NEW_HTTP_OPERATIONS    = 0
OPENAPI_REGENERATED    = no
CLIENT_REGENERATED     = no
GENERATED_FILES_EDITED = 0
```

Types: `AdminProductionJobListParams`, `AdminProductionJobQueueResponse`,
`AdminProductionJobQueueItemResponse`. One value crosses:
`AdminProductionJobListStatusItem`, from which the filter's four options and the
status presentation map are derived, so the vocabulary cannot drift from the
contract.

## 6. Public api-client boundary disposition

The operation already existed in the generated tree from `APP8-B03`; it was not
re-exported on the hand-written `@embroidery/api-client` public boundary, which
every prior frontend checkpoint extends the same way. The addition is one
function, one enum value and three types.

**Only the list operation crosses.** `adminProductionJobCreate`,
`adminProductionJobGet` and `adminProductionJobTransition` are deliberately left
unexported, so "this screen cannot start, complete or cancel a job" is a fact of
the module graph rather than a convention — asserted directly
(`production-queue-render.test.tsx`, "reaches no production mutation").

`FU-APP8-A01-02` is **carried, not paid**: `packages/api-client/src/index.ts`
was already failing the file-size gate at 1106 lines and is now 1135 (+29).
Splitting it is a package-wide refactor outside A02's scope (§22), so the
inherited state is recorded rather than half-fixed.

## 7. Queue row fields rendered

Exactly what `AdminProductionJobQueueItemResponse` publishes, and nothing else:

| Column | Source | Treatment |
|---|---|---|
| `Mã lệnh (jobId)` | `jobId` | Row header, shortened `019a…6091`, full id in `title` |
| `Đơn hàng (orderId)` | `orderId` | Shortened, full id in `title` |
| `Bản duyệt (approvalSnapshotId)` | `approvalSnapshotId` | Shortened, full id in `title`; the one column the narrow reduction drops |
| `Trạng thái` | `status` | `AdminStatusBadge` — symbol **and** label, never colour alone |
| `Tạo lúc` | `createdAt` | `<time dateTime>` + `vi-VN` short form |
| `Mốc gần nhất` | `startedAt` / `completedAt` / `cancelledAt` | One event, selected by lifecycle precedence; `—` when there is none |
| (action) | — | One link per row to `/san-xuat/{jobId}` |

**The milestone is selected, never computed.** Precedence is cancelled →
completed → started, i.e. the lifecycle's own order, not a comparison of
instants: a job cancelled after it started carries both timestamps, and letting
the later instant win would let two values a millisecond apart change what a row
means. A `PLANNED` job renders an em dash — the *absence* of an event, not an
unknown value. Asserted with a fixture whose `cancelledAt` is deliberately
*earlier* than its `startedAt`.

### The recorded mismatch, carried rather than resolved

`APP8-D01` §13 records that the queue publishes **no `orderCode`** and **no
frozen specification**. A02 therefore renders neither, and opens no second read
to find them:

```text
CATALOG_READS_PER_ROW     = 0
ORDER_READS_PER_ROW       = 0
FABRICATED_ORDER_CODES    = 0
SPECIFICATION_COLUMNS     = 0
```

The boundary test asserts the feature's whole module graph never mentions
`adminOrderDetail`, `adminOrderList`, `adminProductDetail`, `adminSkuStockGet`
or `adminProductionJobGet`. `780:29` states the absence on screen, so an
operator expecting an `ORD-…` code learns it lives on the detail rather than
hunting for a column that was never designed.

## 8. Status filter behavior

- Multi-select over exactly `PLANNED`, `STARTED`, `COMPLETED`, `CANCELLED`,
  derived from `AdminProductionJobListStatusItem` rather than hand-listed.
- **Empty selection sends no `status` parameter at all.** No `ALL` sentinel is
  invented; `APP8-B03` then answers with every state, which is what it
  documents. `780:176`'s sentence saying so is rendered on screen.
- Sent as a repeatable array with Axios `indexes: null`. This matters more here
  than on the order queue: the query schema is `.strict()`, so the default
  `status[0]` form is an *unknown parameter* and the whole request would be
  refused with a `400`, not merely have its filter dropped.
- Selection order is the contract's declaration order, so two spellings of one
  selection are one cache entry.
- An unrecognised URL token (`?status=RUNNING`) is **dropped** and never echoed
  into the DOM — asserted with exactly the invented state a production queue is
  most tempted to grow.
- Rendered as a `fieldset` of native checkboxes, which is keyboard- and
  screen-reader-correct with no interaction code, and maps one box to one value
  on the wire. The legend and its `Tất cả` / `n đã chọn` summary stay visible.
- Each option shows its stored contract token beside the label (`780:151`), so
  an operator reconciling against the database sees which value they asked for.

## 9. `orderId` filter behavior

- Sends the published `orderId` parameter, and only that.
- **It is not an order code in disguise.** The accepted schema is
  `z.string().uuid()`, so the control commits only a value of that shape. A
  half-typed or malformed value — including `ORD-K7M2Q9XR4T` — is held as a
  *draft*, reported in place, and **not sent**. There is no hidden lookup
  translating a code into an id: `APP8-B03` publishes no code filter and no
  resolution operation, and a silent second query is not a filter the operator
  asked for. Asserted: typing an order code produces the in-place refusal and
  **zero** additional requests.
- The help line names `orderId` explicitly and says the queue does not accept
  `ORD-…`, so the label cannot be misread.
- A malformed `orderId` arriving in the URL is dropped, exactly as an
  unrecognised status token is.

## 10. URL / filter-state behavior

- Both filters live in the URL (`?status=…&status=…&orderId=…`) — the
  `APP2-A02` / `APP3-A02` / `APP5-A01` / `APP7-A01` convention, reused because a
  narrowed queue is a place an operator bookmarks, reloads and pastes to a
  colleague.
- `router.replace` with `scroll: false`: narrowing is not a navigation step, and
  a back button walking a filter history would be a surprise. Browser
  back/forward therefore moves between real screens, not between filter states.
- Reading is **total**: `getAll` for the repeatable parameter (so a two-status
  bookmark does not come back as a one-status queue), unknown tokens dropped,
  malformed order ids dropped. No arbitrary input can crash the page and none is
  reflected into the DOM.
- **No Zustand copy of any of it.** Query state has one home and server state
  has one home.
- **No cursor in the URL.** The cursor is `useInfiniteQuery`'s page parameter, so
  a bookmarked address always reads from the first page and a stale cursor
  cannot be pasted into one. What the URL carries is exactly what the operator
  chose.

## 11. Keyset pagination behavior

- `useInfiniteQuery`, the Admin convention for keyset continuation, reused
  unchanged. Page size 20; the contract allows 1–100.
- The next page is requested only when **both** `hasNext` is true **and** a
  non-empty `nextCursor` exists — asserted with a page carrying a stale cursor
  alongside `hasNext: false`, which offers no continuation.
- The cursor is opaque: passed back exactly as issued, never parsed. There is no
  offset, page number or total anywhere — asserted by the boundary test against
  the source, and by the rendered test against the DOM.
- Pages **append**; a job that a shifted keyset window put on two pages is
  rendered once, first occurrence winning, without re-sorting.
- The load-more button is natively `disabled` while a page is in flight, so a
  second click is impossible rather than discouraged.
- On the last page the control is replaced by `780:217`'s statement that the end
  has been reached, so the absence of a button is explained.
- **A filter change resets the chain.** The filters are part of the query key, so
  a narrowed queue is a different cache entry that starts from its own first
  page — asserted end-to-end: load page two, change the filter, and the next
  request carries the new `status` and **no** `cursor`.

## 12. Server-order preservation

Nothing sorts rows. The boundary test enumerates every `.sort(` in the feature
and asserts there is exactly one, in `production-queue-keys.ts`, where it
canonicalises the *cache key's* status list. A rendered test feeds a page that is
deliberately neither newest-first nor status-grouped and asserts the DOM order
matches the response order. The ordering note (`780:104`) describes the server's
`(createdAt, id)` key rather than claiming a client behaviour.

## 13. Loading, error, empty and filtered-empty states

| State | Node | Behaviour |
|---|---|---|
| Loading | `782:89` | Skeleton in the table's own geometry; `role="status"` sentence; bars `aria-hidden`; the empty state can never flash first (asserted) |
| Unfiltered empty | `782:3` | "Chưa có lệnh sản xuất nào" + why creation is not offered here + a link to `/orders`. **No create button**, and no button at all (asserted) |
| Filtered empty | `782:44` | "Không có lệnh nào khớp bộ lọc" + the active conditions read back in the operator's own words + one clear control per active filter |
| Cursor rejected | `782:241` | `PRODUCTION_CURSOR_INVALID · 400` annotated in the body; the action is **"Về trang đầu"**, not a retry |
| Server failure | `782:247` | "Không tải được hàng đợi", states that nothing was changed, offers a retry |
| Session expired | `782:253` | `401`; offers sign-in and **no** retry, because none could succeed |

**The two empty states are deliberately not one.** `782:81` states the rule in
the design itself, and the tests assert each excludes the other. Which applies is
decided by the *filters*, never by the response.

**No creation CTA was invented.** `APP8-B03` nests creation under a specific
order and requires that order's exact approval snapshot and a satisfied deposit,
so a standalone "tạo lệnh" button would be a form with no order to submit
against. `782:42`'s truthful affordance — a link to the order list — is what
ships, and the copy says why.

**"Về trang đầu" does what it says.** A rejected cursor cannot be retried, so
`refetch()` would replay the same failing page. The action resets this feature's
own filtered cache entry, discarding the accumulated pages and the cursor chain
with them, and the query then starts from `initialPageParam`. Nothing else is
touched: the boundary test asserts no `queryClient.clear()`, no argument-less
`invalidateQueries()` and no argument-less `resetQueries()` anywhere.

**Classification is structural.** The failure module branches on `httpStatus`
and the published business `code` only. The boundary test asserts no source file
mentions `normalized.message` or calls `.includes` / `.match` / `.startsWith` /
`.toLowerCase` on a message, and a rendered test feeds a server message
containing a SQL fragment and asserts neither it nor the `requestId` reaches the
screen. `retry: false`, and the boundary test asserts no `setInterval`,
`setTimeout` or numeric `refetchInterval` exists — `787:149` forbids automatic
retry of a refused command outright.

A continuation failure after a page has loaded stays confined to the control
below the queue; the rows already on screen are not thrown away.

Auth behaviour otherwise follows the existing protected Admin shell; no new error
framework was built.

## 14. Responsive 1280 behavior

`789:157` fixes the single reduction, and that is exactly what is implemented:
the `approvalSnapshotId` column is hidden below the narrow reference — head
cell, body cell and `colgroup` track together, so the table never goes ragged —
and the skeleton's matching bar goes with it so the loading geometry keeps
agreeing with the table that replaces it.

Nothing else is hidden. The boundary test splits the stylesheet on every
`display: none` and asserts each one belongs to the approval column, so a column
quietly added to the reduction later fails a test rather than a review. Job id,
order id, status, both timestamps and the row's link survive at every width, and
there is no `overflow-x: auto|scroll` and no overflow menu holding the dropped
column — `789:159` rules both out by name.

No mobile behaviour below the accepted Admin range was invented.

## 15. Navigation disposition

The `Sản xuất` entry (`780:22`) **was** added, pointing at `/san-xuat`, using the
existing nav item component and style, with the label taken from the owning
capability so there is one spelling. It sits after `Đơn hàng`, where the frames
draw it. Active state is asserted for both `page` (its own route) and `section`
(a job detail beneath it, so the queue stays reachable from the screen it
opens).

This is legitimate where A01's was not: `/san-xuat` is a real parameterless
route, whereas a `Kho` entry needs a parameterless `/kho` destination that would
have to be the all-SKU list `APP8-B01` cannot serve.

```text
KHO_NAV_ADDED   = no   (FU-APP8-A01-04 stays open, unresolved by A02)
APP9_NAV_ADDED  = no
SHELL_REDESIGNED = no
```

A test asserts no nav entry points anywhere under `/kho`, so the inventory entry
cannot be smuggled in later without a decision.

## 16. Shared component and pattern reuse

Reused unchanged: `AdminStatusBadge`, `AdminTextField`, `truncateIdentifier`,
`formatInstant`, `STATUS_SYMBOLS`, the `(protected)` layout and Admin shell,
`getBrowserApiClient`, `normalizeApiClientError`, the `@embroidery/styles` token
foundation, and the feature-owned-leaf-stylesheet composition in
`src/styles/main.scss`.

Patterns reused rather than re-invented: the `APP7-A01` URL-held filter
controller, the `useInfiniteQuery` keyset collection with its
`hasNext` + `nextCursor` guard, the page-accumulation de-duplication, the
`indexes: null` per-call serializer, the feature-scoped API error class, and the
loading/failure/empty/populated state discipline. **No second cursor-pagination
implementation and no repo-wide list framework was created** — the shapes are
duplicated per feature exactly as the five existing Admin queues already do, and
generalising them is not A02's mandate.

`production-status.ts` is deliberately **feature-scoped**, not promoted to
`src/shared`: the queue is its only consumer today. `APP8-A03` may promote it
when the job detail needs the same words — a move with two real callers rather
than an abstraction created for a hypothetical one.

## 17. Confirmation no unsupported capability was invented

```text
INVENTED_CAPABILITIES = 0
```

Not implemented, and asserted absent: production job create; Start / Complete /
Cancel; the job detail; reservation summary; transition history; production
specification; production artifacts; notes; machine or operator assignment;
priority or SLA; attempts or claims; customer production status; anything APP9
owns.

The boundary test additionally asserts the feature's source contains no
`priority`, `slaMinutes`, `operatorId`, `machineId` or `attemptCount`
identifier, no `useMutation`, and none of the string literals `'QUEUED'`,
`'RUNNING'`, `'BLOCKED'`, `'FAILED'`, `'CLAIMED'`, `'RETRYING'` or `'ALL'`.

## 18. Exact changed files

**New — feature (`apps/admin/src/features/production-queue/`)**

```text
index.ts
model/production-queue-route.ts
model/production-queue-copy.ts
model/production-queue-keys.ts
model/production-queue-failure.ts
model/production-queue-filters.ts
model/production-queue-rows.ts
model/production-status.ts
services/production-queue.service.ts
hooks/use-production-queue-filters.ts
hooks/use-production-queue-query.ts
components/production-queue-screen.tsx
components/production-queue-filter-bar.tsx
components/production-queue-collection.tsx
components/production-queue-table.tsx
components/production-queue-skeleton.tsx
components/production-queue-pagination.tsx
components/production-queue-empty.tsx
components/production-queue-failure-state.tsx
styles/production-queue.scss
```

**New — route and tests**

```text
apps/admin/src/app/(protected)/san-xuat/page.tsx
apps/admin/test/components/production-queue-render.test.tsx
apps/admin/test/components/production-queue-filters.test.tsx
apps/admin/test/components/production-navigation.test.tsx
apps/admin/test/boundary/production-queue-source.test.ts
apps/admin/test/support/production-fixture.ts
```

**Modified**

| File | Change |
|---|---|
| `packages/api-client/src/index.ts` | re-export the existing `adminProductionJobList`, one enum value and three types on the public boundary |
| `apps/admin/src/styles/main.scss` | one `@use` for the feature's leaf stylesheet |
| `apps/admin/src/features/admin-shell/model/admin-shell-nav.ts` | one `Sản xuất` entry; doc note on why `Kho` is still absent |
| `apps/admin/test/components/order-navigation.test.tsx` | nav-order assertion extended by the new entry |
| `apps/admin/test/components/design-template-navigation.test.tsx` | same |
| `apps/admin/test/model/admin-shell-model.test.ts` | `/san-xuat` registered in `IMPLEMENTED_ADMIN_ROUTES` |
| `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | §12 status; header status |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP8 cell; `NEXT_CHECKPOINT` |

Untouched, and verified untouched: `docs/design/FIGMA_DESIGN_INDEX.md`,
`packages/api-client/src/generated/**`, the OpenAPI artifact, every backend and
worker source, every migration.

## 19. File-size disposition

Every new source file is within the 400-line hard limit and every new test file
within the 600-line limit. Largest new files: `production-queue.scss` (458),
`production-queue-render.test.tsx` (363), `production-queue-filters.test.tsx`
(345), `production-queue-source.test.ts` (200), `production-queue-filters.ts`
(187), `production-queue-rows.ts` (140).

`node tools/check-file-size.mjs` reports **80 hard-limit violations both before
and after** this checkpoint. **None** is in a file A02 created — the gate does
not govern `.scss`, and the stylesheet at 458 lines is a single responsibility
(the queue's own layout, table, states, skeleton and its one responsive
reduction) whose partials could not be split by line range without breaking the
cascade order. One violation is in a file A02 **modified**:
`packages/api-client/src/index.ts`, already failing at 1106 lines and now 1135
(+29) — inherited `FU-APP8-A01-02`, carried unchanged (§6).

## 20. Focused test ledger

| Command | Impact reason | Result |
|---|---|---|
| `pnpm --filter @embroidery/api-client typecheck` | the public barrel changed | PASS |
| `pnpm --filter @embroidery/api-client jest src/public-api.smoke.test.ts src/generated-client.contract.test.ts` | the public boundary changed; these are the two tests that rule on it | PASS — 2 suites, 21 tests |
| `pnpm --filter admin typecheck` | new feature, route and tests | PASS |
| `pnpm --filter admin jest test/components/production-queue-render.test.tsx` | Cases A, E, G, H | PASS — 18 tests |
| `pnpm --filter admin jest test/components/production-queue-filters.test.tsx` | Cases B, C, D, F | PASS — 16 tests |
| `pnpm --filter admin jest test/components/production-navigation.test.tsx` | Case J | PASS — 5 tests |
| `pnpm --filter admin jest test/boundary/production-queue-source.test.ts` | Case I plus the source rules a rendered test cannot settle | PASS — 14 tests |
| `pnpm --filter admin jest test/model/admin-shell-model.test.ts test/components/order-navigation.test.tsx test/components/design-template-navigation.test.tsx test/components/requests-navigation.test.tsx test/components/admin-shell-render.test.tsx test/components/admin-shell-drawer.test.tsx` | the **only** existing suites that read `ADMIN_PRIMARY_NAV` or render the shell nav | PASS — 6 suites (three edited for the new entry; three unchanged and re-run because they render the nav) |
| `npx prettier --write <changed governed files>` | Prettier is a global control, run on changed files only | PASS |
| `npx eslint <changed admin scopes>` + api-client typecheck | ESLint on the smallest changed scopes | PASS after two fixes (a type-only import; a disable comment for an unconfigured rule, removed by restructuring the callback) |
| `node tools/check-file-size.mjs` | new source and test files | 80 violations before and after; none created by A02 (§19) |
| `node tools/check-styling-boundaries.mjs` | a new SCSS file (`CMD-CHECK-STYLES`) | 19 violations, **all** in `apps/storefront`; **0** in `apps/admin` and **0** in `production-queue` — inherited `FU-APP8-A01-06` |
| `pnpm --filter admin build` | the only decisive proof the new SCSS partial compiles through the app's real Sass pipeline, and that the new segment builds | PASS — `/san-xuat` present in the route table |

**Reruns:** the render suite was run twice (one assertion initially matched the
skeleton's own explanatory note, which itself contains the words "0 kết quả";
replaced with an assertion that no emptiness is claimed). The boundary suite and
the changed-nav suites were each re-run once after the lint fixes. No passing
command was repeated against unchanged input.

### Case coverage

| Case | Where |
|---|---|
| A — default queue | `production-queue-render.test.tsx` — boundary parameters, published fields, server order, six columns |
| B — status filter | `production-queue-filters.test.tsx` — four values, empty sends nothing, repeatable serialization, contract order, unknown dropped, cursor reset |
| C — `orderId` filter | `production-queue-filters.test.tsx` — exact id sent, order code refused in place with zero requests, malformed URL value dropped |
| D — keyset load more | `production-queue-filters.test.tsx` — cursor verbatim, append, no duplicates, no page numbers or totals, stale cursor on a last page |
| E — unfiltered empty | `production-queue-render.test.tsx` |
| F — filtered empty | `production-queue-filters.test.tsx` — distinct copy, conditions read back, per-filter recovery, no redundant clear-all |
| G — loading | `production-queue-render.test.tsx` |
| H — error | `production-queue-render.test.tsx` — three classifications, safe retry, no server prose |
| I — narrow 1280 | `production-queue-source.test.ts` — stylesheet assertions (jsdom applies no CSS) |
| J — navigation | `production-navigation.test.tsx` + the three edited shared suites |

## 21. Deliberately not run

Not run, with no demonstrated impact (§20.6):

- the full monorepo Jest run, and the whole Admin suite;
- every API/integration suite, including the accepted `APP8-B03` and `APP8-B04`
  tests — the backend is unchanged;
- Playwright / browser E2E;
- worker suites, inventory race suites, production backend suites;
- the APP7 acceptance run;
- Docker full stack, DB9 benchmarks;
- OpenAPI or generated-client regeneration, and
  `packages/api-client check:generated` — no generated file changed;
- `node tools/check-figma-design-index.mjs` — neither Figma nor a registry row
  changed, so the gate would assert an unchanged input (§19 of the brief says as
  much).

## 22. Nonblocking findings

| Id | Finding |
|---|---|
| `FU-APP8-A02-01` | The approved error frame (`782:206`) designs three read failures and no `403`. A `403` on this route is not a state `APP8-B03` produces — every route is behind `AuthenticatedAdminGuard` and the queue has no per-role restriction — so it is classified as the generic retryable failure, which offers a retry that could not succeed. Cosmetic and unreachable today; recorded rather than designed around. |
| `FU-APP8-A02-02` | The `orderId` control commits on every keystroke that produces a well-shaped id, which writes `router.replace` on intermediate keystrokes too (always to the same unfiltered URL). It is correct and produces no extra request, but a debounce or an explicit commit would write the history less. No accepted convention exists for an Admin free-text filter; the four existing Admin queues have none. |
| `FU-APP8-A02-03` | The queue's newest-first ordering note and the source note are rendered as prose on the page (`780:29`, `780:104`). They are accurate today, but they restate a server behaviour no client test can hold to account. If `APP8-B03`'s ordering ever changed, this copy would go stale silently. |

Carried unchanged, not absorbed: `FU-APP8-A01-01` (no `skuCode` in the stock
response), `FU-APP8-A01-02` (oversized api-client barrel — extended by 29 lines,
recorded in §6/§19), `FU-APP8-A01-03` (route-language inconsistency),
`FU-APP8-A01-04` (no Inventory sidenav — **not** resolved by adding
`Sản xuất`), `FU-APP8-A01-05` (APP6 lint debt), `FU-APP8-A01-06` (storefront
styling-gate debt — 19 violations, all storefront),
`FU-ADMIN-SHARED-DIALOG-01` (A02 adds no dialog, so it neither grows nor
shrinks).

## 23. Roadmap

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
A02 = COMPLETE
A03 = NEXT
E01 = INCOMPLETE
X01 = INCOMPLETE
```

Exactly one `NEXT`. `APP8-A02-C1` is unused and remains the single correction
available to this checkpoint.

## 24. Stop

```text
APP8-A02 = COMPLETE
NEXT_CHECKPOINT = APP8-A03
NOT_PUSHED = true
```
