# APP2-B03 — Product Publication Backend — Completion Report

**Verdict: `PASS`**

| | |
|---|---|
| Checkpoint | `APP2-B03` — Product publication readiness, publish and unpublish, including OpenAPI and generated API-client contracts (`APP2-C03` merged in) |
| Entry | `APP2-B03-G01` evidence Commit B `68c10ca059ebd6c48dfd5212140a6da9eb3d2e49` |
| Commit A | `35ebcffb4b680c95be7b85b872af95eae3219420` — `feat(api): implement product publication` (32 files, +4774/−46) |
| Operations added | exactly three |
| Migration | **none** |
| Pushed | **no** |

---

## A. Preflight and entry

`APP2_B03_PREFLIGHT = PASS`.

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` | `68c10ca059ebd6c48dfd5212140a6da9eb3d2e49` — exactly the `APP2-B03-G01` evidence Commit B |
| `git status --short` | empty — tracked and staged tree clean |
| Ignored `evidences/` | present, ignored, untouched (`!! evidences/`); not recreated, deleted, staged or claimed |
| `pnpm check:secrets` | pass — 348 documents, 1601 tracked files |
| `pnpm check:lifecycle` | pass — LC-04: 5 transitions, exactly one `PUBLISHED → DRAFT`, archive distinct |
| `node --test tools/check-lifecycle-consistency.test.mjs` | 10/10 |
| `pnpm quality` | exit 0 |
| `pnpm check:openapi` / `check:api-client` / `check:figma-design-index` / `db:check:manifest` | all pass |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 |
| `git diff --check` | clean |

The accepted `APP2-A03` security history rewrite, its three content-identical replayed commits, and the `APP2-B03-G01` reconciliation were **not** rewritten, amended or squashed. `APP2-A03-C2` was not created.

Known chain confirmed present and unchanged: `02fa373`, `d68e6ff`, `5dcde4b`, `7e3e498`, `2d92151`, `b6bdb3b`, `f9d1fa6` (A03-C1 evidence Commit D), `bd44980` (B03-G01 authority Commit A), `68c10ca` (B03-G01 evidence Commit B).

---

## B. Source and lifecycle audit

Read before any edit: `CLAUDE.md`; charter, product requirements, business rules, `07-ADMIN-OPERATIONS`, SEO/content, security, NFR, acceptance principles; `DB0_QUERY_CATALOG`, `DB0_REQUIREMENT_MATRIX`, `DB3_LIFECYCLE_SPECIFICATIONS`, `DB3_AUDIT_SPECIFICATION`, `DB4_RELATIONSHIP_AND_FK_MODEL`, `DB4_INVARIANT_SCHEMA_TRACEABILITY`, `DB5_FK_INDEX_REVIEW`, `DB6_DB7_DB10_HANDOFF`; `ADR-APP2-001`; the APP2 phase plan and pre-implementation audit; the `APP2-B01`/`W01`/`B02`/`B02-C1`/`A03`/`A03-C1` reports; and the catalog, asset, audit, platform schema and module trees.

Recorded facts, all read from source rather than assumed:

| Fact | Value |
|---|---|
| LC-04 states | `DRAFT` (initial) ↔ `PUBLISHED` → `ARCHIVED` |
| LC-04 transitions | 5 — `TR-LC04-01` `DRAFT→PUBLISHED`, `-02` `PUBLISHED→ARCHIVED`, `-03` `DRAFT→(hard delete)`, `-04` `ARCHIVED→PUBLISHED`, `-05` `PUBLISHED→DRAFT` |
| Canonical unpublish | `TR-LC04-05` `PUBLISHED → DRAFT` (IMP-D035) |
| Is `ARCHIVED` terminal? | "terminal-ish" — `TR-LC04-04` `ARCHIVED → PUBLISHED` is a distinct **relist** with `R` (reason required) |
| Publish precondition (authority text) | `TR-LC04-01` guard: "required public fields present" |
| Audit `action` convention | lowercase dot-namespaced (`staff.login.succeeded`, `staff.credential.rotated`) |
| Audit `target_kind` convention | `SCREAMING_SNAKE`; column is open `text`, **no CHECK** (DB4: "`action` and `target_kind` are open per DB4 (no CHECK invented)") |
| Outbox `eventType` convention | lowercase dot-namespaced (`asset.inspection.requested`, `order.created`) |
| Outbox `aggregate_kind` | open `text`, REL-104 polymorphic, **no CHECK** |
| B02-C1 monotonic `updatedAt` | `greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')`, computed by the database inside the same statement |
| Transaction convention | `TransactionManager.runInTransaction`; repositories open none (DEC-DB7-006) |
| Admin mutation guards | `AuthenticatedAdminGuard` at controller level; `StaffOriginGuard` + `StaffJsonBodyGuard` per mutation |
| Response envelope | platform success/error envelope; structured detail travels in `errors[]` as `{field, code, message}` |
| Operation-id policy | `<domainKey>_<methodKey>`, `OPERATION_ID_PATTERN`, uniqueness validated |

