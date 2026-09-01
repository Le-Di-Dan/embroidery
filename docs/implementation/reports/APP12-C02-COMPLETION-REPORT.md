# APP12-C02 — Admin Dynamic Category Management Authority

## A. Verdict

```text
APP12-C02 = COMPLETE
CORRECTION_USED = 0 / 1
NEXT_CHECKPOINT = APP12-C03
```

`APP12-C01-C1` moved the category **values** into the database. This checkpoint
gives an operator the means to change them. Production no longer requires a
source edit, a migration edit, a direct database mutation or a deployment to
create, rename, re-order, publish or withdraw a category.

Two things are reported that the brief did not anticipate, both below in full:

- **§B.4** — a documentation corruption introduced by `APP12-C01` and committed
  in `b9971ed6`, repaired here.
- **§G.1** — a conflict between the checkpoint's strict lifecycle and LC-04's
  authorised transitions, reported before implementation as §3 requires and
  resolved in favour of the strict stance.

---

## B. Preflight

### B.1 What was inspected

| Subject | Finding that shaped the design |
|---|---|
| `categories` schema (TBL-011) | Already carries `status`, `archived_at`, `display_order`, `is_indexable`, `updated_at`, `uq_categories__slug` and `ck_categories__status_allowed`. **No DDL is needed.** |
| `CategoryRepository` (DB7 port) | Has `create`/`changeStatus`/`findBySlug`/`findById`. No locking read, no list, no dependency count. Its only production consumer is `CategoryResolver`. |
| `CategoryResolver` | The single place a `categorySlug` becomes a `category_id`; accepts `PUBLISHED` only; called from both the draft **write** path and the Admin list **read** filter. |
| `ProductDraftService` / `ProductDraftRepository` | Category reassignment is `DRAFT`-only (`PRODUCT_EDITABLE_STATES = [DRAFT]`). A published product's category cannot be changed at all. |
| `ProductPublicationService` / `DrizzleProductPublicationRepository` | **The key finding.** `lockSnapshot` already takes `FOR SHARE` on the owning category row inside the publish transaction and re-reads its state under that lock. The race seam C02 needs already exists. |
| `AdminProductPublicationController`, `AdminProductionTransitionController` | Two established shapes: per-verb routes (APP2) and one `POST .../transitions` collection with a typed action (APP8-B04). The second is the newer, explicitly-argued convention. |
| Admin guards | `AuthenticatedAdminGuard` at controller level; `StaffOriginGuard` + `StaffJsonBodyGuard` on every mutation. |
| `ProductPublicationRecorder`, `audit_events`, `outbox_events` | Lowercase dot-namespaced actions, `SCREAMING_SNAKE` kinds, bounded `summary`, request id as correlation id, actor from request context with no fallback. Both `AUDIT_TARGET_KINDS` and `OUTBOX_AGGREGATE_KINDS` are application-level guards over open text — **no CHECK, no migration** to extend. |
| `CONSTRAINT_MEANINGS` | `uq_categories__slug` is already catalogued as `DUPLICATE_SLUG` / `CONFLICT`, so the arbiter's rejection maps without reading a driver message. |
| `wave2-operation-authority.ts` | Public-only matrix. Admin operations are outside it by construction. |
| `category-inventory.service.ts` (Admin) | Documents C02's obligation explicitly: add `GET /api/admin/categories`, and give the Product filter a way to name an archived category. |
| `db8-concurrency-context.ts` | Multi-actor harness with independent pools already exists (`product-publication-races`). No new harness needed. |

### B.2 Physical blockers

None. `schema delta = 0`, `migrations = 38`. `BLOCKED_DB_CHANGE_REQUIRED` was
not returned and no migration `0039` exists.

### B.3 The obligation C01-C1 recorded

`IMP-D062` §(6) required C02 to add `GET /api/admin/categories` and to make the
Admin Product filter able to name an archived category. Both are delivered — the
first as `adminCategory_list`, the second as the backend half (`CategoryResolver`
split, §K). The **UI** repoint remains `APP12-A01`'s, as §10 of the brief allows.

### B.4 A defect found in `10-MASTER-APPLICATION-ROADMAP.md` — repaired

`APP12-C01`'s documentation write corrupted the master roadmap. The whole
document had been **duplicated**: lines 1–91 were a second copy of the file whose
APP12 row was truncated mid-sentence at the `$` of
`` `^[a-z0-9]+(?:-[a-z0-9]+)*$` `` and had the file's own `# Master Application
Roadmap` heading spliced into it, with no closing table pipe. The signature is an
unquoted shell heredoc in which `` $` `` opened a command substitution.

