# APP3-A02 — Admin Design Template List — Completion Report

```text
APP3-A01    = COMPLETE — REVIEW_ACCEPTED
APP3-A01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B02A   = COMPLETE — REVIEW_ACCEPTED
APP3-A02    = COMPLETE — REVIEW_DELIVERED
APP3-A03    = READY — NOT STARTED

Commit A = b8e778a
Commit B = this report
```

One screen. No API contract change, no migration, no Figma mutation.

---

## A. Entry state

Recomputed from the repository, not from a prior report:

| Predecessor | Required | Recorded |
| --- | --- | --- |
| `APP3-D01` | accepted | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-D01-C1` | accepted | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B03` | accepted | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-A01` | delivered | `COMPLETE — REVIEW_ACCEPTED` |

The operator accepted `APP3-A01` and `APP3-A01-C1` at review, which this
checkpoint records in the phase plan. That acceptance is what made A02 the next
eligible frontend checkpoint.

Five design rows carry this screen, all `APPROVED_FOR_IMPLEMENTATION`:

```text
FIG-ADMIN-TEMPLATELIST-DESKTOP-DEFAULT
FIG-ADMIN-TEMPLATELIST-DESKTOP-LOADING
FIG-ADMIN-TEMPLATELIST-DESKTOP-EMPTY
FIG-ADMIN-TEMPLATELIST-DESKTOP-ERROR
FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT
```

The gate asserts the approval in **both** directions: these five approved, and
`APP3-A04`'s lifecycle rows still `REVIEW_REQUIRED`. A registry that approved
everything at once would fail it. No Figma node was created or modified.

---

## B. Scope delivered

One protected route, `/design-templates`, one primary-navigation entry, and one
feature directory. Two generated operations consumed:

```text
adminDesignTemplate_list     — the collection
adminDesignTemplate_create   — the DRAFT header
```

Surface unchanged: **32 paths / 37 operations / 81 schemas**. `openapi.generated.json`
and `packages/api-client/src/generated/` are byte-identical; nothing was
regenerated and no root script was added (still 30).

---

## C. The governing constraint — nothing claims a capability B03 lacks

This is the part of the checkpoint most worth reviewing, because every item
below is a place the approved design shows a control the contract cannot back.
Each is recorded as a deviation rather than faked.

| # | Design shows | Delivered | Why |
| --- | --- | --- | --- |
| 1 | search field | absent | `APP3-B03` publishes no text-search parameter |
| 2 | sort control | absent | the contract is created-at descending, only |
| 3 | page numbers + total | absent | a keyset page carries no total; a page count would have to be invented |
| 4 | version number per row | rephrased | see §D |
| 5 | row "open editor" | inert, with reason | `APP3-A03` owns the editor |
| 6 | row lifecycle actions | absent | `APP3-A04` owns them; its registry rows are still unapproved |

For (1)–(3) the toolbar states the constraint in Vietnamese rather than leaving
the operator to wonder where the search box went:

> Danh sách sắp xếp theo thời gian tạo, mới nhất trước. Không có tìm kiếm hay
> sắp xếp tuỳ chọn.

---

## D. Truthful cells

Two cells report less than the design assumes, and they are not the same case.

**Version — "not reported here", not "none".** `APP3-B03`'s list projection
calls `toSummaryView(template, undefined)`. No page ever carries
`currentVersion`. A cell reading *"chưa có phiên bản"* would therefore be a
false statement about every **published** template in the list, not a harmless
placeholder. The cell says where the number lives instead:

```text
Xem trong chi tiết mẫu
```

The distinction is modelled, not stringly-typed — `versionCell` returns a
discriminated union whose `not-in-list` case is structurally distinct from a
real version, and the gate anchors on the `return`, not on the string appearing
somewhere in the file.

**Scope — a real absence, stated.** The list *does* report placement scope, so
an absent one is a fact and is said plainly (*"Chưa gán phạm vi"*). When a scope
exists but its Product is not among the loaded filter options, only the fact is
stated (*"Đã gán phạm vi"*) — resolving the name would cost one request per row,
which is exactly the N+1 this screen is built to avoid.

---

## E. Pagination

Keyset, forward-only. The cursor is forwarded exactly as the server issued it
and is never decoded, parsed or rebuilt — a client with an opinion about the
cursor is how a keyset contract quietly becomes an offset one. A retry after a
failed continuation re-sends the *same* cursor rather than restarting.

A rejected cursor (`400`) is separated from a transport failure, because the
advice differs: a bad cursor never succeeds on retry, so the operator is told to
reload the list.

Filters live in the TanStack Query key, so changing a filter resets the
collection **structurally** rather than by remembering to reset it.

---

## F. Client boundary — the withheld operations

The operations this screen must not have are enforced as real absences on the
curated `@embroidery/api-client` export, and asserted mechanically in both the
gate and a boundary test:

```text
adminDesignTemplate_detail      withheld
adminDesignTemplate_publish     withheld
adminDesignTemplate_unpublish   withheld
adminDesignTemplate_archive     withheld
```

Worth stating explicitly, because it changes what the rule is for: **all four
already exist in the API contract.** They are not absent because the backend has
not built them. Nothing but this boundary stops a row from growing a publish
button or a per-row detail read. That was confirmed while testing the gate — a
mutation that added a `publish` path to the OpenAPI document did not change the
path count, because the path was already there.

The two consumed operations are imported in exactly **one** module,
`services/design-template.service.ts`. No component names a URL, and no raw
`fetch` or `axios` appears anywhere in the feature.

---

## G. Two defects found in the browser

Neither was visible in a passing test suite.

**G1 — the create `409` blamed the wrong thing.** The dialog reported a
conflict as *"Tên mẫu đã được dùng — hãy chọn một tên khác."* Creating the same
name twice against the live stack **succeeded**, which sent me to the source:
`deriveTemplateSlugBase` is a pure function of the name, and a collision falls
back to `deriveTemplateSlugFallback`, which appends the new Template's own id.
Two templates may share a name. The published `409` means *"No template address
could be reserved"* — the id-suffixed address collided too.

So the copy was wrong twice: it named a cause that was never the constraint, and
it prescribed a fix that does not apply (a retry gets a new id, hence a new
address; a different name changes nothing). Reclassified as
`address-unreserved` and rewritten to ask for a retry. The test that asserted
the old behaviour now asserts the new one *and* that the name is not blamed.

This is the checkpoint's own rule turned on itself — a string that claimed
knowledge the system did not have.

**G2 — the table starved its most important column.** Under `table-layout:
auto` the slack goes to the widest content, which here is the sentence
explaining why the edit control is inert. The template name — the one cell an
operator scans by — ended up the *narrowest* column (172px against 327px for
actions) and wrapped onto two lines. Fixed with a `colgroup` under
`table-layout: fixed`, which makes the proportions authoritative: name 289px,
actions 227px, every name and date on one line.

A note for the next frontend checkpoint: the Admin dev container did **not**
hot-reload either change. `colCount: 0` in the DOM after editing the component
is what exposed it. Both required `docker compose restart admin`.

---

## H. Validation evidence

Every command below was run; none is a repository-wide aggregate.

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/admin exec tsc --noEmit` | clean |
| `pnpm --filter @embroidery/admin exec jest` | **688/688**, 58 suites |
| `pnpm --filter @embroidery/admin exec jest --testPathPatterns=design-template` | **60/60**, 4 suites |
| `node tools/check-app3-a02.mjs` | 151 assertions pass |
| `node --test tools/check-app3-a02.test.mjs` | **21/21** |
| `node tools/check-app3-a01.mjs` | 185 assertions pass |
| `node tools/check-app3-b02a.mjs` | pass (after the fix in §I) |
| `node --test tools/check-app3-b02a.test.mjs` | **34/34** |
| `node tools/check-app3-g01.mjs` | pass |
| `node tools/check-figma-design-index.mjs` | 165 registry IDs pass |
| `pnpm lint` | 24/24 workspaces clean |
| `pnpm format:check` | clean |
| `pnpm --filter @embroidery/admin build` | clean; `/design-templates` registered |

