# APP12-A01 — Admin Dynamic Category Management UI — Completion Report

## A. Verdict

```text
APP12-A01 = COMPLETE
```

The Admin can now create, edit, publish and archive categories at one route,
and the Product screens take their category inventory from the Admin operation
rather than the public one. Eight live journeys pass in real Chromium against a
disposable PostgreSQL, the real API, the real Admin and the real gateway; the
database was dropped and the shared development stack carries zero rows from
this checkpoint.

No backend, OpenAPI, generated-client, migration, Storefront or Figma change.

---

## B. Entry authority

```text
APP12-S03-C1 = COMPLETE — PO PASS
APP12-S03    = COMPLETE_AFTER_C1
APP12-C02    = COMPLETE
APP12-C03    = COMPLETE
APP12-D01    = COMPLETE — PO APPROVED
ROADMAP_LOCK = LOCKED
CHECKPOINTS  = 38
APP12-A01    = NEXT  → COMPLETE
```

Verified against `phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md` §0.8 at
entry. `APP12-A02` was not started.

---

## C. C02 / D01 preflight

### C.1 API authority

All four operations were already on the curated `@embroidery/api-client`
boundary (`packages/api-client/src/catalog.ts`), released by `APP12-C02` for
this consumer. **No barrel change was needed and none was made.**

| operation | route | consumed by |
|---|---|---|
| `adminCategoryList` | `GET /api/admin/categories` | the screen, and both Product surfaces |
| `adminCategoryCreate` | `POST /api/admin/categories` | the create panel |
| `adminCategoryUpdate` | `PATCH /api/admin/categories/{categoryId}` | the edit panel |
| `adminCategoryTransition` | `POST /api/admin/categories/{categoryId}/transitions` | publish and archive |

Two contract facts shaped the implementation and are worth recording:

- **`AdminCategoryResponse` carries no `publishedProductCount`.** The mutation
  responses cannot be patched into a cached list row without either dropping the
  count or inventing one, so every write invalidates the inventory and the list
  is re-read. That is also what makes the count shown in an archive refusal the
  current one.
- **The list is unpaged and unfiltered**, and refuses rather than truncates when
  the taxonomy is too large. So the query key is unparameterised, there is no
  cursor, and `CATEGORY_INVENTORY_TOO_LARGE` makes the whole list unavailable
  with no retry offered — a retry cannot fix it.

### C.2 Design authority

`docs/design/FIGMA_DESIGN_INDEX.md`, both rows
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP12-D01-PO-001`, read at
their exact nodes in file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_12`:

| registry id | node | read |
|---|---|---|
| `FIG-APP12-A04-CATEGORY-LIST-DESKTOP` | `915:342` | full node tree + rendered image |
| `FIG-APP12-A04-CATEGORY-FORM-STATES` | `916:343` | full node tree (all three panels) + rendered image |

> The Figma MCP server was unreachable at the start of this session and the
> checkpoint was **held** rather than guessed at — every layer that does not
> depend on the frames was built first, and no component or string was written.
> The operator re-authorized it and both nodes were then read live. No frame was
> implemented from prose.

`FIGMA_DELTA = 0` — no node was created, modified or moved.

---

## D. Route and navigation

```text
Admin routes  25 → 26
new route     /categories
```

Confirmed by `next build`: `/categories` appears once in the route table.

| forbidden address | present |
|---|---|
| `/categories/new` | no |
| `/categories/[id]` | no |
| `/catalog/categories` | no |
| `/admin/categories` | no |
| `/danh-muc` | no |

`(protected)/categories` has **no child segment at all**, asserted in
`test/boundary/category-source.test.ts`. List, create and edit are one screen
because the approved frames draw a table and a form panel; a second address
would be a screen nobody designed.

### Sidebar

Exactly one entry added:

```text
Danh mục → /categories
```

Placed between `Sản phẩm` and `Bộ sưu tập`, which is exactly where `915:353`
draws it. Nothing was renamed, reordered, regrouped or removed — the resulting
order matches the approved sidebar item for item. Four existing navigation
tests that pin the whole `ADMIN_PRIMARY_NAV` id sequence were extended with the
one new id and otherwise left alone.

---

## E. Feature architecture