---

## C. Representability gate

**Result: representable. No migration.**

Directly verified before any source change:

| Required | Verified |
|---|---|
| LC-04 contains exactly five transitions | ✅ parsed from the `## LC-04` table |
| `TR-LC04-05` exists exactly once | ✅ |
| `PUBLISHED → DRAFT` exists exactly once | ✅ |
| `PUBLISHED → ARCHIVED` remains distinct | ✅ `TR-LC04-02` |
| DB3 completeness declares `5 TR` | ✅ |
| APP2 audit and phase plan agree | ✅ (`pnpm check:lifecycle` asserts all five) |

Durable facts required by the three operations, each already present in the 33-migration schema:

| Fact | Where |
|---|---|
| Product lifecycle status | `products.status` (`ck_products__status_allowed`) |
| Concurrency token | `products.updated_at` — no version column, B02-C1 mechanism |
| Category publication state | `categories.status`, `categories.archived_at` |
| Ordered Product media | `product_media.role`, `display_order` |
| Asset eligibility | `assets.kind`, `classification`, `status`, `deleted_at` |
| Derivative readiness | `asset_derivatives.kind`, `status`, `storage_key`, `is_watermarked` (CST-126) |
| Audit Event | TBL-072 `audit_events` |
| Outbox Event | TBL-073 `outbox_events` |

**One finding worth stating plainly.** The application-level closed sets `AUDIT_TARGET_KINDS` and `OUTBOX_AGGREGATE_KINDS` did **not** contain `PRODUCT`, and both are validated at write time (G-DB7-46 / G-DB7-47). This is *not* a persistence gap: `audit_events.target_kind` and `outbox_events.aggregate_kind` are plain `text` with no CHECK constraint by explicit DB4 design, because both references are justified polymorphic exceptions (REL-103, REL-104). The kinds are therefore application guards, and adding `PRODUCT` to each is a source change requiring no migration. `BLOCKED_BY_PRODUCT_PUBLICATION_PERSISTENCE_GAP` was correctly **not** raised.

No state was invented, no migration written, no alternative log introduced and no extra checkpoint created.

---

## D. The exact three-operation contract

| Method | Path | Operation id | Guards |
|---|---|---|---|
| `GET` | `/api/admin/products/{productId}/publication-readiness` | `adminProduct_publicationReadiness` | `AuthenticatedAdminGuard` |
| `POST` | `/api/admin/products/{productId}/publish` | `adminProduct_publish` | + `StaffOriginGuard`, `StaffJsonBodyGuard` |
| `POST` | `/api/admin/products/{productId}/unpublish` | `adminProduct_unpublish` | + `StaffOriginGuard`, `StaffJsonBodyGuard` |

No fourth operation. `adminProduct_archive` is neither called nor modified.

**Readiness** — authenticated, side-effect-free, no body, no lock, no transaction, no storage call, no Audit or Outbox write.

```ts
{ productId, status: 'DRAFT'|'PUBLISHED'|'ARCHIVED', updatedAt,
  eligible: boolean,
  requirements: { code: ProductPublicationRequirementCode; satisfied: boolean }[] }
```

**Publish / Unpublish** — strict body, exactly one field, unknown fields rejected:

```ts
{ expectedUpdatedAt: string }   // .strict()
```

Both return `{ productId, slug, status, updatedAt }` — the authoritative status and the advanced token, so a client that just published can unpublish without re-fetching.

### On the operation ids

The existing `AdminProductController` is 310 lines against a 400-line hard limit; three more fully decorated operations would have crossed it. Publication is also a distinct responsibility from draft management, so it received its own controller.

The default factory derives the operation id from the controller class name, which would have produced `adminProductPublication_*` and forked the public `adminProduct_*` family purely because of a file split. Each `@ApiOperation` therefore states its `operationId` explicitly. The ids are asserted twice: on the decorator metadata (unit) and on the built document (`build-openapi-document.spec.ts`), which is where the contract is actually real.