This was committed in `b9971ed6` at the start of this session (that commit is the
previously-uncommitted C01/C01-C1 work). It is repaired here: the corrupt half is
removed, and the file is now byte-identical to `HEAD~1` except for the single
APP12 row, which carries the intended C01 text plus this checkpoint's. Verified
mechanically — 93 lines, 7 headings, one APP12 status row, ending in `|`.

No C01 *content* was invented or reconstructed; only the duplicate was deleted.

---

## C. Operation inventory

Four operations. The brief's preferred canonical shape, unchanged.

| # | Method | Path | Operation id |
|---|---|---|---|
| 1 | `GET` | `/api/admin/categories` | `adminCategory_list` |
| 2 | `POST` | `/api/admin/categories` | `adminCategory_create` |
| 3 | `PATCH` | `/api/admin/categories/{categoryId}` | `adminCategory_update` |
| 4 | `POST` | `/api/admin/categories/{categoryId}/transitions` | `adminCategory_transition` |

```text
operations = 4   (hard maximum 5)
delete     = none
bulk       = none
public mutation = none
```

**One transitions collection, not two verbs.** Publish and archive are the same
command against the same aggregate under the same guards, differing in the target
state. Two routes would publish two operation ids for one state machine and force
a client to know which move the lifecycle permits before it could ask — the
argument `AdminProductionTransitionController` already makes for LC-18, and the
convention this repository most recently locked.

### C.1 Route key — the internal UUID

`categoryId`, not `slug`. Two reasons:

1. Every Admin mutation in this repository is addressed by internal id
   (`productId`, `jobId`, `orderId`, `assetId`). Category would be the exception.
2. **`slug` is editable while a category is `DRAFT`.** Keying the mutation on the
   one field the mutation may change makes "rename the address" a request whose
   own address changes underneath it.

The public contract is untouched: `publicCategory_list` publishes no `id`, and
the C01 contract suite still asserts that.

---

## D. Admin list contract

`GET /api/admin/categories` → `AdminCategoryListResponse`.

Every operator-relevant state, unpaged and unfiltered, ordered `displayOrder ASC,
slug ASC` — the same total order the public inventory uses, with `slug` (unique,
CST-011) as the tie-breaker that makes it total.

Item shape:

```text
id                     stable Admin key (UUID)
slug
name
status                 DRAFT | PUBLISHED | ARCHIVED
isIndexable
displayOrder
archivedAt             absent unless ARCHIVED
updatedAt              the concurrency token
publishedProductCount
```

Deliberately absent: `description`, `seoTitle`, `seoDescription`, `createdAt`,
and any browser URL. The first three belong to a category *page* no checkpoint
has approved; the last is a Storefront route shape the API does not know exists.

`productCount` (all states) was **not** added. §9 permits it only if cheap *and*
genuinely useful to the approved D01 screen; the only decision it would inform is
the archive guard, which counts published products alone. A second number that
never changes an outcome is a number an operator has to be told to ignore.

The safety cap is 1 000 (`cap + 1` fetched, explicit failure rather than
truncation) — larger than the public 500 because this list carries drafts and
archived rows too.

---

## E. Create semantics

```text
POST /api/admin/categories
body: { slug, name, isIndexable, displayOrder }   strict, no other field accepted
```

- Always `DRAFT`. The client cannot choose a status and there is no
  create-and-publish shortcut: publication is a separate guarded decision because
  it is the moment a public URL comes into existence.
- `archived_at = null`.
- `name` trimmed, non-empty, ≤ 120 characters.
- `slug` matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 80 characters, **globally
  unique across every lifecycle state** — an archived category still owns its
  address.
- `isIndexable` and `displayOrder` are **required**, not defaulted: both columns
  are `NOT NULL` with no database default, and a server-invented position would
  silently place a new category at one end of the operator's own ordering.
- The slug is **not** derived from the name. This repository has no
  operator-facing category slug-derivation convention, and inventing one would
  mean the address of a public page was chosen by a transliteration table.
- Nothing is seeded, and no other category is renumbered.

Uniqueness is enforced twice on purpose: a pre-check inside the transaction so
the caller gets `CATEGORY_SLUG_CONFLICT` without aborting it, and the arbiter
itself, whose rejection maps to the same code through the existing constraint
catalog.

---

## F. Update semantics

```text
PATCH /api/admin/categories/{categoryId}
body: { expectedUpdatedAt, slug?, name?, isIndexable?, displayOrder? }
```

At least one editable field must be present: an empty patch that still advanced
the token would invalidate another operator's in-flight edit for no change.

| State | `name` | `slug` | `isIndexable` | `displayOrder` |
|---|---|---|---|---|
| `DRAFT` | mutable | **mutable** | mutable | mutable |
| `PUBLISHED` | mutable | **immutable** | mutable | mutable |
| `ARCHIVED` | read-only | **immutable** | read-only | read-only |

