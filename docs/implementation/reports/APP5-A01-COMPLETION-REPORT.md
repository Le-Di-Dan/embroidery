# APP5-A01 — Admin Request Queue — Completion Report

## A. Verdict

```text
APP5-A01 = COMPLETE
```

The Admin custom-request queue exists at `/requests`, reads `APP5-B04` through
the generated `adminCustomRequestList` and nothing else, states its effective
triage scope from the server's own `appliedStatuses`, filters by status and
subject kind, pages forward on an opaque keyset cursor, and enters one request
detail route. It is read-only: no moderation, quotation, payment or CRM control
exists on the screen.

One genuine defect was found **in the browser and only in the browser**, and
fixed: the repeatable `status` filter was serialized by Axios as `status[]=…`,
which `APP5-B04` rejects as `UNKNOWN_FIELD`. See §L.

---

## B. Baseline

| Item | Value |
| --- | --- |
| Branch | `production` |
| Entry HEAD | `f11be2b` — *feat(app5): confirm a submitted request and read its grant-scoped status* (`APP5-S02`) |
| Accepted predecessors | `R00`, `G01`, `D01` (PO-approved), `B01`, `DB01`, `B02`, `B03`, `B04`, `B05`, `B07`, `S01`, `S02` |
| Consumed operation | `GET /api/admin/custom-requests` · `adminCustomRequest_list` · generated `adminCustomRequestList` |
| Approved design authority | `FIG-APPROVAL-APP5-D01-PO-001`, six `FIG-APP5-A01-QUEUE-*` rows, all `APPROVED_FOR_IMPLEMENTATION` |

The registry rows were already promoted, so per the checkpoint brief §1 the
registry was **not edited**, `tools/check-figma-design-index.mjs` was **not run**,
and Figma was **not modified**.

### B.1 Design authority actually consumed — and one limitation

`docs/design/FIGMA_DESIGN_INDEX.md` §4.11 was read in the repository copy and
resolved to the six approved node ids below. The `APP5-D01` completion report
§F was read as well, which pins this surface's reuse explicitly:

> Admin list, filter chips, cursor "load more" → `APP2-D03` `439:100`, `498:272`
> → used by `662:*`

and records the D01 defect fix that shaped the narrow reference:

> The Admin queue side rail was positioned outside the content column — removed,
> with the open-request count moved into the topbar; the 1280 reference was
> rebuilt with a narrower column set so no column is dropped and nothing scrolls
> horizontally.