---

## E. Readiness matrix and codes

Closed, ordered, complete. Codes are literals — never built from an id, a field name or a template — so no identifier can leak through one.

| # | Code | Authority | Database facts | Satisfied when | Publish lock |
|---|---|---|---|---|---|
| 1 | `PRODUCT_NAME_READY` | `01-PRODUCT-REQUIREMENTS` §2.2 "Tên"; Q-01 product card | `products.name`, `products.slug` | both non-blank after trim | product `FOR UPDATE` |
| 2 | `PRODUCT_DESCRIPTION_READY` | `01-PRODUCT-REQUIREMENTS` §2.2 "Mô tả"; Q-02 detail output | `products.description` (nullable) | non-null and non-blank | product `FOR UPDATE` |
| 3 | `PRODUCT_CATEGORY_READY` | Q-01 filters public listings by category; IMP-D032 | `categories.status`, `categories.archived_at` | `status = 'PUBLISHED'` and `archived_at is null` | category `FOR SHARE` |
| 4 | `PRODUCT_PRICE_READY` | `01-PRODUCT-REQUIREMENTS` §2.2 "Giá sản phẩm nền"; Q-01 card price; IMP-D032 sentinel | `products.base_price_amount`, `currency_code` | currency `VND`, whole đồng, amount `> 0` | product `FOR UPDATE` |
| 5 | `PRODUCT_MEDIA_READY` | `01-PRODUCT-REQUIREMENTS` §2.2 "Hình ảnh"; Q-01 card image; IMP-D032 roles | `product_media` rows | ≥1 row, contiguous `display_order` from 0, first `THUMBNAIL`, rest `GALLERY` | media `FOR SHARE` |
| 6 | `PRODUCT_MEDIA_ASSETS_READY` | `ADR-APP2-001`; B01/B02 catalog-media lane | `assets.kind`, `classification`, `status`, `deleted_at` | every attached asset `CATALOG_MEDIA` + `PRODUCTION_SENSITIVE` + `ACCEPTED` + not tombstoned | `lockScopedByIds` `FOR SHARE` |
| 7 | `PRODUCT_MEDIA_DERIVATIVES_READY` | `APP2-DB01` (CST-126), `APP2-W01`; Q-01 image, Q-02 media | `asset_derivatives` | each asset has `THUMBNAIL` **and** `CATALOG_PREVIEW`, both `READY`, both `is_watermarked = false`, both with a durable `storage_key` | `lockDerivativesFor` `FOR SHARE` |

**Response exposure.** A requirement publishes a code and a boolean and nothing else. No Category UUID, Asset id, kind, classification, storage key, bucket, checksum, derivative key, inspection detail, SQL or constraint name reaches the wire — asserted as leak tests in three suites.

**Slug.** `products.slug` is `NOT NULL`, globally unique and server-derived, so it cannot be blank in practice. It is checked inside `PRODUCT_NAME_READY` as the product's other public identity rather than given an eighth code that could never be false; the rationale is recorded at the rule.

**Price is decimal-safe.** String and `BigInt` only. `numeric(14,2)` returns `250000.00`; a fractional part that is not all zeros is rejected rather than rounded, because VND has no minor unit (`ck_products__currency_scale`). Proved against `9007199254740993` (2^53+1), which any float-based comparison would get wrong.

**Vacuous satisfaction, stated deliberately.** With no media attached, requirements 6 and 7 are vacuously satisfied and only `PRODUCT_MEDIA_READY` fails. One missing fact reports one problem, not three.

**Exclusions, asserted by test.** No variant, SKU, inventory, shipping, discount, review, search, thumbnail URL, nonzero `display_order`, SEO title, SEO description or social-image requirement. No media **maximum** — the batch reads removed the only reason the earlier twelve-item cap existed. A test asserts the code set contains none of `VARIANT`, `SKU`, `INVENTORY`, `SEO`, `STOCK`, `URL`, `SHIPPING` and has exactly seven members, so a later checkpoint that adds one must delete a test that says it must not.

---

## F. Publish transaction

One `TransactionManager.runInTransaction`, in this order:

1. `lockSnapshot` — product root `SELECT … FOR UPDATE OF products` (join to `categories` for the slug).
2. Owning category re-read under `FOR SHARE`.
3. Ordered `product_media` read under `FOR SHARE`.
4. Product identity resolved; absent → `PRODUCT_NOT_FOUND`.
5. `expectedUpdatedAt` compared against the locked row → `PRODUCT_VERSION_CONFLICT`.
6. Source state must be `DRAFT` → `PRODUCT_PUBLISH_NOT_ALLOWED`.
7. Referenced Assets batch-locked `FOR SHARE` (`lockScopedByIds`).
8. Their derivatives batch-locked `FOR SHARE` (`lockDerivativesFor`).
9. Readiness recomputed by the **same pure evaluator** over the locked rows.
10. Not eligible → `PRODUCT_PUBLICATION_NOT_READY` with the unsatisfied codes; nothing has been written.
11. Guarded `UPDATE`: identity + allowed source states + exact token in one statement.
12. `updated_at` advanced by the accepted database-owned monotonic expression.
13. Audit Event appended.
14. Outbox Event appended.
15. Commit.
16. Authoritative safe data returned.

**Locking rationale.** The product is locked exclusively because this transaction intends to write it; category, media, Assets and derivatives are locked in share mode because it only needs them to stay as they are — an exclusive lock there would serialise unrelated publishes in the same category.

**A defect avoided.** Drizzle carries a *single* locking clause per select, so chaining `.for('update')` and `.for('share')` on one joined query silently keeps only the last — the product root would never have been write-locked. The snapshot is therefore three explicit statements. This is recorded at the code.

Forbidden and absent: N per-Asset or per-derivative reads (both are single batched statements); unguarded read-then-write; application wall-clock token; any object-storage call; Audit or Outbox written after commit; any exactly-once claim.

---

## G. Unpublish transaction

Lock product → verify identity → compare token → require `PUBLISHED` → guarded transition to `DRAFT` → advance token → Audit → Outbox → commit → return.

**Readiness is deliberately not re-run.** Withdrawing a product from public view must not depend on it still being publishable; a product whose category was archived after publication is exactly the one an operator most needs to withdraw. Proved by test.

**Deletes nothing.** Proved against raw rows: `status` and `updated_at` are the only changed columns; `slug`, `category_id`, `name`, `description`, `base_price_amount`, `currency_code`, `display_order`, `is_indexable`, `seo_*` and `archived_at` are byte-for-byte unchanged, and the `product_media`, `assets` and `asset_derivatives` snapshots are identical before and after.

`archived_at` is never written by either operation. No `UNPUBLISHED` state exists — `PRODUCT_UNPUBLISHED_STATE === 'DRAFT'` is asserted.

---

## H. Concurrency and replay

Reuses `APP2-B02-C1` exactly, via an extracted shared module so draft update, archive, publish and unpublish advance the token identically.

- public token = `updatedAt`; request token = `expectedUpdatedAt`
- database truth owns the comparison — the guarded `UPDATE` re-tests it
- a successful mutation advances the token strictly and monotonically
- the same token cannot succeed twice
- stale → `PRODUCT_VERSION_CONFLICT` → HTTP 409

**Classification, and one deliberate ordering.** The token is checked before the state. A caller replaying a token that already worked has a token that is *both* stale and pointing at a now-forbidden state; the token is the more precise answer, because it tells the client to reload. The state refusal is reserved for a caller holding a **current** token against a state that forbids the transition. Both branches are asserted separately at the HTTP layer.

Lifecycle outcomes, all proved live:

| From | Operation | Result |
|---|---|---|
| `DRAFT` | publish | `PUBLISHED` |
| `PUBLISHED` | publish | `PRODUCT_PUBLISH_NOT_ALLOWED` |
| `ARCHIVED` | publish | `PRODUCT_PUBLISH_NOT_ALLOWED` — `TR-LC04-04` relist is a separate transition with its own reason contract and is **not** reused |
| `PUBLISHED` | unpublish | `DRAFT` via `TR-LC04-05` |
| `DRAFT` | unpublish | `PRODUCT_UNPUBLISH_NOT_ALLOWED` |
| `ARCHIVED` | unpublish | `PRODUCT_UNPUBLISH_NOT_ALLOWED` |

No idempotency claim is made; there is no idempotency key. Archive is not implemented inside either operation.

---

## I. Audit

Written through the canonical `AuditEventRepository` in the same transaction as the transition.

| Field | Value |
|---|---|
| `actor` | `{ kind: 'ADMIN', adminId }` from the bound request actor — never from the body or the row |
| `action` | `product.published` / `product.unpublished` |
| `target_kind` | `PRODUCT` |
| `target_id` | `productId` |
| `summary` | `{ from, to }` — before/after status only |
| `correlation_id` | the active request id |
| `occurred_at` | `AuditClock` |
| `reason` | **absent** |