`ARCHIVED` is read-only rather than partially editable: no approved screen edits
one, and the row exists to keep its products' history addressable, not to be
curated. It is reported as `CATEGORY_INVALID_TRANSITION`, checked **after** the
slug rule so an archived slug edit still returns the specific
`CATEGORY_SLUG_IMMUTABLE` a client can explain.

The operation never writes `status` or `archived_at`. That is structural: the
repository's `updateGuarded` has no assignment for either column, so no patch
body can move a row through the lifecycle as a side effect of a rename.

The patch is reduced to fields that actually **differ** before it is written, so
the audit summary's `fields` list names what changed rather than what was sent.

---

## G. Lifecycle transition semantics

```text
POST /api/admin/categories/{categoryId}/transitions
body: { expectedUpdatedAt, action: PUBLISH | ARCHIVE }
```

```text
DRAFT ──PUBLISH──▶ PUBLISHED ──ARCHIVE──▶ ARCHIVED
```

The body names an **action**, not a target state: what the operator is doing is
theirs to say, and which state that lands in is the server's.

### G.1 Reported conflict with LC-04 — §3 of the brief

`docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` states that Category "mirrors
(DRAFT/PUBLISHED/ARCHIVED) with the same rules" as Product's LC-04, which
**authorises** two transitions this checkpoint refuses:

- `TR-LC04-04` `ARCHIVED → PUBLISHED` (relist);
- `TR-LC04-06` `DRAFT → ARCHIVED` (retire a never-published draft).

Reported before implementation, as §3 requires. Resolved in favour of the brief's
strict default, because LC-04 *authorises* those paths — it does not **require**
this surface to expose them. Not implementing an authorised transition narrows a
surface; implementing one the lifecycle forbids would contradict it. Concretely:

- a relist would first have to answer what happens to the products left behind
  under the archived category, which no approved rule states;
- retiring a never-public draft is a delete-shaped need with no operator screen
  behind it, and `ARCHIVED` is meant to be the durable-retirement fact.

Both are refused as `CATEGORY_INVALID_TRANSITION` and both refusals are asserted
by the lifecycle suite, so the decision is enforced rather than merely documented.
Either can be delivered later without changing this contract's shape.

### G.2 Publish

Requires the category still `DRAFT`, a valid non-empty `name` and a valid unique
slug (both guaranteed by the create/update rules and re-checked by the arbiter).
On success `status = PUBLISHED` and `archived_at` is left exactly as it was — a
publish never clears an archive fact it did not create. It seeds no product and
never changes `isIndexable`.

### G.3 Archive

See §I.

---

## H. Slug immutability

Editable in `DRAFT` only, frozen by publication and still frozen after archival.

The reason is that a published slug is a public URL key: the Storefront filters
on it, the sitemap advertises it, and a customer may hold a link to it. This
checkpoint delivers **no re-slugging, no redirect table and no alias table**, so
the honest contract is a refusal rather than a silent 404 for everyone holding
the old address. An operator who needs a different address publishes a different
category.

`name` is always editable in a non-archived state and never touches `slug` — the
one property that makes renaming a live category safe.

Proven: draft slug change allowed; published slug change refused
(`CATEGORY_SLUG_IMMUTABLE`); archived slug change refused; the row unchanged
after each refusal; duplicate slug refused as `CATEGORY_SLUG_CONFLICT` at both
create and update.

---

## I. Archive dependency guard

```text
published dependent products > 0  →  ARCHIVE refused
```

`CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS`, 409, message: *"Reassign or
unpublish the products in this category before archiving it."*

- Nothing is auto-unpublished, auto-reassigned, moved to `Khác`, or deleted.
  **There is no fallback category and none was introduced.**
- The refusal leaves both truths untouched — asserted on the rows, not on the
  response: category still `PUBLISHED` with `archived_at` null, product still
  `PUBLISHED` in the same category, category still in the public inventory.
- A **DRAFT** product is deliberately not a dependency: it has no public page to
  break, and blocking on it would make a category unarchivable for as long as any
  abandoned draft existed in it.
- On success `status = ARCHIVED` and `archived_at` is stamped. It is not a
  delete: the row, its products, their media and their history all survive, and
  the products keep pointing at it (REL-020 `restrict`).

The count is re-read **inside the transaction under the row lock**, never taken
from what the Admin client last displayed.

---

## J. Concurrency strategy

### J.1 The invariant

```text
NEVER:  category = ARCHIVED  AND  a product = PUBLISHED under that category
```

### J.2 How it holds — the seam already existed

`DrizzleProductPublicationRepository.lockSnapshot` (`APP2-B03`) already takes
`FOR SHARE` on the owning category row inside the publish transaction and
re-reads the category's state under that lock. C02 adds the exclusive
counterpart:

| Path | Lock on `categories` row |
|---|---|
| `adminCategory_transition` (archive) | `FOR UPDATE` — `AdminCategoryRepository.lockById`, taken **before** the dependency count |
| Product publish | `FOR SHARE` — unchanged, `APP2-B03` |
| Product create / category reassignment | `FOR SHARE` — **new**, `CategoryRepository.lockBySlug` via `CategoryResolver.requireActiveBySlug` |

The two modes are mutually exclusive, so whichever transaction arrives second
waits and then re-reads **committed** truth:

- archive first → the publish sees an `ARCHIVED` category and fails readiness;
- publish first → the archive counts the newly published product and refuses.

Lock ordering cannot deadlock: the archive takes the category lock and then reads
`products` **without** row locks, while the publish takes the product root first
and the category second. No advisory-lock subsystem was added, and no existing
lock was widened or changed in mode.

### J.3 What is deliberately *not* guaranteed

A **draft** product may be filed into a category that is being archived
concurrently. That is not the forbidden state: the product has no public page and
can never acquire one, because publish re-reads the category under the same lock
and fails readiness. Forbidding it would require blocking archival whenever any
draft existed in the category, which contradicts §I's — correct — rule that
drafts do not block archival.

This was found by a test that initially asserted the stronger property and failed
intermittently. The assertion was corrected to the property the design actually
guarantees rather than the property being weakened silently; the deterministic
half ("a reassignment into an **already archived** category is refused") is
asserted separately and without a race.

### J.4 Evidence

`admin-category-archive-races.integration.spec.ts`, two separately compiled
actors with their **own** connection pools against one disposable database — real
PostgreSQL backends that block on each other. `Promise.all` over one pool would
only queue statements. Four assertions, all on committed rows:

1. a concurrent archive/publish never commits the forbidden pair, and **exactly
   one** of the two is refused;
2. the same across three repeated rounds in **both** orders;
3. a reassignment racing an archive never leaves a published product under an
   archived category;
4. a reassignment into an already-archived category is refused
   (`PRODUCT_CATEGORY_INVALID`) and the product never leaves its category.

Observed interleaving from an instrumented run:
`["OK","PRODUCT_PUBLICATION_NOT_READY"]` — the archive committed, and the
concurrent publish, having waited on the lock, re-read an `ARCHIVED` category and
failed readiness. Had it read before the archive committed it would have seen
`PUBLISHED` and produced the forbidden pair; it did not.

Run four consecutive times, green each time.

---

## K. Product publication compatibility

Preserved exactly: a product may be assigned to, or published under, only a
`PUBLISHED` category. A `DRAFT` category is refused for assignment; an `ARCHIVED`
category is refused for new assignment and for reassignment. No enum membership
was reintroduced anywhere — existence is answered against rows.

### K.1 `CategoryResolver` split — a defect C02 would otherwise have created

Until C02, `PUBLISHED` was the only category state a running application could
produce, so one method served both callers of the resolver. C02 makes `DRAFT` and
`ARCHIVED` reachable, and at that moment the callers stop agreeing:

- `ProductDraftService` (**write**) must still refuse anything but `PUBLISHED`,
  and must hold the row still until it commits → `requireActiveBySlug`
  (share-locked, `PUBLISHED` only);
- `ProductDraftQuery` (**Admin list filter**) must accept any category that
  exists → `requireAnyBySlug` (unlocked, any state).

Without the split, the first category an operator archived would make
`GET /api/admin/products?categorySlug=…` answer **400** for exactly the products
that most need finding. That is a defect C02 itself would have introduced, so it
is repaired here rather than deferred (§42). Both failures still report
`PRODUCT_CATEGORY_INVALID` — the caller can act on no finer distinction.

The UI repoint (Admin form/filter onto `adminCategory_list`) stays with
`APP12-A01`.

---

## L. Error contract

Closed vocabulary, transport-free, translated to HTTP at exactly one point. No
message names a table, column, constraint, physical id, product or count.

| Code | Status | Raised when |
|---|---|---|
| `CATEGORY_NOT_FOUND` | 404 | No such category row. |
| `CATEGORY_SLUG_CONFLICT` | 409 | Another category holds that slug (pre-check, or `uq_categories__slug`). |
| `CATEGORY_SLUG_IMMUTABLE` | 409 | Slug change on a `PUBLISHED` or `ARCHIVED` category. |
| `CATEGORY_INVALID_TRANSITION` | 409 | The lifecycle does not allow that move; also any edit to an `ARCHIVED` category. |
| `CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS` | 409 | ≥1 published product depends on the category. |
| `CATEGORY_VERSION_CONFLICT` | 409 | Stale `expectedUpdatedAt`. |
| `CATEGORY_INVENTORY_TOO_LARGE` | 503 | The taxonomy exceeds one response; nothing partial is sent. |