```text
apps/admin/src/features/categories/
├── components/   6 files — table, panel, fields, refusal, conflict, screen
├── hooks/        2 files — inventory query, three mutations
├── model/        9 files — route, copy, status, editability, form values,
│                            slug shape, conflict, failure, query keys
├── services/     1 file  — the one API seam
├── styles/       6 files — entry + 5 partials
└── index.ts             — the public barrel
```

`app/(protected)/categories/page.tsx` is thin: it resolves the screen and sets
the title, and holds no query, no state and no operation name.

Three deliberate boundary decisions:

- **The Product feature imports the category barrel**, for the slug rule, the
  assignability predicate and the inventory read. Those are facts *about a
  category*; duplicating any of them inside `products` is how a taxonomy
  acquires two authorities that can disagree.
- **`category-slug-shape.ts` moved** from `products/model/` to
  `categories/model/`. It was written where the only consumer then lived;
  `APP12-A01` adds the screen that authors a slug, and a slug rule with two
  definitions is a rule that can disagree with itself. One definition now.
- **`category-status.ts` stays inside the feature.** The category screen is its
  only caller — the same rule `gallery-status` followed until a second real
  caller landed (CLAUDE.md §5). The Product screens name a category by its
  **name**, never by its lifecycle state.

---

## F. Category list

`adminCategory_list` is the **sole** Admin category inventory. The screen holds
no category array, no slug list and no label map.

| column | source | node |
|---|---|---|
| Tên danh mục | `category.name` | `915:376` |
| Slug | `category.slug` | `915:377` |
| Trạng thái | `category.status` | `915:378` |
| Sản phẩm đang bán | `category.publishedProductCount` | `915:379` |
| Lập chỉ mục | `category.isIndexable` | `915:380` |

All three states render. Nothing is hidden and nothing is re-sorted: the server
ordering (`displayOrder` then `slug`) is the operator's editorial authority, and
a second sort here would be the one that quietly won. An archived row that
vanished would leave the products still filed under it unreachable from here.

`categoryId` is the React key and the mutation path parameter, and is **never
rendered** — asserted in the component test against the whole container text.

Indexability shows `Có`/`Không` only for a PUBLISHED category and `—` otherwise
(`915:416`, `915:425`): a draft's flag is not a sitemap promise anyone is
keeping.

---

## G. Create and edit

### Create

Exactly the four contract fields, and the server chooses the state:

```json
{ "name": "…", "slug": "…", "isIndexable": false, "displayOrder": 0 }
```

Not implemented, and asserted absent: a status picker, create-and-publish, an
auto-derived slug, Vietnamese transliteration, an automatic display order. The
create panel renders no publish and no archive control at all — there is no
record to transition yet.

### Edit

| state | name | slug | isIndexable | displayOrder |
|---|---|---|---|---|
| `DRAFT` | editable | editable | editable | editable |
| `PUBLISHED` | editable | **locked** | editable | editable |
| `ARCHIVED` | read-only | **locked** | read-only | read-only |

The matrix is closed by default: a lifecycle state this build cannot name edits
nothing and offers no transition.

`expectedUpdatedAt` is the record's own `updatedAt`, copied verbatim. It is
never composed from a clock and never rounded.

**Empty patches are refused before they are sent.** An update body carrying only
`expectedUpdatedAt` would spend a write, advance the concurrency token and
invalidate every other operator's in-flight edit, all to change nothing — so an
unchanged form closes the panel instead. An unchanged slug is also never sent
for a published category, which would otherwise be refused as
`CATEGORY_SLUG_IMMUTABLE` even though the operator changed nothing.

After a success the panel is **remounted** on `id:updatedAt` (the pattern the
product form already uses), so it is re-seeded from server truth with the fresh
token and no local state carried over.

### One authored control

`displayOrder` is required by `adminCategory_create` and drawn on neither frame.
A management screen without it could create categories but never re-order them,
and would be sending a value the operator never chose. It is rendered in the
drawn field language (`AdminTextField`, label + control + caption), with no new
component and no new token. Recorded as a design/contract reconciliation, not as
a design change.

---

## H. Slug lock

A published slug stays **on screen** — it is that category's public address and
the operator must be able to read it — but:

- the control is `disabled`;
- `🔒 khoá sau khi xuất bản` sits beside the label (`916:379`);
- `Đã xuất bản nên không thể đổi. Đổi tên không làm đổi slug.` explains it below
  (`916:382`).