**Reason is deliberately not recorded**, per `DB3_AUDIT_SPECIFICATION.md`: the `R` on the Product/catalog row is archive/unarchive only, and the approved publication command carries a concurrency token and nothing else — a required reason would have to be fabricated by the server or force an unapproved request field. Asserted as `reason = null` in the live suite.

Never persisted: credentials, cookies, authorization headers, the request body, the full Product record, the description, price, media, Asset ids, storage facts, checksums, raw errors or SQL. There is no out-of-request fallback — an unattributable transition throws rather than being filed against an invented identity (asserted).

---

## J. Outbox consequence

Appended through the canonical `OutboxEventStore` in the same transaction (`@requiresTransaction`).

| Field | Value |
|---|---|
| `eventType` | `product.published` / `product.unpublished` |
| `aggregateKind` | `PRODUCT` |
| `aggregateId` | `productId` |
| `payload` | `{ schemaVersion: 1, productId, slug }` |
| `payloadSchemaVersion` | `1` |
| `status` | `PENDING` |

Exactly three payload keys, asserted. No Product snapshot, description, price, storage data, Admin identity, credential or header.

B03 implements **no** worker handler, CDN, public query or cache adapter. The Outbox row is the durable handoff; delivery remains at-least-once.

---

## K. Guards and safe errors

All three routes carry `AuthenticatedAdminGuard`. `publish` and `unpublish` additionally carry `StaffOriginGuard` and `StaffJsonBodyGuard`; readiness carries neither, because it takes no body and a body guard would document a contract it does not have. All asserted from route metadata and again over HTTP.

| Code | Status |
|---|---|
| `PRODUCT_NOT_FOUND` | 404 |
| `PRODUCT_VERSION_CONFLICT` | 409 |
| `PRODUCT_PUBLICATION_NOT_READY` | 409 |
| `PRODUCT_PUBLISH_NOT_ALLOWED` | 409 |
| `PRODUCT_UNPUBLISH_NOT_ALLOWED` | 409 |

Five distinct codes; no 409 is collapsed into another, and none is collapsed into `PRODUCT_NOT_EDITABLE`. They were added to the existing catalog product error vocabulary so the feature keeps one error type and one translation point.

Missing-requirement codes travel only through the **canonical** error shape — the platform's `errors[]` array — not a bespoke field.

**A defect caught while wiring that.** The platform mapper copies a structured entry only when `field`, `code` and `message` are all non-empty safe strings, so the obvious `field: ''` would have been silently discarded and the detail would never have reached the client. The literal `requirements` is used instead, and the reason is recorded at the constant. An HTTP test asserts all three codes of a bare draft arrive.

No SQL, constraint, raw driver message, stack, storage internal or request id is offered as user guidance (asserted by regex against the message).

---

## L. Architecture

| Layer | Component |
|---|---|
| Presentation | `AdminProductPublicationController`, `admin-product-publication.request.ts` (strict Zod), `.response.ts` (OpenAPI models) |
| Application | `ProductPublicationService` (orchestration), `ProductPublicationRecorder` (audit + outbox vocabulary), `product-publication.projection.ts` (safe mapper) |
| Domain | `product-publication.policy.ts` (states, closed code set), `product-publication.readiness.ts` (pure evaluator), extended `product-draft.errors.ts` |
| Persistence | `ProductPublicationRepository` port + `DrizzleProductPublicationRepository`; `product-concurrency-token.ts` (shared B02-C1 mechanism) |
| Module | `CatalogPublicationModule` |

**The readiness evaluator is a pure function** — no NestJS, Drizzle, transaction or I/O. That is what makes "publish re-evaluates exactly what readiness reported" a structural property rather than a promise about two code paths that must agree by inspection.

Boundaries held: controllers own HTTP only; the application owns orchestration; repositories own persistence and open no transaction; `TransactionManager` owns the transaction. Asset metadata is read only through the Asset module's public port (ADR-DB4-003) — no catalog code touches the asset tables. No hidden repository transaction, generic CRUD framework, duplicate Product aggregate, object-storage call or unrelated refactor.

Batch locking was added to the **narrowest existing** interface — `AssetRepository` gains `lockDerivativesFor` plus the non-locking batch siblings `findScopedByIds` and `listDerivativesFor`, so the read path is batched too without taking share locks a report has no business holding.

---

## M. Unit tests (Docker-free)

`product-publication.readiness.spec.ts` (35) and `product-publication-contracts.spec.ts` (18).