Everything but "no such row" and the capacity bound is a **409**: the body is
well-formed, and what it asks for is no longer possible.

**No raw PostgreSQL text leaks.** The `uq_categories__slug` rejection is mapped
through the existing `CONSTRAINT_MEANINGS` catalog (`DUPLICATE_SLUG`), which
already produces a client-safe code and message; the service re-labels that code
as `CATEGORY_SLUG_CONFLICT`. Anything else propagates untouched and is redacted
by the platform filter.

### L.1 Repeated transitions

A repeated `PUBLISH` on an already-published category is **refused**, not
silently accepted, matching the existing Product publication convention
(`PRODUCT_PUBLISH_NOT_ALLOWED`): the second caller is acting on a state that no
longer exists and must be told so. There are no duplicate lifecycle side effects
— the guarded UPDATE carries the source state, and the audit and outbox rows are
written only on a successful transition, in the same transaction.

---

## M. OpenAPI delta

Measured, not targeted.

```text
paths       117 -> 120   (+3)
operations  129 -> 133   (+4)
schemas     254 -> 260   (+6)
```

New schemas: `AdminCategoryResponse`, `AdminCategoryListResponse`,
`AdminCategoryListItemResponse`, `CreateCategoryBody`, `UpdateCategoryBody`,
`TransitionCategoryBody`.

Family split after C02: **84** `admin*`, **44** `public*`, 3 `staff*`,
2 `health*`.

```text
public operations = 44        unchanged
G02 public matrix = 31 DENY / 13 ALLOW   unchanged
release flag      = unchanged
```

Two enums are published and both are **rules**: `status`
(`DRAFT|PUBLISHED|ARCHIVED`) and `action` (`PUBLISH|ARCHIVE`). **No category
value enum appears anywhere** — every `slug` field publishes the pattern
`^[a-z0-9]+(?:-[a-z0-9]+)*$`, asserted per schema by the contract suite.

`pnpm --filter @embroidery/api openapi:check` → **PASS**.

---

## N. Generated-client delta

Regenerated canonically (`pnpm --filter @embroidery/api-client generate`); no
generated file was hand-edited. `check:generated` → **PASS** (tree hash
`919e592c…`).

Exposed on the `@embroidery/api-client` boundary (`src/catalog.ts`):

```text
adminCategoryList, adminCategoryCreate, adminCategoryUpdate, adminCategoryTransition
AdminCategoryResponseStatus, TransitionCategoryBodyAction        (values — rule vocabularies)
AdminCategoryResponse, AdminCategoryListResponse, AdminCategoryListItemResponse,
CreateCategoryBody, UpdateCategoryBody, TransitionCategoryBody   (types)
```

No category-value enum crosses the boundary — there is none to cross. The stale
comment on `publicCategoryList` claiming C02's operations "do not exist yet" was
corrected in the same edit.

---

## O. Dynamic no-deploy proof

`admin-category-lifecycle.integration.spec.ts` boots the application **once** and
never rebuilds, restarts or re-imports it. Every category is created afterwards
**through the delivered Admin API** — there is no `insert into categories`
anywhere in the C02 suites, deliberately, because a SQL fixture would let the
suite pass while the operator surface did not work.

```text
1. application already running
2. adminCategory_create        -> DRAFT; absent from GET /api/public/categories
3. adminCategory_transition    -> PUBLISH
4. GET /api/public/categories  -> the new category is served
5. GET /api/public/products?categorySlug=<new>  -> 200
6. no source edit, no rebuild, no restart
```

```text
SOURCE_EDIT_REQUIRED_TO_CREATE_CATEGORY = false
DEPLOY_REQUIRED_TO_TEACH_CATEGORY_VALUE = false
```

Also proven with no source edit between steps: renaming a **published** category
changes the public label while the slug is untouched; changing `displayOrder`
re-orders both inventories on the next read; flipping `isIndexable` is reflected
immediately; archiving removes it from every public read while the Admin list
still shows it.

Slugs used are values no migration ever seeded, so a pass cannot be an accident
of `0033` reference data.

---

## P. Anti-hardcode proof

```text
node tools/check-category-source-of-truth.mjs
→ 2336 production source file(s) scanned; no compiled category values,
  no legacy taxonomy imports, no slug-to-label maps.        PASS
```

No C02 source file names a category. The policy module owns the lifecycle
vocabulary, the transition vocabulary, the slug syntax, the field bounds, the
ordering rule and the response cap — rules, all of them. `IMP-D062` stands
unmodified.

---

## Q. Live verification

Against the canonical local gateway, after rebuilding the dev API image (the
`@embroidery/persistence` change is baked into it; `apps/api/src` is bind-mounted).

### Q.1 Unauthenticated boundary — all as designed