Prettier was run **before** the final gate execution, because reformatting the
sources a gate parses can silently invalidate its anchors. It did not here, and
that was verified rather than assumed.

### The gate's own regressions found four weaknesses

The 21 regressions were written to break one ruled property each. Four failed
against the gate's first draft, and all four were real:

1. the "unreported version" rule matched the string anywhere in the file, so a
   union member `| { kind: 'not-in-list' }` satisfied it while `versionCell`
   fabricated a `v1`. Re-anchored to the `return`;
2. the command-index rule was `includes(id)` — a substring test that a renamed
   row still passes, and `CMD-CHECK-APP3-A02` is a prefix of
   `CMD-TEST-APP3-A02-ADMIN`. Now each row must bind the id **to the command it
   names**;
3. and (4) two were bugs in the test rather than the gate — a non-unique
   mutation anchor, and a mutation that added an OpenAPI path which already
   existed. The second is what established §F: the lifecycle operations are
   already published.

---

## I. Predecessor gate repaired

`tools/check-app3-b02a.mjs` required literally
`APP3-A01 = COMPLETE — REVIEW_DELIVERED`. Recording A01 as **accepted** — a
strictly stronger state — broke it. A predecessor getting *better* must never
fail a successor's entry check, so the rule now accepts either status. Its 34
regressions still pass.