Hiding it would answer "what is this category's URL?" with silence; disabling it
with no reason would look like a bug.

The chip required one **additive** prop on the shared `AdminTextField`:
`labelSuffix`, optional, rendered inside the `<label>` so it is part of the
control's accessible name. Every existing caller renders exactly as before.

---

## I. Publish and archive

| action | command | offered on |
|---|---|---|
| Publish | `adminCategoryTransition({ action: 'PUBLISH', expectedUpdatedAt })` | `DRAFT` only |
| Archive | `adminCategoryTransition({ action: 'ARCHIVE', expectedUpdatedAt })` | `PUBLISHED` only |

Neither is a status `PATCH`, asserted in the component test (`updateMock` is not
called). There is no optimistic published state: the badge changes only after
the server answers, because a category that appears `PUBLISHED` for a moment is
a category the operator believes has a live public URL.

Not offered, because the contract refuses them: `DRAFT → ARCHIVED`,
`ARCHIVED → PUBLISHED`, relist, restore, delete. No delete operation is even
named anywhere in the feature — asserted.

After a successful archive the row **remains** in the list with
`status = ARCHIVED`, the form is read-only, and a notice states plainly that
nothing reopens it.

---

## J. Archive refusal

On `CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS` the panel renders the
`916:393` refusal:

1. `✕ Không thể lưu trữ danh mục` — the symbol `aria-hidden`, the label carrying
   the meaning;
2. `Còn {n} sản phẩm đang bán thuộc danh mục này. Hãy chuyển chúng sang danh mục
   khác hoặc gỡ khỏi trang bán trước.`
3. `Xem {n} sản phẩm` → `/products?status=PUBLISHED&category={slug}` — exactly
   the products that are blocking it.

**The count is re-read.** The transition hook invalidates the inventory on
*failure* as well as on success, precisely because the refusal is the moment the
operator most needs the true number — the one they were shown before the attempt
is the one that just proved insufficient. The refusal survives that refetch
because the failed transition did not advance `updatedAt`, so the panel's
remount key is unchanged. An effect keyed on the record object would have
cleared the refusal at the very moment it became accurate; that was a real
defect found by the component test and fixed structurally.

Nothing is done to the products: no auto-unpublish, no auto-reassign, no move to
a fallback — there is no fallback category. The operator is taken to the
products and decides themselves.

---

## K. Error mapping

Classified by **domain code**, never by HTTP status. `APP12-C02` answers `409`
for five different situations with five different safe next actions; reading the
status would let the screen offer "reload and lose your edits" to an operator
whose real problem is that the slug is taken.

| code | surface |
|---|---|
| `CATEGORY_SLUG_CONFLICT` | the slug field, via `aria-describedby` |
| `CATEGORY_SLUG_IMMUTABLE` | the slug field |
| `CATEGORY_VERSION_CONFLICT` | the conflict alert (§L) |
| `CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS` | the refusal panel (§J) |
| `CATEGORY_NOT_FOUND` | panel message |
| `CATEGORY_INVALID_TRANSITION` | panel message |
| `CATEGORY_INVENTORY_TOO_LARGE` | whole-list unavailable, no retry |
| anything else | the safe generic Admin failure |

A `409` with no recognised code is an ordinary failure, not a conflict —
asserted directly.

No server `message`, `code`, HTTP status or `requestId` reaches the screen. The
component test drives real refusals carrying
`duplicate key value violates unique constraint`,
`products.category_id still referenced` and `expectedUpdatedAt is stale`, and
asserts none of that text appears in the document.

---

## L. Version conflict

Proved with **two real operator sessions** in the live run (journey F):

```text
A loads T1  →  B updates → T2  →  A saves T1  →  CATEGORY_VERSION_CONFLICT
```

Guarantees held, each asserted:

- **no blind retry** — exactly one `adminCategoryUpdate` call;
- **no overwrite** — no force flag, no "lưu đè"; B's write survives;
- **no silent loss** — A's edits are still in the form, exactly as typed;
- **a real next step** — `Tải lại bản mới nhất` refetches the inventory, the
  panel re-seeds from server truth, and the next save succeeds with the new
  token (asserted live).