| Method | Route | Result |
|---|---|---|
| `GET` | `admin.embroidery.local/api/admin/categories` | **401** |
| `POST` | `…/api/admin/categories` | **401** |
| `PATCH` | `…/api/admin/categories/{id}` | **401** |
| `POST` | `…/api/admin/categories/{id}/transitions` | **401** |
| `DELETE` | `…/api/admin/categories/{id}` | **404** — no such route |
| `POST` | `embroidery.local/api/public/categories` | **404** — no public mutation |
| `GET` | `embroidery.local/api/public/categories` | **200**, unchanged |

The public inventory still serves the seven existing dev categories unchanged; no
development category row was created, published, archived, renamed or re-ordered.

### Q.2 Authenticated operator flow — executed

The Admin credential is named in `.env-ignore`, so it was **requested from the
operator for this run** rather than read from `.env` (`CLAUDE.md` §8a). It was
never echoed, logged, written into a file that survived the run, committed, or
passed as a command-line argument; the session cookie jar was deleted and the
session ended (`DELETE /api/staff/session` → 204) when the flow finished. No
credential was rotated or re-seeded.

Every step below is a real request through the gateway against the development
API and database.

| # | Step | Result |
|---|---|---|
| 1 | `adminCategory_list` before | `CATEGORY_LIST_READ`, 5 items, all `PUBLISHED`, `publishedProductCount` 1/0/0/0/0 |
| 2 | `adminCategory_create` | `CATEGORY_CREATED` — `status = DRAFT`, `displayOrder 9001`, `isIndexable false` |
| 3 | `adminCategory_update` on the draft — slug **and** name **and** order **and** indexability | `CATEGORY_UPDATED`, all four applied, `status` still `DRAFT` |
| 4 | public inventory | draft **absent** |
| 5 | `adminCategory_transition PUBLISH` | `CATEGORY_TRANSITIONED` → `PUBLISHED`, `archivedAt` unset |
| 6 | public inventory, **same running process** | `{"slug":"c02-live-probe-doi","name":…,"isIndexable":true,"displayOrder":9002}` |
| 7 | slug edit while `PUBLISHED` | **refused** — `CATEGORY_SLUG_IMMUTABLE` |
| 8 | rename while `PUBLISHED` | `CATEGORY_UPDATED`, slug unchanged |
| 9 | archive `ao-thun` (`publishedProductCount = 1`) | **refused** — `CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS`, *"Reassign or unpublish the products in this category before archiving it."* |
| 9b | `ao-thun` after the refusal | still `PUBLISHED`, `archivedAt` unset — untouched |
| 10 | archive the probe (0 published products) | `CATEGORY_TRANSITIONED` → `ARCHIVED`, `archivedAt` stamped |
| 11 | public inventory / Admin list | **absent** publicly; Admin list still shows it as `ARCHIVED` |
| 12 | slug edit while `ARCHIVED` | **refused** — `CATEGORY_SLUG_IMMUTABLE` |
| 13 | relist (`ARCHIVE → PUBLISH`) | **refused** — `CATEGORY_INVALID_TRANSITION` (§G.1) |
| 14 | `DELETE /api/admin/categories/{id}` | **404** — no such route |

Step 9 is worth naming: the archive refusal was exercised against a *real*
category with a *real* published product, and left both untouched. No product was
created, unpublished, reassigned or deleted at any point.

Step 6 is the no-deploy proof at the gateway: a category that did not exist when
the API process started was created, published and served publicly with no source
edit, no rebuild and no restart.

---

## R. Test-data cleanup

**Suite data.** Nothing to clean: every row the C02 suites create lives in a
disposable PostgreSQL database that `createApiIntegrationContext` /
`createConcurrencyTestContext` provisions, migrates and **drops**, and the
harness refuses by name to run against the persistent development database.

**Live-verification data.** One category was created in the development database
(§Q.2) and removed afterwards:

```text
delete from categories where slug = 'c02-live-probe-doi' and status = 'ARCHIVED';
→ DELETE 1
```

Verified before deleting that it had **0** dependent products, and verified after:
the taxonomy is back to the original five (`ao-thun`, `thu-bong`, `khan`,
`quan-ao`, `khac`), all `PUBLISHED`, and the public inventory returns exactly
those five. No other row was created, and no product, asset or order was touched.

**What deliberately remains.** The five `category.*` audit rows and the two
`category.published` / `category.archived` outbox rows the probe generated
**cannot** be deleted — the DB3 append-only triggers refuse it:

```text
ERROR:  immutability violation: DELETE on frozen row of table audit_events is not permitted
ERROR:  immutability violation: DELETE on frozen row of table outbox_events is not permitted
```

That refusal is correct (INV-14, `fn_reject_mutation_conditional`) and was not
worked around. Evidence of an operator action that genuinely happened is exactly
what an append-only audit log is for; the rows are truthful, attributed to the
acting Admin, and reference a category id that no longer exists — which is the
case REL-103 (no foreign key on the audit target) exists to allow.