---

## J. Browser review

Live PostgreSQL through the Nginx gateway at `admin.embroidery.local`,
authenticated as the operator. The credential was requested from the operator
for this run; it is not recorded here, in any fixture, or in any command line.

| Viewport | Verified |
| --- | --- |
| 1440 | empty state; create dialog (autofocus, server-derived slug note); populated list; status filter → `?status=PUBLISHED` with the *filtered*-empty copy, distinct from the true-empty copy; column proportions |
| 1280 | no horizontal overflow (`scrollWidth === clientWidth === 1280`), table intact |
| 390 | table `display: none`, card list, stacked filters, narrow subtitle, no overflow |

A freshly created template renders exactly as specified: `Bản nháp` ·
`Chưa gán phạm vi` · `Xem trong chi tiết mẫu` · inert edit control naming
`APP3-A03`. The success banner states DRAFT and zero versions.

Console: **0 errors, 0 warnings**.

Three templates were created in the dev database during this review. They are
development data on a disposable stack, not fixtures.

---

## K. Limitations

1. **Keyset paging was not exercised across a page boundary in the browser.**
   The dev database holds three templates, below the page size. Paging,
   cursor rejection and the filter-change reset are covered by component tests
   against a mocked client, not by a live multi-page read.
2. **The `address-unreserved` failure has no live reproduction.** Reaching it
   requires an id-suffixed slug collision. It is covered by a component test at
   the classification boundary.
3. **`FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01` remains open** and is unrelated to
   this screen.
4. **`FU-ADMIN-SHARED-DIALOG-01` remains open.** This screen's create dialog is
   the second hand-rolled Admin dialog; the shared primitive is still unowned.

---

## L. Files changed

Commit A `b8e778a` — 37 files, +4131 / −13.

```text
apps/admin/src/app/(protected)/design-templates/page.tsx        new
apps/admin/src/features/design-templates/                       new — 9 components,
                                                                4 hooks, 6 model,
                                                                1 service, 1 stylesheet
apps/admin/src/features/admin-shell/model/admin-shell-nav.ts    +1 nav entry
apps/admin/src/styles/main.scss                                 +1 import
apps/admin/test/                                                4 new suites + 1 fixture
apps/admin/test/model/admin-shell-model.test.ts                 route registry
apps/admin/test/components/admin-shell-drawer.test.tsx          see below
packages/api-client/src/index.ts                                +2 operations, +7 types
tools/check-app3-a02.mjs / .test.mjs                            new
tools/check-app3-b02a.mjs                                       entry rule widened
docs/implementation/SCOPED_COMMAND_INDEX.md                     +3 commands
```

The drawer focus-trap test enumerated today's navigation entries by name, so the
fourth entry broke a test about **focus** for a reason that had nothing to do
with focus. It now walks the rendered links generically and asserts the property
— focus stays inside and wraps — so a fifth entry will not break it either.

---

## M. Scoped commands registered

```text
CMD-CHECK-APP3-A02        node tools/check-app3-a02.mjs
CMD-TEST-APP3-A02         node --test tools/check-app3-a02.test.mjs
CMD-TEST-APP3-A02-ADMIN   pnpm --filter @embroidery/admin exec jest --testPathPatterns=design-template
```

---

## N. Status

`APP3-A02 = COMPLETE — REVIEW_DELIVERED`. Awaiting human review.
`APP3-A03` is the next eligible frontend checkpoint.