Covered: the three routes, methods and operation ids; controller- and method-level guards; strict bodies and five distinct unknown-field rejections; UUID path rejection; the closed set's order, completeness and absence of duplicates; `eligible` only when all satisfied; **each requirement failing independently** (18 cases); the zero-price sentinel; an inactive, archived and missing category; no media; a wrong first role; a non-contiguous order; an out-of-lane, non-`ACCEPTED`, tombstoned and absent Asset; a missing, non-`READY`, watermarked and storage-key-less derivative; no media maximum (40 images publishable); no variant/SKU/SEO requirement; decimal-safe price comparison including 2^53+1; exact projection field sets; leak tests; audit and outbox payload shape; the non-Admin actor refusal.

## N. Live PostgreSQL and races

All against disposable, fully migrated (33) databases.

`product-publication.integration.spec.ts` (22) — unknown product → safe 404; complete draft eligible; each incomplete fact individually not eligible; asset rejected *after* attachment; missing / not-ready / watermarked derivative; **readiness writes nothing** (product row, audit and outbox all unchanged across two calls); publish success; publish changes only `status` and `updated_at` with `archived_at` still null; exactly one audit + one outbox row with the exact payload keys; stale-token conflict then success with the fresh token; **not-ready publish leaves zero residue**; structured unsatisfied codes; **readiness changed between the GET and the publish is caught**; already-published and archived refusals; unknown-product 404.

`product-unpublish.integration.spec.ts` (7) — returns to `DRAFT` and is editable again through the real draft seam; **deletes nothing** (product row, media, assets and derivatives compared before/after); one audit + one outbox of its own, in order after the publish pair; does not require the product to still be publishable; refuses from `DRAFT` and from `ARCHIVED` with no audit written; stale token; replay reported as a conflict with no second event.

`product-publication-races.integration.spec.ts` (3) — **real parallel transactions on independent connection pools**, via the DB8 concurrency harness. Two concurrent publishes with the same token → outcomes exactly `['OK', 'PRODUCT_VERSION_CONFLICT']`, one transition, **one** audit row, **one** outbox event. The equivalent unpublish race → same result. And a lock-ordering proof: Bob rejects an attached Asset inside an uncommitted transaction while Alice publishes; Alice blocks on the `FOR SHARE`, the product is still `DRAFT` mid-flight, and once Bob commits Alice sees the rejection and refuses with `PRODUCT_PUBLICATION_NOT_READY`, leaving no audit or outbox row.

## O. API and gateway

`product-publication-api.integration.spec.ts` (13) — the full stack: envelope shape and per-operation success codes (`PRODUCT_PUBLICATION_READINESS_READ`, `PRODUCT_PUBLISHED`, `PRODUCT_UNPUBLISHED`), request metadata, exact documented field set and leak test, 401 without a session on all three, 403 from a foreign Origin on both mutations, 415 for a non-JSON body, 400 for a missing/malformed token and for an unknown field and a non-UUID id, safe 404, distinct 409s, and the three structured requirement codes.

**Live gateway smoke** (real Nginx → API, `Host: admin.embroidery.local`, real dev Admin session):

| Step | Result |
|---|---|
| Unauthenticated readiness | `401` |
| Login through the gateway | session established |
| Readiness on a real product with worker-produced derivatives | `PRODUCT_PUBLICATION_READINESS_READ`, `eligible: true`, all 7 codes satisfied |
| Readiness on a bare draft | `eligible: false`, missing `PRODUCT_DESCRIPTION_READY`, `PRODUCT_PRICE_READY`, `PRODUCT_MEDIA_READY` |
| Not-ready publish | `409` `PRODUCT_PUBLICATION_NOT_READY` with all three codes in `errors[]` |
| Foreign Origin | `403` |
| Stale token | `PRODUCT_VERSION_CONFLICT` |
| Publish | `PRODUCT_PUBLISHED`, status `PUBLISHED` |
| Unpublish | `PRODUCT_UNPUBLISHED`, status `DRAFT` |

The API container was rebuilt because `packages/persistence` is baked into the image rather than bind-mounted; `apps/api/src` is mounted. No credential was printed, logged, passed as a command argument or written anywhere: the dev credential was read from the ignored `.env` into a process environment and serialised straight into the request body, and the session cookie was held in a shell variable and never emitted.