---

## S. Files changed

### New — API (11)

```text
apps/api/src/modules/catalog/domain/admin-category.policy.ts
apps/api/src/modules/catalog/domain/admin-category.errors.ts
apps/api/src/modules/catalog/domain/repositories/admin-category.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-admin-category.repository.ts
apps/api/src/modules/catalog/application/admin-category.projection.ts
apps/api/src/modules/catalog/application/admin-category.query.ts
apps/api/src/modules/catalog/application/admin-category.recorder.ts
apps/api/src/modules/catalog/application/admin-category.service.ts
apps/api/src/modules/catalog/presentation/admin-category.controller.ts
apps/api/src/modules/catalog/presentation/schemas/admin-category.request.ts
apps/api/src/modules/catalog/presentation/schemas/admin-category.response.ts
apps/api/src/modules/catalog/catalog-admin-category.module.ts
```

### New — tests (5)

```text
apps/api/src/modules/catalog/presentation/admin-category.contract.spec.ts
apps/api/test/integration/admin-category-lifecycle.integration.spec.ts
apps/api/test/integration/admin-category-archive-guard.integration.spec.ts
apps/api/test/integration/admin-category-archive-races.integration.spec.ts
apps/api/test/support/admin-category-fixtures.ts
```

### Modified — source (8)

```text
apps/api/src/bootstrap/app.module.ts                      register CatalogAdminCategoryModule
apps/api/src/modules/audit/.../audit-event.repository.ts  + CATEGORY target kind
apps/api/src/modules/catalog/application/category-resolver.service.ts
                                                          split into requireActiveBySlug / requireAnyBySlug
apps/api/src/modules/catalog/application/product-draft.service.ts    write path -> locked resolver
apps/api/src/modules/catalog/application/product-draft.query.ts      filter -> any-state resolver
apps/api/src/modules/catalog/domain/repositories/product.repository.ts  + lockBySlug
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-category.repository.ts  + lockBySlug (FOR SHARE)
packages/persistence/src/platform/outbox-event-store.ts   + CATEGORY aggregate kind
packages/api-client/src/catalog.ts                        Admin category boundary exports
```

### Modified — generated artifacts (3)

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

### Modified — tests (2)

```text
apps/api/src/modules/catalog/presentation/public-category.contract.spec.ts
apps/api/test/integration/catalog-draft-api.integration.spec.ts
```

Both carried assertions **directly invalidated by C02** (§42): the C01 suite's
"no operation anywhere writes a category" and its 129-operation count, and the
APP2 suite's "`/api/admin/categories` is unrouted". Each was narrowed to the
property that still matters rather than deleted — the public boundary must stay a
read (asserted), the public count must stay 44 (asserted), and the new Admin route
must answer **401** rather than 404 or 200 (asserted). No unrelated failure was
absorbed and no test was disabled.

### Modified — documentation (5)

```text
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md    + IMP-D063
docs/implementation/phases/APP12-...-READINESS.md             C02 COMPLETE, NEXT = C03
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md          C02 record + §B.4 repair
docs/implementation/SCOPED_COMMAND_INDEX.md                   + 4 CMD-TEST-APP12-C02-* rows
docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md           §3 amended: 120 paths / 133 ops,
                                                              public matrix explicitly unchanged
docs/implementation/reports/APP12-C02-COMPLETION-REPORT.md    this report
```

No historical APP2 report was rewritten.

---

## T. File-size evidence

```text
node tools/check-file-size.mjs --paths <28 changed source/test files>
→ Scoped file-size check passed (28 file(s), 6 above the review threshold).
```

Hard limits (400 source / 600 test): **none exceeded**. Above the review
threshold, with reasons:

| File | Lines | Note |
|---|---|---|
| `admin-category.controller.ts` | 335 | Four operations with full Swagger contracts. Splitting the transitions route into its own controller (the APP2/APP8 precedent) buys nothing here: the file is one cohesive HTTP surface and 65 lines under the hard limit. |
| `admin-category.service.ts` | 315 | Three use cases sharing the lock/token/conflict helpers. Splitting would duplicate them. |
| `admin-category-lifecycle.integration.spec.ts` | 502 | Under 600. Already split once — the archive guard and the races live in their own files, with shared helpers in `test/support/admin-category-fixtures.ts`. |
| `app.module.ts` (349), `outbox-event-store.ts` (364), `catalog-draft-api.integration.spec.ts` (556) | — | Pre-existing; C02 added 1–8 lines to each. |

---

## U. Validation

Every command was run; each is listed with its result.