**Limitation — the live Figma nodes were not opened.** The Figma MCP server is
unauthenticated in this environment (`mcp__plugin_figma_figma__authenticate`
returns an authorization URL requiring the operator's browser), so the
`CLAUDE.md` §3 instruction to open the exact node and read its design-system
references could not be executed. The registry rows, their approval evidence and
the D01 package documentation were used as the authority instead. Two consequences
are recorded honestly rather than papered over:

1. **Filter set.** The consumed authority evidences a two-control filter bar
   reused from `APP2-D03` `498:272`. `APP5-A01` therefore implements exactly the
   two enum filters that map onto it — status and subject kind. `code`,
   `submittedFrom`/`submittedTo` and the `contactKind`+`contact` pair are
   published by B04 and were **not** implemented: an exact-match or date control
   that the consumed authority does not evidence would be a surface this
   checkpoint invented. Carried as `FU-APP5-A01-FILTER-SET-CONFIRM-01`.
2. **Open-request count.** D01 records the count moving into the topbar. B04
   publishes **no** total and no count — keyset pagination exposes neither — so
   no number is rendered. The truthful fallback is the scope statement built from
   `appliedStatuses` (§F), which the brief §7 also requires. Carried as
   `FU-APP5-A01-QUEUE-COUNT-01`; it needs either a backend count or a design
   amendment, and inventing one on the client was not an option.

Neither is a §26 hard blocker: a truthful fallback exists for the count, and the
filters that *are* implemented are the ones the consumed authority evidences.

---

## C. Route and design traceability

| Node | Registry ID | State | Implementation |
| --- | --- | --- | --- |
| `662:3` | `FIG-APP5-A01-QUEUE-DESKTOP-DEFAULT` | Default | `custom-request-queue-screen.tsx` → `-filter-bar.tsx` → `-collection.tsx` → `-scope.tsx` + `-table.tsx` + `-pagination.tsx` |
| `662:112` | `-LOADING` | Loading | `custom-request-queue-skeleton.tsx` (`query.isPending` branch of the collection) |
| `662:182` | `-EMPTY` | True/default empty | collection empty branch, `data-testid="request-queue-empty"`, no reset offered |
| `662:243` | `-FILTEREMPTY` | Filter empty | same branch under `isAnyQueueFilterActive`, `data-testid="request-queue-filter-empty"`, filters preserved + reset offered |
| `662:306` | `-ERROR` | Load error | collection failure branch, `role="alert"`, bounded copy, explicit retry |
| `663:9` | `-NARROW-1280` | Narrow desktop | `custom-request-queue.scss` — `table-layout: fixed` + `colgroup` tracks; measured at 1280 in §K |

Route: `apps/admin/src/app/(protected)/requests/page.tsx` — a thin boundary
inside the existing protected group, no prefetch (the `APP3-A02` precedent: the
filters live in the URL and B04 marks the response `no-store`).

---

## D. Api-client use

Added to the curated boundary `packages/api-client/src/index.ts`, consumer-driven
and one operation wide:

```text
adminCustomRequestList                                (operation)
AdminCustomRequestListStatusItem                      (value)
AdminCustomRequestListSubjectKind                     (value)
AdminCustomRequestQueueItemResponseStatus             (value)
AdminCustomRequestQueueItemResponseSubjectKind        (value)
AdminCustomRequestListParams                          (type)
AdminCustomRequestQueueResponse                       (type)
AdminCustomRequestQueueItemResponse                   (type)
AdminCustomRequestQueueResponseAppliedStatusesItem    (type)
```

`adminCustomRequestDetail` and every `APP5-B05` moderation operation deliberately
remain **off** the boundary — asserted in
`test/components/custom-request-queue-render.test.tsx` (“reaches no APP5
moderation or detail operation from this screen”), which reads them through
`jest.requireActual` and finds them `undefined`.

Confirmed: **no** raw endpoint string anywhere in the feature (the URL exists
only inside the generated tree), **no** edit to
`packages/api-client/src/generated/**`, and **no** OpenAPI or client
regeneration was run.

---

## E. Queue fields

Rendered per row: request code (row header), status badge, subject kind + subject
summary, customer display name, submitted instant, total quantity, detail link.

The row component never sees the raw response. `model/custom-request-queue-rows.ts`
projects `AdminCustomRequestQueueItemResponse` into `CustomRequestQueueRow`:

- `customerId` is **not on the projection at all** — nothing on this screen
  addresses a customer;
- `requestId` survives only as `detailHref`, i.e. as a route key, and is never
  rendered as text (asserted in the model test and again on the live DOM in §K);
- an absent `customerDisplayName` or `subjectSummary` is stated as the fact it is
  ("Khách chưa đặt tên hiển thị", "Không còn thông tin sản phẩm"), never filled in.

No CRM action, raw contact column, quotation, price, payment, order, production or
inventory field appears. No moderation control appears.

---

## F. Filters, and how `appliedStatuses` is honoured

| Control | Wire | Semantics |
| --- | --- | --- |
| Trạng thái | `status` (repeatable) | Default option `triage` sends **no parameter**, so B04 applies its own pre-quotation triage set. Any other option sends exactly that one canonical status, APP6 states included, which B04 answers truthfully. |
| Đối tượng thêu | `subjectKind` | `all` sends no parameter; otherwise `CATALOG` or `CUSTOMER_OWNED`. |

Both live in the URL (`?status=…&subject=…`), the `APP2-A02`/`APP3-A02`
convention, with `router.replace` and `scroll: false`. Reading is total: an
arbitrary, repeated or hand-edited value normalizes to the default and is never
echoed into the DOM. Only whitelisted values are accepted.

**`appliedStatuses` is the only source of the scope statement.** The screen never
prints its own idea of the default. `CustomRequestQueueScope` renders
`Đang hiển thị trạng thái: …` from `pages[0].appliedStatuses` plus the line
*"Hàng đợi chỉ hiển thị các trạng thái nêu trên, không phải toàn bộ yêu cầu"* —
so the queue never implies it is the whole table. It is rendered in the populated
**and** the empty states, because an empty triage queue still has to say which
statuses it triaged. Live evidence in §K: the default load stated the triage
triple; a `CANCELLED` filter made the very same line state only "Đã huỷ".

Not implemented, and why: `code` (exact whole-value), `submittedFrom`/`submittedTo`
and the `contactKind`+`contact` pair — see §B.1. There is **no** fuzzy or general
CRM search anywhere; the filters test asserts zero textboxes, zero searchboxes and
zero date inputs on the screen.

---

## G. Pagination

- `useInfiniteQuery`, the Admin convention (`APP2-A02`, `APP3-A02`), reused
  unchanged.
- The cursor is **opaque**: passed back exactly as issued, never parsed, never
  turned into a page number. No offset, no page numbers, no total.
- `getNextPageParam` requires **both** `hasNext` and a non-empty `nextCursor`, so
  a stale cursor on a last page never produces a request; `hasNext === false`
  removes the control from the DOM entirely.
- Server order (`created_at DESC, id DESC`) is never disturbed. Accumulation keeps
  the first occurrence of a `requestId` seen twice, so a keyset window shifted by
  a concurrent submission cannot render one request twice.
- Duplicate prevention is **native**: the button carries `disabled` +
  `aria-busy` while `isFetchingNextPage`. Proven in the browser against a
  deliberately slow page (§K): three further forced clicks while the page was in
  flight produced **zero** extra requests.
- A filter change addresses a different query key, so the cursor chain is
  structurally unreachable rather than reset by a remembered rule. Proven both in
  jsdom and in the browser.
- A rejected cursor (`400`) is distinguished from a transport failure and offers a
  first-page reload rather than a retry that can never succeed.

---

## H. Empty and error states

| Situation | Node | Rendered |
| --- | --- | --- |
| Server answered with no rows, no filter active | `662:182` | "Chưa có yêu cầu nào cần xử lý" + the scope line. No reset (nothing to reset), no creation CTA (an operator never raises a customer's request). |
| Server answered with no rows under a filter | `662:243` | "Không có yêu cầu nào khớp bộ lọc" + the scope line + **reset**. Filters stay visible and selected. |
| First page failed | `662:306` | `role="alert"`, bounded title/body, explicit "Thử lại". |

A load error is never turned into an empty result: the empty branch is reached
only after a page actually answered. The failure copy is chosen by
classification alone — the server `message`, `code` and `requestId` are never
read for display, so no SQL, stack or constraint text can reach an operator
(asserted in jsdom and on the live DOM in §K with a fabricated
`relation "custom_requests" does not exist` message).

---

## I. Detail hand-off

Each row links to `/requests/{requestId}` via
`adminCustomRequestDetailRoute(requestId)`. Live hrefs verified in §K.

`APP5-A02` content is **not** implemented: no detail segment, no moderation
control, no asset delivery, no transition. No route boundary was added beyond
`/requests` itself — the detail route is A02's to create, and a stub would be a
screen that exists without content.

---

## J. Validation ledger

| Command / test | Impact reason | Result | Reruns |
| --- | --- | --- | ---: |
| `pnpm --filter @embroidery/admin typecheck` | New feature, new route segment, changed shell nav | **PASS** | 3 (after the lint fixes, after the serializer fix, final) |
| `pnpm --filter @embroidery/api-client typecheck` | Curated exports changed | **PASS** | 0 |
| `pnpm --filter @embroidery/admin exec jest --testPathPatterns="custom-request-queue\|requests-navigation"` | The A01 model, render, filter, pagination and shell-entry suites | **PASS** — 5 suites / 58 tests | 3 (after Prettier, after the serializer test was added) |
| `pnpm --filter @embroidery/admin exec jest --testPathPatterns="admin-shell-model\|design-template-navigation"` | The nav entry changes an input both suites assert on | **PASS** — 2 suites / 18 tests | 1 (both were **red at entry HEAD**; see §M) |
| `pnpm --filter @embroidery/admin exec eslint <changed paths>` | Changed-file lint | **PASS** | 2 (after 4 fixes) |
| `pnpm --filter @embroidery/api-client exec eslint src/index.ts` | Changed-file lint | **PASS** | 0 |
| `pnpm exec prettier --check <changed paths>` | Changed-file formatting | **PASS** | 2 (after `--write`) |
| `git diff --check` | Whitespace / conflict-marker hygiene | **PASS** — clean | 0 |
| Browser review (§K) | The one proof jsdom cannot give: the real query string, the real guard, the real layout | **PASS**, one defect found and fixed | — |

Explicitly **not** rerun, per the checkpoint brief §23: `APP5-B04`'s 71 tests and
every other backend suite (`B01`, `B02`, `B03`, `B05`, `B07`), `DB01`, the
Storefront `S01`/`S02` suites, the full Admin suite, full monorepo Jest, full
Playwright/E2E, API integration, DB regression, worker tests, OpenAPI generation
or check, generated-client generation or check, the Figma registry checker (the
registry is unchanged), stale APP3/APP4 gates, SonarQube, and any all-workspace
build or typecheck. No repository-wide aggregate command was run.

An Admin production build was not run: the route is a thin client boundary, and
typecheck plus the live browser evidence in §K cover it.

---

## K. Browser review

`admin.embroidery.local` through the Nginx gateway, authenticated as the operator
in a real session. The credential was requested from the operator for this run;
it is not recorded here, in any fixture, in any file or on any command line.
Viewports 1440×900 and 1280×900. Console: **0 unexpected errors** — the only
error logged was the `500` deliberately injected for the failure state.

### K.1 Live, against the real `APP5-B04`

| Step | Evidence |
| --- | --- |
| Unauthenticated `/requests` | `307 → /login`, the existing Admin guard; no A01-specific auth path |
| Default queue | `GET …/custom-requests?limit=20` → **200** from the real API |
| Effective scope | `Đang hiển thị trạng thái: Mới, Đang xem xét, Cần làm rõ.` — built from the server's real `appliedStatuses`, plus the "not the whole table" line |
| True empty (`662:182`) | The dev database holds **zero** requests, so the real answer was an empty page: true-empty state, filter-empty absent, no reset offered |
| Status filter | `?status=CANCELLED` → wire `?limit=20&status=CANCELLED` → **200**, `appliedStatuses: ["CANCELLED"]`, `items: []` |
| Filter empty (`662:243`) | Rendered under that filter, distinct from true-empty, scope line now reads only "Đã huỷ", reset offered, control still shows `CANCELLED` |
| Reset | Clean URL `/requests`, next request `?limit=20` with no `status`, control back to `triage`, scope back to the triage triple, true-empty state, reset control gone |

### K.2 With `GET /api/admin/custom-requests` stubbed at the browser network boundary

The dev database has no requests, so rows, pagination and the failure path were
driven by a Playwright route fulfilment — the strategy the checkpoint brief §21
explicitly permits. Everything under test is the real screen in the real shell.

| Step | Evidence |
| --- | --- |
| Rows | 3 rows: code, status, subject kind + summary, customer, `vi-VN` instant in a `<time dateTime>`, quantity, detail link |
| Truthful absence | A row with no `customerDisplayName` rendered "Khách chưa đặt tên hiển thị"; one with no `subjectSummary` rendered "Không còn thông tin sản phẩm" |
| Future state | `QUOTE_ACCEPTED` rendered as "Đã nhận báo giá" — named truthfully, with no action offered |
| No raw ids | The rendered table text contains no `0194…`/`0193…` identifier |
| Detail hrefs | `/requests/01940000-…-0001`, `…-0002`, `…-0004` — the only links in `main` |
| No forbidden controls | The only button in `main` is "Trang sau"; no moderation, quotation or payment control exists |
| Next page | One request carrying `cursor=opaque-cursor-page-2`; row appended in server order; control removed when `hasNext=false`; no request at rest afterwards |
| Duplicate prevention | With page 2 held in flight for 1.5 s: button `disabled`, `aria-busy="true"`, label "Đang tải…", and **three** further forced clicks produced **zero** extra requests (2 requests total for 2 pages) |
| Error (`662:306`) | `role="alert"`, bounded copy, no table, no empty state; the fabricated server message (`relation "custom_requests" does not exist at character 41`, `INTERNAL_ERROR`) appears **nowhere** in the DOM; no retry loop; the manual retry recovered the rows |
| Accessibility | Exactly one `h1` in `main`; 7 `th[scope="col"]`; the request code as `th[scope="row"]` per row; status rendered as text, never colour alone; the pagination control natively disabled rather than merely styled |

### K.3 Responsive — `663:9`

| Viewport | `documentElement` scroll/client | Table scroll/client | Columns | Overflowing cells |
| --- | --- | --- | ---: | --- |
| 1280 | 1280 / 1280 | 872 / 872 | 7 | none |
| 1440 | 1440 / 1440 | 1032 / 1032 | 7 | none |

No column is dropped and nothing scrolls horizontally, which is exactly what the
approved narrow reference requires. Reaching that took two fixes found by
measurement, not by eye — see §L.

---

## L. Three defects found in the browser

1. **The repeatable status filter was serialized as `status[]=…`.** Axios brackets
   array parameters by default. `APP5-B04` publishes `status` as a repeatable
   parameter and answers `400 BAD_REQUEST` with
   `{"field":"status[]","code":"UNKNOWN_FIELD"}` for the bracketed form — so the
   status filter would have failed for every operator, in production, while every
   jsdom assertion still passed: a component test observes the parameter *object*
   handed to the generated operation, which was correct all along. Fixed with a
   per-call `paramsSerializer: { indexes: null }` in the feature service — set
   there rather than on the shared browser client, because every other Admin
   screen sends scalars only and a platform-wide serializer change to fix one
   screen's array would be the wrong scope. A regression test now asserts the
   serializer reaches the generated operation's per-call config, and the live wire
   form (`?limit=20&status=CANCELLED` → 200) is recorded in §K.1.
2. **The detail affordance overflowed its column at 1280.** The actions track was
   8 % — 69 px for 96 px of non-wrapping text — pushing the table 25 px past its
   own box. Fixed by re-proportioning the `colgroup` tracks.
3. **The longest status label overflowed its badge at 1280.** "Đã nhận báo giá"
   with `white-space: nowrap` did the same thing. Fixed by widening the status
   track and letting the badge wrap: the status text is the only signal an
   operator has, so it wraps rather than being clipped.

---

## M. Two Admin tests were red at entry HEAD

Both assert on the shell's primary-navigation list, which this checkpoint appends
to, so both are directly affected and were repaired here:

- `test/components/design-template-navigation.test.tsx` expected exactly four nav
  ids; `APP4-A01` had already added a fifth (`customer-access-support`) without
  updating it.
- `test/model/admin-shell-model.test.ts` asserts every nav entry points at an
  implemented route, against a hand-kept `IMPLEMENTED_ADMIN_ROUTES` list that
  `APP4-A01` never extended with `/support/customer-access`.

Both now include the APP4 entry **and** `/requests`, and both pass. This is
recorded rather than silently fixed because it means the two suites had not been
run since `APP4-A01`.

---

## N. Dev-environment repair (not an A01 code change)

The browser review could not start until three environment faults were repaired.
None of them is caused by A01 and none changed application source:

1. **The gateway held a stale upstream IP.** Nginx resolved the API container at
   startup; the API had been recreated since and moved from `172.25.0.4` to
   `172.25.0.5`, so every `POST /api/staff/session` was a `502`. Fixed by
   restarting the gateway.
2. **The API container ran a stale image.** `docker-compose.dev.yml` bind-mounts
   only `apps/api/src`; `packages/*` come from the image, which had been built on
   Aug 15 — before `APP5-DB01`. The running process was serving a pre-`B04` build
   (`/api/admin/custom-requests` answered `404`), and any restart failed to
   compile with five `TS2339` errors, because the mounted `apps/api/src` referenced
   the DB01 columns that the baked `@embroidery/database` did not have. Fixed with
   `node tools/docker-dev.mjs build api` + `up -d api`; the API is now current and
   answers `401` unauthenticated on the queue route. **Anyone running this dev
   stack needs the same rebuild after a `packages/**` change.**
3. **The Admin dev server does not hot-reload the bind-mounted source reliably on
   this host.** Each of the three source/style fixes required
   `docker restart embroidery-dev-admin-1` before the browser saw it.

---

## O. Follow-ups

Carried, not solved here:

```text
APP5-B06 — Admin private request-asset delivery   (next checkpoint)
FU-APP5-S01-STUDIO-ENTRY-01
FU-APP5-S02-CONFIRMATION-SUMMARY-01
FU-APP5-S02-MASKED-CONTACT-01
FU-APP5-S02-NULLABLE-STRING-CONTRACT-01
```

`FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` remains **open and backend-owned**. A01
did not need a UI-boundary projection for it: the queue's two optional strings,
`customerDisplayName` and `subjectSummary`, are generated as `string | undefined`,
not as the `object | null` the S02 defect describes, so no cast was introduced
anywhere in this feature. The debt is not closed by this checkpoint.

Opened by this checkpoint:

```text
FU-APP5-A01-FILTER-SET-CONFIRM-01 — confirm the approved A01 filter set against the
  live `662:3` frame once Figma access is available; implement `code`,
  submitted-range and paired contact search only if the frame carries them (§B.1).
FU-APP5-A01-QUEUE-COUNT-01 — the D01 topbar open-request count has no B04 field to
  render; needs a backend count or a design amendment. No number is invented (§B.1).
```

---

## P. Files

Added:

```text
apps/admin/src/app/(protected)/requests/page.tsx
apps/admin/src/features/custom-request-queue/index.ts
apps/admin/src/features/custom-request-queue/components/custom-request-queue-screen.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-queue-filter-bar.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-queue-collection.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-queue-table.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-queue-scope.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-queue-skeleton.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-queue-pagination.tsx
apps/admin/src/features/custom-request-queue/components/custom-request-status-badge.tsx
apps/admin/src/features/custom-request-queue/hooks/use-custom-request-queue-filters.ts
apps/admin/src/features/custom-request-queue/hooks/use-custom-request-queue-query.ts
apps/admin/src/features/custom-request-queue/model/custom-request-queue-copy.ts
apps/admin/src/features/custom-request-queue/model/custom-request-queue-filters.ts
apps/admin/src/features/custom-request-queue/model/custom-request-queue-keys.ts
apps/admin/src/features/custom-request-queue/model/custom-request-queue-route.ts
apps/admin/src/features/custom-request-queue/model/custom-request-queue-rows.ts
apps/admin/src/features/custom-request-queue/model/custom-request-queue-failure.ts
apps/admin/src/features/custom-request-queue/model/custom-request-presentation.ts
apps/admin/src/features/custom-request-queue/services/custom-request-queue.service.ts
apps/admin/src/features/custom-request-queue/styles/custom-request-queue.scss
apps/admin/test/model/custom-request-queue-model.test.ts
apps/admin/test/components/custom-request-queue-render.test.tsx
apps/admin/test/components/custom-request-queue-filters.test.tsx
apps/admin/test/components/custom-request-queue-pagination.test.tsx
apps/admin/test/components/requests-navigation.test.tsx
apps/admin/test/support/custom-request-fixture.ts
docs/implementation/reports/APP5-A01-COMPLETION-REPORT.md
```

Modified:

```text
apps/admin/src/features/admin-shell/model/admin-shell-nav.ts        (one nav entry)
apps/admin/src/styles/main.scss                                     (one @use)
apps/admin/test/model/admin-shell-model.test.ts                     (route list, §M)
apps/admin/test/components/design-template-navigation.test.tsx      (nav id list, §M)
packages/api-client/src/index.ts                                    (curated exports)
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md                  (roadmap)
docs/implementation/SCOPED_COMMAND_INDEX.md                         (CMD-TEST-APP5-A01-ADMIN)
```

Unchanged, as required: `apps/api/**`, `apps/worker/**`, `apps/storefront/**`,
database migrations, `packages/contracts/openapi/**`,
`packages/api-client/src/generated/**`, and every Figma artifact and registry row.

All runtime source files are under the 400-line limit and all test files under
600; one component per file.

---

## Q. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = COMPLETE
APP5-B07  = COMPLETE
APP5-S01  = COMPLETE
APP5-S02  = COMPLETE
APP5-A01  = COMPLETE
APP5-B06  = INCOMPLETE  NEXT
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

---

## R. Risks and limitations

1. **The live Figma frames were never opened** (§B.1). The filter set and the
   absent queue count rest on the registry rows plus the D01 package
   documentation, not on the frames themselves. Two follow-ups carry this.
2. **Rows, pagination and the failure path were proven against a stubbed network
   boundary**, because the dev database holds zero custom requests. The default
   load, the status filter, the filter-empty state and the reset were proven
   live against the real B04.
3. **A multi-page keyset read was not exercised against the real API** for the
   same reason. The opaque-cursor round trip, the duplicate-click guard and the
   `hasNext=false` stop are covered by the stubbed browser run and by component
   tests.
4. **`appliedStatuses` was observed for two scopes only** — the triage default and
   an explicit `CANCELLED` — both live. A multi-status echo is covered in jsdom.
5. **The dev API image must be rebuilt after any `packages/**` change** (§N.2).
   That is a standing property of the dev compose file, not something A01 changed.

---

NEXT CHECKPOINT: APP5-B06 — Admin private request-asset delivery