**Disclosed residue.** The dev product used for the smoke was returned to its exact prior state — `DRAFT`, price `450000.00`, one media row, `archived_at` null — verified by direct query. Two `audit_events` rows and two `PENDING` `outbox_events` rows remain in the **development** database. That is correct behaviour, not a defect: audit is append-only by design (CST-098, S24 rejects DELETE), and the outbox rows stay `PENDING` because B03 implements no dispatcher. Nothing was deleted with raw SQL.

---

## P. OpenAPI and generated-client delta

| | Before (`68c10ca`) | After (`35ebcff`) |
|---|---|---|
| OpenAPI SHA-256 | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` | `c100df4e2a0b0721e5354f4f78d92312dcaeea5edd617775d8d8cd7062b34323` |
| Paths | 10 | 13 |
| Operations | 13 | 16 |
| Schemas | 22 | 27 |
| Client tree hash | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` | `7f2a67a325904e0584688dc2c0f54ac55ac1de5b06817a7faf1ccd3eec51da7f` |

Every pre-existing path and operation id is unchanged (`health_check`, `health_readiness`, `staffSession_create`, `staffSession_delete`, `staffSelf_get`, `adminAsset_list`, `adminAsset_upload`, `adminAsset_detail`, `adminProduct_list`, `adminProduct_create`, `adminProduct_detail`, `adminProduct_update`, `adminProduct_archive`). Exactly three added.

Changed generated files — **additions only, zero deletions**:

```
packages/api-client/src/generated/embroidery-api.schemas.ts  +81
packages/api-client/src/generated/embroidery-api.ts          +68
```

Generated through `pnpm openapi:generate` and `pnpm api-client:generate`; no generated file was hand-edited. `packages/api-client/src/index.ts` gains no new export — only the comment recording *why* the three publication operations stay withheld until `APP2-A04`, matching the boundary discipline already applied to `adminProductArchive`.

---

## Q. Frozen boundaries

| Boundary | Entry | Exit | Changed |
|---|---|---|---|
| Migrations | 33 | 33 | no |
| Tables | 78 | 78 | no |
| Columns | 833 | 833 | no |
| CHECK constraints | 190 | 190 | no |
| Schema fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | same | no |
| Figma registry | 72 IDs / 72 node rows | 72 / 72 | no |

Untouched: `apps/admin`, `apps/storefront`, `apps/worker`, `packages/object-storage`, `packages/database`, Nginx, Compose, `package.json` dependencies, `pnpm-lock.yaml`. No thumbnail endpoint, no public catalog endpoint.

---

## R. Commit A

```
35ebcffb4b680c95be7b85b872af95eae3219420
feat(api): implement product publication
32 files changed, 4774 insertions(+), 46 deletions(-)
```

New (19): the publication policy, readiness evaluator and its spec, repository port and Drizzle implementation, shared concurrency-token module, application service, recorder, projection, contracts spec, module, controller, request and response schemas, and five test files (`product-publication.integration`, `product-unpublish.integration`, `product-publication-api.integration`, `product-publication-races.integration`, `product-publication-fixtures`).

Modified (13): `app.module.ts`; `asset.repository.ts` + `drizzle-asset.repository.ts` (three batch reads); `audit-event.repository.ts` (+`PRODUCT`); `outbox-event-store.ts` (+`PRODUCT`); `product-draft.errors.ts` + spec (three codes, structured details); `drizzle-product-draft.repository.ts` (token module extracted); `build-openapi-document.spec.ts`; the generated client (2) and its barrel comment; the OpenAPI artifact.

---

## S. Validation