| Command | Result |
|---|---|
| `git diff --check` | PASS (0) |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS |
| `pnpm --filter @embroidery/admin exec tsc --noEmit` | PASS |
| `pnpm --filter @embroidery/storefront exec tsc --noEmit` | PASS |
| `pnpm --filter @embroidery/persistence build` | PASS |
| `pnpm --filter @embroidery/api openapi:generate` | 120 paths / 133 ops / 260 schemas |
| `pnpm --filter @embroidery/api openapi:check` | PASS — artifact up to date |
| `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `919e592c…` |
| `pnpm --filter @embroidery/api-client check:generated` | PASS |
| `jest --testPathPatterns="admin-category.contract"` | 17/17 PASS |
| `jest --testPathPatterns="admin-category-lifecycle"` | 17/17 PASS |
| `jest --testPathPatterns="admin-category-archive-guard"` | 5/5 PASS |
| `jest --testPathPatterns="admin-category-archive-races"` | 4/4 PASS ×4 consecutive runs |
| `jest --testPathPatterns="release-gate\|catalog-draft\|product-publication\|product-projection\|admin-product\|public-product\|category\|audit\|outbox"` | **36 suites, 500 tests, all PASS** |
| `pnpm --filter @embroidery/api-client exec jest` | 8 suites / 53 tests PASS |
| `pnpm --filter @embroidery/api-client test` (smoke, `node --test`) | 7/7 PASS |
| `node tools/check-category-source-of-truth.mjs` | PASS |
| `node tools/check-file-size.mjs --paths …` | PASS |
| `eslint` (catalog, audit, bootstrap, new tests, persistence, api-client) | 0 errors |
| `prettier --check` (all changed files) | PASS |
| Live gateway probes, unauthenticated (§Q.1) | 401/401/401/401/404/404/200 as designed |
| Live authenticated operator flow (§Q.2) | 14 steps, every one as designed |

The release-gate contract test is inside the 500-test run above and confirms
**31 DENY / 13 ALLOW** unchanged.

Deliberately **not** run: the full monorepo aggregate (forbidden — `CLAUDE.md`
§9), UAT, performance, Figma gates, and the Storefront/Admin UI suites, which C02
does not touch. Their typechecks were run because the generated client changed.

No pre-existing failure routed to H01 was absorbed.

---

## V. DB / Storefront / Admin-UI / Figma freeze

```text
migrations        = 38          unchanged
schema delta      = 0           no DDL, no migration 0039
Storefront        = unchanged   0 files touched
Admin UI          = unchanged   0 files touched
Figma             = unchanged   no design work, no registry entry
SCSS / tokens     = unchanged
release flag      = unchanged
```

Two application-level guard lists were extended — `AUDIT_TARGET_KINDS` and
`OUTBOX_AGGREGATE_KINDS`. Both are write-time guards over **open text columns
with no CHECK by DB4 design**, which is exactly how `PRODUCT`,
`DESIGN_TEMPLATE`, `CONTACT_VERIFICATION_CHALLENGE` and
`CUSTOMER_MERGE_CASE` were added before. **No migration is implied or needed.**

The Admin Product form and filter still consume `publicCategory_list` — no
frontend file was changed at all, so the §10 "no visual change, no new screen, no
category-management UI" condition is satisfied trivially rather than by
inspection.

---

## W. Follow-up disposition

### Closed by this checkpoint

```text
operator category mutation backend                → CLOSED_BY_APP12_C02
direct DB / manual category management requirement → CLOSED_BY_APP12_C02
IMP-D062 §(6) obligation to add GET /api/admin/categories → CLOSED_BY_APP12_C02
Admin product filter 400 on an archived category (backend half) → CLOSED_BY_APP12_C02
Master roadmap duplication introduced by APP12-C01 → REPAIRED (§B.4)
```

### Remains open

```text
APP12-A01 → category-management UI; move the Admin Product form/filter onto
            adminCategory_list; present the slug lock and the archive refusal
APP12-C03 → final dynamic Storefront / SEO / route-authority verification
APP12-G03 → representative UAT dataset
```

### New follow-ups raised

```text
FU-APP12-C02-01 — LC-04 authorises ARCHIVED → PUBLISHED (relist) and
                  DRAFT → ARCHIVED, neither delivered (§G.1). Not blocking;
                  a relist needs a product decision about the products left
                  behind before it can be specified. Owner: unassigned.
FU-APP12-C02-02 — The §Q.2 live run left five category.* audit rows and two
                  outbox rows in the development database that the append-only
                  triggers correctly refuse to delete (§R). Harmless and
                  truthful; noted only so a later reader of the dev audit log
                  is not puzzled by a category id that no longer exists.
```

`APP12-A01` and `APP12-C03` are **not** marked complete.

---

## X. Roadmap

```text
APP12-C02 COMPLETE
APP12-C03 NEXT
```

```text
ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38
CORRECTION_USED = 0 / 1
PUSHED = false
```