Rendered as a panel alert rather than a modal, and this is a deliberate
divergence from the product form's `ProductConflictDialog`. That one is modal
because the product form owns the whole screen; here the form is a panel beside
the table and the decision is *about the values in that panel* — which edits are
worth re-applying after a reload. A modal would cover the one thing the operator
needs to read, and §9 explicitly requires that local edits are not silently lost.
The structure is otherwise the pattern verbatim: same title/body/two-action
shape, reload primary, keep secondary, no third option. `role="alert"` announces
it without stealing focus.

---

## M. Product form repoint

`apps/admin/src/features/products/services/category-inventory.service.ts` now
calls `fetchAdminCategories` and no longer names `publicCategoryList` — asserted
in both the boundary test and the live run.

Authoring offers **`status === PUBLISHED` only**, because `CategoryResolver` is
the one place a `categorySlug` becomes a `category_id` on the Admin write path
and it accepts nothing else. Offering a draft or archived option would be
offering a choice the save is guaranteed to refuse.

### A product whose category left the assignable set

The stored slug is then absent from the select, which would silently show the
placeholder as if the product had never had a category. Instead the **real name
is named**, with the approved next action:

```text
Danh mục hiện tại "{name}" không còn nhận sản phẩm mới. Chọn danh mục khác
trước khi lưu.
```

Four things this deliberately does not do: render `UNKNOWN`, map to a fallback
such as `Khác` (there is none), auto-select another option, or mutate the
product. Reassignment goes through the ordinary select and the ordinary Product
update contract.

---

## N. Product filter repoint

The filter reads the same operation and offers **every** lifecycle state —
`DRAFT`, `PUBLISHED` and `ARCHIVED`.

Not an oversight and not symmetry with the form: the form chooses where a
product *will* live, the filter finds products that already live somewhere. A
product filed under a since-archived category is still a real product with a
real category, and dropping that option would make it unfindable by the one fact
that distinguishes it. `APP12-C02` made archived-category filtering valid
deliberately, and this is the control that uses it.

The value stays `category.slug` and the label stays `category.name`, so the wire
key is unchanged and no status ever reaches the request. Server ordering is
preserved — asserted against an ordering that alphabetical sorting would change.

---

## O. Dynamic no-code proof

Live, in journey A → E, with **no source edit and no rebuild between them**:

```text
create  a01-qua-tang-doanh-nghiep-<runId>   through /categories
publish it                                  through the transitions collection
→ it appears in the Product authoring options
```

The slug is minted per run and is present in **no migration**: `0033` seeded
`thu-bong`, `khan`, `quan-ao`, `khac`, and the `ao-thun` row predates this
phase. The category the Product form ends up offering is one this build has
never seen, which is what makes the proof a proof rather than a restatement.

Also proved after archive (journey E):

```text
archived category  → NOT assignable in the Product form
archived category  → still present in the Product list filter
filtering by it    → an ordinary request, category=<slug>
```

### The anti-hardcode gate

```text
node tools/check-category-source-of-truth.mjs
→ 2531 production source file(s) scanned; no compiled category values,
  no legacy taxonomy imports, no slug-to-label maps.
```

The feature's own boundary test adds narrower assertions that fail with a file
name: none of the four historical slugs appears as a literal, `Khác` appears
nowhere, no `FALLBACK_CATEGORY`/`DEFAULT_CATEGORY`/`CATEGORY_LABELS`, and the
copy module's hyphenated keys are **pinned to the seven validation reasons** —
so a category slug added there fails the build.

---

## P. Accessibility and responsive

- Real `<table>` semantics with `<caption>`, `scope="col"` and `scope="row"`.
- Every control has a real `<label for>`; help and error text are wired through
  `aria-describedby` by `AdminTextField`. An error replaces help text rather
  than joining it.
- Status is **never colour-only**: every badge renders a symbol and a text
  label; the tone only tints the border and the text.
- The slug lock reason is inside the `<label>`, so it is part of the control's
  accessible name and a screen reader reaches it without hunting.
- The refusal and the conflict are `role="alert"`, announced on appearance
  without stealing focus, and both are ordinary buttons in the panel's tab
  order.
- Pending states are announced through the buttons' own labels
  (`Đang lưu…`, `Đang xuất bản…`, `Đang lưu trữ…`) and the whole field set is
  `disabled` while a write is in flight.
- A row opens from the keyboard alone — asserted live.