Every command below was run; none is claimed unrun.

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/persistence lint` | pass |
| `pnpm --filter @embroidery/persistence typecheck` | pass |
| `pnpm --filter @embroidery/persistence test` | **112/112**, 9 suites |
| `pnpm --filter @embroidery/api lint` | pass |
| `pnpm --filter @embroidery/api typecheck` | pass |
| `pnpm --filter @embroidery/api test` | **1351/1351**, 105 suites |
| `pnpm --filter @embroidery/api build` | pass |
| Focused publication suite (run 1) | **97/97**, 6 suites |
| Focused publication suite (run 2) | **97/97**, 6 suites — identical |
| `pnpm openapi:generate` / `pnpm check:openapi` | pass |
| `pnpm api-client:generate` / `pnpm check:api-client` | pass |
| `pnpm check:secrets` | pass |
| `pnpm check:lifecycle` | pass — LC-04: 5 transitions |
| `node --test tools/check-lifecycle-consistency.test.mjs` | 10/10 |
| `pnpm check:styles` | pass — 4 apps, 554 files |
| `pnpm check:frontend-boundaries` | pass |
| `pnpm check:e2e` | pass — 32 tests collect, Playwright pinned |
| `pnpm check:figma-design-index` | pass — 72/72 |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 |
| `pnpm db:check:manifest` | pass — 78 tables, 833 columns |
| `node tools/check-file-size.mjs` | pass — 21 files above the review threshold, unchanged from entry |
| `pnpm quality` | **exit 0** |
| `git diff --check` | clean |

No substitutions were needed; all names are the repository's own. The focused suite was run twice with identical results.

**File-size note.** The combined live suite reached 595 lines — inside the 600 hard limit but past the 500 review threshold. It was split by responsibility, not by line count: unpublish became its own suite (382 / 300). No new file sits above the review threshold.

---

## T. Acceptance

| Criterion | Result |
|---|---|
| Clean `APP2-B03-G01` evidence entry | ✅ |
| Accepted A03 / B03-G01 history untouched | ✅ |
| Canonical sequence respected | ✅ |
| Exactly three operations | ✅ |
| Schema and lifecycle representable | ✅ |
| `TR-LC04-05` verified directly | ✅ |
| Canonical unpublish proven | ✅ |
| No migration | ✅ |
| Closed, safe readiness set | ✅ |
| All requirements source-grounded | ✅ |
| Zero price fails | ✅ |
| Category / Asset / derivatives revalidated in-transaction | ✅ |
| No arbitrary media limit | ✅ |
| No object-storage call or leak | ✅ |
| Variants, SKU and invented SEO excluded | ✅ |
| Publish rechecks inside one locked transaction | ✅ |
| Unpublish exact, deletes nothing | ✅ |
| Monotonic `updatedAt` concurrency | ✅ |
| One-winner race proof | ✅ |
| Atomic Product + Audit + Outbox | ✅ |
| Safe guards and errors | ✅ |
| Exactly three OpenAPI additions | ✅ |
| Generated-client additions only | ✅ |
| No frontend / worker / storage / Figma / dependency change | ✅ |
| Unit, live, API, gateway, quality and secret gates pass | ✅ |
| Zero residue | ✅ (dev-database append-only evidence disclosed in §O) |
| Commit A implementation only | ✅ |
| Exactly two commits, nothing pushed | ✅ |
| A04 / B04 / S01 / S02 / E01 / T01 not started | ✅ |

**Verdict: `PASS`.** No criterion is hidden behind a follow-up.

### Carried forward

`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 = ROUTED — NONBLOCKING_FOR_B03`

`APP2-B02` implements archive with `PRODUCT_ARCHIVABLE_STATES = [DRAFT]` while LC-04 defines archive only as `PUBLISHED → ARCHIVED`. Discovered by `APP2-B03-G01` and deliberately untouched here: B03 neither calls nor modifies `adminProduct_archive`, `APP2-A04` owns publish/unpublish only, and archive UI remains deferred. No B03 source touches archive code.

---

## U. Handoff to A04 and B04

**`APP2-A04` — Admin publication interaction.** Three operations are available and documented; the generated functions `adminProductPublicationReadiness`, `adminProductPublish` and `adminProductUnpublish` exist in `packages/api-client/src/generated` and must be re-exported from `packages/api-client/src/index.ts` by A04, which owns the screen. Both commands require `expectedUpdatedAt` and return the advanced token, so a publish followed by an unpublish needs no refetch. `eligible` alone does **not** mean the product may be published — the lifecycle state must also allow it, so the screen should gate on `status === 'DRAFT' && eligible`. The seven requirement codes are stable, ordered and complete, suitable for a checklist rendered without sorting; `PRODUCT_PUBLICATION_NOT_READY` returns the unsatisfied subset in `errors[].code`. The four 409 codes are distinct and must be distinguished in the UI: a version conflict means reload, a not-allowed means the state moved, and not-ready means fix the listed facts. Readiness is a report about a moment, so a publish may still refuse — the confirmation flow must handle that rather than treating a green checklist as a guarantee.

**`APP2-B04` — Public catalog queries.** Public visibility is `status = 'PUBLISHED'` and nothing else; there is no separate visibility flag and `archived_at` is orthogonal. The two derivative kinds guaranteed present and `READY` for every attached image of a published product are `THUMBNAIL` and `CATALOG_PREVIEW`, both unwatermarked with a durable `storage_key`. The `product.published` / `product.unpublished` outbox events are the durable revalidation handoff; delivery is at-least-once and B03 implements no consumer.