### Viewports

Both mandatory Admin widths pass live:

| viewport | table + all five column heads | horizontal overflow | panel reachable |
|---|---|---|---|
| 1440 | visible | none | yes |
| 1024 | visible | none | yes |

No 390 category design was invented: `APP12-D01` §L records Admin as desktop
operator tooling and introduces no second Admin breakpoint. The base stylesheet
stacks the panel under the table so the screen stays usable while the shell
drawer is in play at 1024; the two-column composition the 1440 frame draws
applies from the wide threshold upward.

---

## Q. Live disposable evidence

```text
command   pnpm --filter @embroidery/e2e-testing e2e:app12:a01
mode      app12-a01   runner=host   projects=1
database  embroidery_db7_e2e_2602891c162_26028  (disposable, migrations 1..38)
result    8 passed (13.7s)
teardown  cleanup verified: all E2E ports closed, disposable database dropped
```

| # | journey | result |
|---|---|---|
| 1 | A — route, sidebar, create/edit/publish, slug lock | PASS |
| 2 | B — duplicate slug refused on the field, then corrected | PASS |
| 3 | C — archive refused, latest count, link to blocking products | PASS |
| 4 | D — archive success, row stays, read-only, no relist | PASS |
| 5 | E — Product repoint, both directions | PASS |
| 6 | F — two actors, version conflict, no overwrite | PASS |
| 7 | 1440 and 1024 | PASS |
| 8 | keyboard operation, never colour-only | PASS |

Real staff authentication through the real login form on every journey. No
cookie injection, no token minting, no guard override.

The archive-refusal dependency (a PUBLISHED category already holding PUBLISHED
products) is supplied by borrowing `seedS01Catalog`, deliberately: a second
near-identical fixture would be duplication with no acceptance value, and the
rows keep their accurate `app12-s01-e2e` prefix. **Every category the run
authors is created through the real screen.**

---

## R. Database hygiene

```text
shared_dev_A01_category_rows_created = 0
shared_dev_A01_audit_rows_created    = 0
shared_dev_A01_outbox_rows_created   = 0
disposable_db_removed                = true
G03_data_created                     = false
```

Measured against the shared development database after the run:

| table | state |
|---|---|
| `categories` | 5 rows — `ao-thun` (2026-08-21) and the four `0033` rows (2026-09-02). 0 rows matching `a01-%` or `app12-s01-e2e%`. |
| `audit_events` | 1 row — `staff.credential.bootstrapped` (2026-09-02). 0 rows with a category `target_kind`. 0 rows since 2026-09-03. |
| `outbox_events` | 0 rows. |

No row-deletion cleanup was used anywhere: the disposable database was dropped,
which is the only cleanup that cannot leave something behind. The seeder refuses
outright any database not named `embroidery_db7_*`, so
`VALIDATION_GOVERNANCE.md` §3A.4 is enforced rather than remembered.

---

## S. Baseline freeze

| baseline | entry | exit |
|---|---|---|
| OpenAPI | 125 paths / 138 operations / 277 schemas | unchanged |
| public operations | 49 | unchanged |
| release matrix | 28 `STATIC_DENY` / 18 `STATIC_ALLOW` / 3 `SCOPE_GATED` | unchanged |
| migrations | 38 | 38 |
| DB schema | — | unchanged |
| Storefront routes | 20 | 20 |
| **Admin routes** | **25** | **26** |
| Figma | — | unchanged, `FIGMA_DELTA = 0` |
| global design tokens | — | unchanged, 0 added |

`git status` confirms no file under `apps/api`, `apps/storefront`,
`apps/worker`, `packages/api-client`, `packages/database` or `docs/design` was
touched. The `@embroidery/api-client` barrel already exported all four
operations, so no barrel change was required.

---

## T. Figma / source mapping

| surface | node | implementation |
|---|---|---|
| page header + action | `915:368`–`915:372` | `category-management-screen.tsx` |
| category table | `915:374`–`915:425` | `category-table.tsx` · `_category-table.scss` |
| BR-034 footnote | `915:426` | `category-management-screen.tsx` |
| sidebar entry | `915:353` | `admin-shell-nav.ts` |
| DRAFT form | `916:347`–`916:365` | `category-form-panel.tsx` · `category-form-fields.tsx` |
| PUBLISHED form + slug lock | `916:370`–`916:386` | `category-form-fields.tsx` · `admin-text-field.tsx` |
| archive refusal | `916:391`–`916:396` | `category-archive-refusal.tsx` |
| DS Button Primary / Secondary | `183:46` / `183:50` | `_category-panel.scss` |

Every Vietnamese string in `category-copy.ts` carries its node id, or is marked
`AUTHORED` where the frames draw no state. The authored set is: the archived
read-only form, the version conflict, the list's loading/empty/failure states,
one message per domain code, the validation sentences, and the `displayOrder`
field. Each is written in the voice the drawn refusal establishes — say what
happened, then the next action.

### Three reconciliations, recorded rather than silently resolved

1. **`spacing(20)`.** `916:347` draws 20px panel padding; the approved scale
   steps 16 → 24 and publishes no `spacing(20)`. Takes the nearest approved
   step rather than an off-scale literal, which would be a second spacing
   system.
2. **The archived badge tone.** `915:421` binds `Color/Text/Tertiary`, and the
   shared badge had no tone for it. Added `admin-status--muted`, bound to that
   exact token — additive, no existing caller changes, no new colour. Note that
   the gallery names its own `ARCHIVED` `warning` (`866:905`); the two are not
   reconciled here, because each screen implements the frame approved for it and
   a cross-surface tone review is `APP12-V01`'s question.
3. **`displayOrder`** — §G.

---

## U. Files changed

59 files. No file outside `apps/admin`, `packages/e2e-testing` and
`docs/implementation` was touched.

### New — the category feature (24 files)

```text
apps/admin/src/app/(protected)/categories/page.tsx
apps/admin/src/features/categories/index.ts
apps/admin/src/features/categories/model/           9 files
apps/admin/src/features/categories/services/        1 file
apps/admin/src/features/categories/hooks/           2 files
apps/admin/src/features/categories/components/      6 files
apps/admin/src/features/categories/styles/          6 files
```

### Modified — Admin (10 files)

```text
features/admin-shell/model/admin-shell-nav.ts        + one entry
features/products/services/category-inventory.service.ts  repointed
features/products/model/product-category-options.ts  PUBLISHED-only + real name
features/products/model/product-filters.ts           all states, doc rewritten
features/products/model/product-form-copy.ts         + two authored strings
features/products/model/product-form-values.ts       slug rule import
features/products/components/product-form-fields.tsx + stranded-category notice
features/products/index.ts                           + toFilterSearchString
shared/forms/admin-text-field.tsx + admin-field.scss + labelSuffix
shared/status/admin-status-badge.tsx + admin-status.scss  + muted tone
src/styles/main.scss                                 + one @use
```

### Moved

```text
features/products/model/category-slug-shape.ts → features/categories/model/
```

### Tests (12 files)

New: `test/model/category-model.test.ts`,
`test/components/category-management.test.tsx`,
`test/components/product-category-repoint.test.tsx`,
`test/boundary/category-source.test.ts`,
`test/support/category-fixture.ts`.

Modified: `test/support/product-fixture.ts` (category fixture migrated to the
Admin shape), `product-create.test.tsx`, `product-list-filters.test.tsx`,
`admin-shell-model.test.ts`, and four `*-navigation.test.tsx` files that pin the
whole nav id sequence.

### E2E (5 files)

```text
packages/e2e-testing/specs/app12/a01-categories.acceptance.spec.ts   new
packages/e2e-testing/specs/app12/support/a01-world.ts                new
packages/e2e-testing/scripts/run-e2e.mjs        + the app12-a01 mode
packages/e2e-testing/playwright.config.ts       + the app12-a01 project
packages/e2e-testing/package.json               + e2e:app12:a01
```

### Governance (2 files)

```text
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
docs/implementation/SCOPED_COMMAND_INDEX.md      + CMD-E2E-APP12-A01
```

---

## V. File-size evidence

```text
node tools/check-file-size.mjs --paths <every path this change owns>
→ Scoped file-size check passed (89 file(s), 0 above the review threshold).

node tools/check-scss-file-size.mjs apps/admin/src/features/categories/styles
→ SCSS file-size check passed (6 stylesheet(s), 0 above the review threshold).
```

Largest files: `category-form-panel.tsx` 267, `category-copy.ts` 228,
`category-form-values.ts` 200 — all under the 300 review threshold.

The stylesheet was written as one 391-line file and then **split by
responsibility**, not by line count: the page shell, the table, the form panel
and the two refusal surfaces change for four different reasons. `main.scss`
composes the entry only. The largest partial is 134 lines.

The scoped run also reports two pre-existing `FAIL` rows —
`products/styles/product-form.scss` (753) and `products/styles/products.scss`
(536). Neither file was modified by this checkpoint (`git status` confirms), and
both are historical debt this change did not introduce and did not widen.

---

## W. Validation

Every command below was run and its result is stated.

| command | result |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @embroidery/admin exec tsc --noEmit` | PASS |
| `pnpm --filter @embroidery/admin exec eslint .` | PASS, 0 problems |
| `pnpm --filter @embroidery/admin exec next build` | PASS — `/categories` in the route table |
| `npx jest` (Admin, full) | 1901 passed, 6 failed |
| `node tools/check-category-source-of-truth.mjs` | PASS — 2531 files |
| `node tools/check-app-scss.mjs admin` | PASS — 216214 bytes, 0 deprecations |
| `node tools/check-file-size.mjs --paths …` | PASS (89 files) |
| `node tools/check-scss-file-size.mjs …` | PASS (6 stylesheets) |
| `npx prettier --write` (changed files) | applied |
| `npx tsc --noEmit` (`@embroidery/e2e-testing`) | PASS |
| `npx eslint` (the two new e2e files) | PASS |
| `pnpm --filter @embroidery/e2e-testing e2e:app12:a01` | **8 passed**, database dropped |

### The six Admin failures are pre-existing

Measured at entry HEAD with the change stashed:

```text
HEAD          6 failed, 1838 passed, 1844 total
with A01      6 failed, 1901 passed, 1907 total
```

The **same six**, by name. They are boundary assertions about the
`@embroidery/api-client` barrel and the placement/gallery/APP5 curated surfaces,
left red by the barrel split that preceded this checkpoint. A01 introduced no
new failure and added 63 passing tests and 4 suites. Fixing them is not A01's
scope — see §X.

Not run, per §20: the full monorepo, the Storefront suite, the worker suite,
global UAT, performance, and any Figma write.

---

## X. Follow-up reconciliation

### Reconciled as instructed

```text
FU-APP12-C02-01  → NONBLOCKING_DEFER · NOT_REQUIRED_FOR_WAVE1
FU-APP12-C02-02  → INFORMATIONAL_CLOSED
```

Neither relist nor `DRAFT → ARCHIVED` was implemented.

### Not absorbed — routed as instructed

```text
S03-01 / 02 / 04        → APP12-V02
S03-03 / 05 / 08        → APP12-H01
S03-06                  → APP12-H02
S03-C1-01 / 02 / 03     → APP12-H01
```

### Raised by this checkpoint

| id | statement | owner |
|---|---|---|
| `FU-APP12-A01-01` | Six Admin boundary tests are red at entry HEAD and remain red: they assert against the `@embroidery/api-client` barrel's pre-split shape. Not A01's scope; they fail identically without this change. | `APP12-H01` |
| `FU-APP12-A01-02` | `CMD-E2E-APP12-S03` is absent from `SCOPED_COMMAND_INDEX.md` although the command exists in `package.json`. A01 added its own row and did not backfill S03's, to stay in scope. | `APP12-H01` |
| `FU-APP12-A01-03` | The Admin renders `ARCHIVED` as `muted` for a category and `warning` for a gallery entry, each per its own approved frame. A cross-surface tone decision is a visual-consistency question, not a checkpoint one. | `APP12-V01` |
| `FU-APP12-A01-04` | `products/styles/product-form.scss` (753) and `products/styles/products.scss` (536) exceed the CLAUDE.md §6 hard limit. Pre-existing; untouched here. | `APP12-V02` |

---

## Y. Roadmap

```text
APP12-A01 = COMPLETE
APP12-A02 = NEXT
```

`phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md` §0 `NEXT` and §0.8 rows 8
and 19 updated. `CHECKPOINTS = 38` and `ROADMAP_LOCK = LOCKED` are unchanged; no
checkpoint was invented, reordered, merged, split or renamed.

`APP12-A02` was not started. Nothing was pushed.
