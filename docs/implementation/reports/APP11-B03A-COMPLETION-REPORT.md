# APP11-B03A — Admin Gallery Media Promotion & Public Preparation

**Checkpoint:** `APP11-B03A`
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Date:** 2026-08-30
**Baseline HEAD:** `8c08e27c` (`feat(app11): deliver public gallery reads and media delivery (APP11-B03, APP11-B03-C1)`)

---

## A. Verdict

```text
APP11-B03A = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-B04
```

No push occurred. No migration was added. No worker was added. No frontend,
sitemap, content-page or redirect runtime was touched. `APP11-B04` was **not**
started.

---

## B. Entry blocker

```text
FU-APP11-B03-01 = CLOSED
```

`APP11-B03-C1` recorded that an operator could not create media that `APP11-B02`
would attach and `APP11-B03` would deliver, because the one delivered intake
fixes `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` (INV-09) and nothing wrote
`assets.classification` afterwards.

It is closed by one new operation:

```text
POST /api/admin/gallery-assets   —   adminGalleryAsset_create
```

The proof is a live integration case that runs the whole chain through product
code with **no insert into `assets` on the gallery side**:

```text
prepare → B02 attach → B02 publish → B03 feed → B03 detail → B03 bytes
```

(`admin-gallery-asset-api.integration.spec.ts`, *"runs prepare → attach →
publish → public feed → detail → bytes"*, plus the two sibling cases about
detach/unpublish and unattached reachability.)

Neither half of INV-09 was weakened. Intake still cannot express `PUBLIC` — the
contract suite asserts that against the upload's own documented multipart body —
and no code updates an existing asset's classification. `PUBLIC` is reached only
through the preparation flow, which is exactly the "publication flow" the
invariant names.

---

## C. Preflight findings

Measured on the `8c08e27c` tree before any code was written.

| Question | Finding | Source |
|---|---|---|
| Admin upload | `POST /api/admin/assets/upload`, streaming multipart, `assetKind`/`classification` single-value enums fixed to `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` | `admin-asset.controller.ts`, `asset-intake.policy.ts` |
| Admin asset list / read | `adminAsset_list` + `adminAsset_detail`, both hard-scoped by `(kind, classification)` **in SQL**, a scoped miss reported as `ASSET_NOT_FOUND` | `asset-catalog.query.ts`, `asset-scope.filters.ts` |
| Admin binary preview | **None exists.** No controller serves an Admin asset binary; the only Admin delivery routes are request-scoped (`admin/custom-requests/.../content`) or payment-evidence-scoped | full `@Controller` sweep of `apps/api/src/modules` |
| Asset lifecycle | `register` forces `UPLOADED`; `recordInspection` writes the evidence row **and** the state it justifies in one transaction; `registerDerivative` → `PENDING`, `completeDerivative` → `READY` + key. All four exist on the published `AssetRepository` port | `asset.repository.ts`, `drizzle-asset.repository.ts` |
| Storage copy capability | **Absent.** `ObjectStoragePort` had exactly six methods and no copy; the header states the surface is closed on purpose | `object-storage.port.ts` |
| Catalog Product association | `product_media` rows reference `assets.id`; the public product-media predicate requires `classification = PRODUCTION_SENSITIVE` **and** `status = ACCEPTED`, re-proved on every request | `product-publication.policy.ts`, `public-product-media.service.ts` |
| Schema headroom | `ASSET_KINDS` already carries `GALLERY_MEDIA`; `ASSET_CLASSIFICATIONS` carries `PUBLIC`; **no CHECK constrains the `(kind, classification)` pair** | `packages/database/src/schema/asset/assets.ts` |

The last row is why no migration was needed: the derived asset is representable
by the delivered schema exactly as it stands.

---

## D. Final architecture

```text
COPY_ON_PROMOTE = true
SOURCE_MUTATED_IN_PLACE = false
```

**Derived asset semantics**

```text
id             new UUIDv7 (never the source id)
kind           GALLERY_MEDIA
classification PUBLIC
status         ACCEPTED
deleted_at     null
storage_key    development/originals/{derivedId}/original.{ext}
mime_type      copied from source
size_bytes     copied from source
checksum       copied from source (true of a byte-identical copy)
derivatives    THUMBNAIL + CATALOG_PREVIEW, READY, unwatermarked,
               keys namespaced by the derived id
```

**Why `ACCEPTED` at birth.** Not convenience: the bytes are the bytes an
inspection already accepted, the provider copies them server-side so nothing in
this process can alter them, and the row is created with an `asset_inspections`
record justifying the state **in the same transaction** — the rule
`recordInspection` states. `register` lands in `UPLOADED` and the very next
statement supplies the evidence, so no uninspected gallery asset is ever visible
to another transaction. Sending a byte-identical copy back through the
inspection worker was rejected: the worker matches on `(kind, classification)`
and owns no `GALLERY_MEDIA` lane, so the copy would never leave `UPLOADED`, and
an asynchronous window would let `APP11-B02` attach an image `APP11-B03` cannot
serve.

`ACCEPTED` satisfies both delivery predicates without widening either — it is
outside `APP11-B03`'s `REJECTED`/`DELETION_PENDING`/`DELETED` withdrawn set, and
it is `APP2-T01`'s exact required value.

**Why the copy, not a reclassification.** A catalog asset may already be
attached to a published Product, and Product media is delivered *from* the
`PRODUCTION_SENSITIVE` lane. Flipping the source to `PUBLIC` would move an image
out from under the contract serving it. §G proves the copy leaves that contract
intact.

**Composition.** A fourth Gallery module, `GalleryAdminMediaModule`, registered
inside the existing `GalleryCompositionModule`. It is the only Gallery surface
holding the Asset repository port and a configured object store —
`GalleryAdminModule` was accepted on holding neither, and putting them there
would retract that guarantee for the seven B01/B02 operations. It composes no
AGG-18 write port at all, so preparing an image cannot attach or publish
anything.

---

## E. HTTP contract

**New operations: 2** (cap: ≤3).

| Operation ID | Method + path | Auth |
|---|---|---|
| `adminGalleryAsset_create` | `POST /api/admin/gallery-assets` | `AuthenticatedAdminGuard` + `StaffOriginGuard` + `StaffJsonBodyGuard` |
| `adminGalleryAsset_preview` | `GET /api/admin/gallery-assets/{assetId}/{rendition}` | `AuthenticatedAdminGuard` |

**Create** — request `{ sourceAssetId: uuid, expectedSourceUpdatedAt: date-time }`,
`.strict()`. Response `201` with the envelope carrying
`{ assetId, kind, classification, status, mediaType, byteSize, checksum,
renditions[{rendition,url}], createdAt, updatedAt }`. Refusals: `400` malformed,
`401`, `403` origin, `404` ineligible source (one undifferentiated code), `409`
stale source version, `415` non-JSON, `503` storage.

**Preview** — streams `image/webp` with `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, no filename.
Refusals: `400`, `401`, `404`, `503`.

**Modified existing operations: 2, both additive and default-preserving.**

| Operation ID | Change |
|---|---|
| `adminAsset_list` | optional `scope` query, `CATALOG` \| `GALLERY`; absent ⇒ `CATALOG` |
| `adminAsset_detail` | same optional `scope` |

Their shared response schema widened `kind` and `classification` from
single-value enums to the two lanes, because a `scope=GALLERY` read can now
legitimately return `GALLERY_MEDIA` / `PUBLIC` and a narrower type would be a lie
about a response the client can receive. No required field, status code or
default behaviour changed. `adminAsset_upload` is untouched.

The client chooses only the source identity and its version. `kind`,
`classification`, `status`, storage keys, buckets, derivative kinds and alt text
are all policy-owned and refused by the `.strict()` body.

---

## F. Storage preparation

**Port extension.** `ObjectStoragePort` gained one method,
`copyObject(CopyObjectInput)`, implemented in the S3 adapter with
`CopyObjectCommand` and `MetadataDirective: 'REPLACE'` — the directive is what
makes the destination's `ContentType` and metadata take effect instead of the
source object's silently coming across. `CopySource` is `encodeURI`'d over a
key that has already passed `assertValidObjectKey`. No presign, no public URL,
no vendor administration API, no second storage client. Bytes never enter the
API process, which is what makes it honest to carry the source's checksum onto
the copy and to record the copy as already inspected.

**Objects prepared, per request:**

| Source | Destination | Bucket |
|---|---|---|
| `…/originals/{sourceId}/original.{ext}` | `…/originals/{derivedId}/original.{ext}` | `ORIGINALS` |
| `…/derivatives/{sourceId}/THUMBNAIL.webp` | `…/derivatives/{derivedId}/THUMBNAIL.webp` | `DERIVATIVES` |
| `…/derivatives/{sourceId}/CATALOG_PREVIEW.webp` | `…/derivatives/{derivedId}/CATALOG_PREVIEW.webp` | `DERIVATIVES` |

Every destination key is namespaced by the **derived** asset's own freshly
allocated UUIDv7, so the two assets share no object. `uq_assets__storage_key`
holds, and tombstoning either asset can never delete bytes the other serves.
Only the original and the two public display derivatives are copied; no
customer-private object is reachable from the operation, because the source is
resolved through a read scoped to `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` in
SQL.

**`READY` before the response.** `registerDerivative` → `completeDerivative` runs
inside the same write transaction, after the objects exist. No asynchronous
ambiguity and no new worker.

**Ordering and compensation.**

```text
1. resolve + prove the source (lane, ACCEPTED, not tombstoned, token)
2. prove both renditions READY, unwatermarked, with a key
3. plan every destination key, then copy the three objects
4. TRANSACTION: re-prove 1 and 2 under FOR SHARE, key-for-key; then
   register → recordInspection(ACCEPTED) → registerDerivative ×2 →
   completeDerivative ×2
5. on any failure after step 3: delete every *planned* key
```

Objects before rows, never the reverse: a row written first would, on a storage
failure, leave `APP11-B02` free to attach an image `APP11-B03` cannot serve.
Compensation deletes the whole plan rather than a subset a caller believes was
written — `deleteObject` is idempotent by port contract, so removing a key that
was never created is a success, and a compensation that had to track partial
progress is one that can be wrong about it. `discard` never throws: it runs on
an already-failing path and the caller's original error is the one worth
reporting; a cleanup that could not finish is logged with the derived asset id
alone.

**Proved, not asserted.** The integration suite arranges a source whose original
object exists but whose derivative objects do not, so the **first copy succeeds
and the second fails** — a failure strictly after an object was created. The
case asserts `503`, an unchanged object count under both prefixes, and an
unchanged gallery-asset row count.

```text
SUCCESS: new PUBLIC row + 2 READY derivative rows + 3 objects, all present
FAILURE: no asset row, no derivative row, no leftover object
```

No claim is made that SQL atomicity covers object storage; step 5 is what closes
the other direction.

---

## G. Product non-regression

Proved by a live case, not by inspection alone
(*"keeps a published product delivering from a source that was promoted"*):

1. seed a catalog source with real objects;
2. create and **publish** a product whose media is that asset;
3. prepare a gallery asset from it;
4. assert `product_media` rows are byte-for-byte identical to before, still
   pointing at the source and never at the derived id;
5. `GET /api/public/products/{slug}/media/{mediaId}/thumbnail` still returns
   `200` with the source's exact `THUMBNAIL` bytes.

Separately asserted on the source row after promotion: id unchanged,
`kind = CATALOG_MEDIA`, `classification = PRODUCTION_SENSITIVE`,
`status = ACCEPTED`, `deleted_at` null, `storage_key` unchanged, derivatives
untouched.

Structurally reinforced by the contract suite: the preparation service reaches
no `tombstone`, `beginInspection`, `failDerivative`, `lockForUpdate` or
`FOR UPDATE`, and no write statement names the source id.

---

## H. Admin operability

No parallel asset manager was created. The existing reads gained a lane.

| Need | How |
|---|---|
| identify / select the derived asset | `GET /api/admin/assets?scope=GALLERY` |
| obtain its id for `APP11-B02` | same list, and the create response |
| preview the gallery renditions | `GET /api/admin/gallery-assets/{assetId}/{rendition}` — also returned as ready-made relative `renditions[].url` |
| reopen an entry and render its media | the same preview URL, per attached asset id |

**Scope separation, proved live:**

- the default (no `scope`) list returns **only** `CATALOG_MEDIA` /
  `PRODUCTION_SENSITIVE`, with the prepared asset absent — so no historical
  product-media picker changes;
- `scope=GALLERY` returns the prepared asset and **neither** a catalog asset nor
  a `CUSTOMER_PRIVATE` one, on both list and detail;
- a prepared asset read under the default scope is `404 ASSET_NOT_FOUND`,
  identical to absent;
- an unknown scope is a `400`, never a silent fallback to a lane the caller did
  not ask for.

The preview refuses a catalog asset and an unknown id identically (`404`), a
non-public rendition at the DTO boundary (`400`), and is `401` anonymously. Its
headers carry no storage key — asserted against the whole serialised header
object.

---

## I. APP11 end-to-end backend compatibility

One case, all seven steps, real HTTP throughout:

| Step | Result |
|---|---|
| 1. eligible `ACCEPTED` catalog source (pre-APP11 lane, fixture-arranged) | PASS |
| 2. `POST /api/admin/gallery-assets` | PASS — `201`, new id |
| 3. new id ≠ source id | PASS |
| 4. `PUT /api/admin/gallery-entries/{id}/assets` | PASS |
| 5. `POST /api/admin/gallery-entries/{id}/publication` | PASS |
| 6. `GET /api/public/gallery-entries` + `/{slug}` | PASS — cover id and asset list are the derived id |
| 7. `GET …/assets/{assetId}/{rendition}` | PASS — exact `CATALOG_PREVIEW` and `THUMBNAIL` bytes |

**No direct DB creation of the derived gallery asset** anywhere in the proof.
The fixture seeds only the pre-existing catalog source, which the prompt permits
because that workflow predates APP11; the new
`gallery-asset-preparation-fixture.ts` contains no insert into `assets` for a
gallery-lane row, by construction.

Two sibling cases cover the lifecycle: unpublishing and detaching leave the
asset `ACCEPTED` / `PUBLIC` / non-tombstoned with both derivatives still `READY`
and still selectable and previewable; and an unattached prepared asset is
invisible on the public feed and has no public address of its own.

---

## J. OpenAPI / client delta

```text
before:  113 paths / 125 operations / 247 schemas
after:   115 paths / 127 operations / 250 schemas
delta:   +2 paths / +2 operations / +3 schemas
```

New schemas: `AdminGalleryAssetResponse`,
`AdminGalleryAssetRenditionResponse`, `PrepareGalleryAssetBody`.

```text
openapi.generated.json sha256
  2beb2404a773c85985837986d8c30d9d229688872ae6ec563eb3de829b96a922

api-client tree hash
  944d55aa7a544e578fe6eafb183a91db6f8e1e25554e6dfb8618d919b87ca0b1
  embroidery-api.ts          sha256 375c082f4de258e3…
  embroidery-api.schemas.ts  sha256 af1f068ec8ed9ec4…
  bytes 413420 · lines 9354
```

Both generated canonically (`CMD-OPENAPI-GENERATE`, `CMD-API-CLIENT-GENERATE`);
both drift gates pass. No generated file was hand-edited. Curated client exports
are unchanged — `APP11-A02` owns exposure.

---

## K. Migration / schema

```text
migrations = 37 (unchanged)
schema change = none
EXPECTED_MIGRATION_DELTA = 0  ✔
PER_IMAGE_ALT_DB_FIELD = false ✔
```

No `gallery_asset_source_id`, no `alt_text`, no gallery-media table, no
derivative table, no new status enum value. Live schema inspection confirmed the
existing model represents the derived asset: `GALLERY_MEDIA` is already in
`ASSET_KINDS`, `PUBLIC` in `ASSET_CLASSIFICATIONS`, and no CHECK constrains the
pair.

Source provenance is therefore **not persisted as a column**, and nothing here
pretends otherwise. It is recorded as bounded, non-secret free text in the
derived asset's `asset_inspections.detail` — the row that justifies its
`ACCEPTED` state — which no delivered operation projects into any response. Two
explicit operator promotions consequently create two independent gallery assets;
there is no promotion idempotency, and the create's OpenAPI description says so.

---

## L. File-size compliance

`node tools/check-file-size.mjs` over each owned tree: **0 files above the
review threshold** (source 300 / test 500; hard 400 / 600).

| File | Lines |
|---|---|
| `asset/domain/admin-asset-scope.policy.ts` | 77 |
| `asset/application/asset-catalog.query.ts` | 110 |
| `asset/presentation/admin-asset.controller.ts` | 246 |
| `asset/presentation/schemas/admin-asset.request.ts` | 116 |
| `asset/presentation/schemas/admin-asset.response.ts` | 83 |
| `gallery/domain/gallery-asset-preparation.policy.ts` | 120 |
| `gallery/domain/gallery-asset-preparation.errors.ts` | 105 |
| `gallery/domain/admin-gallery-asset-path.ts` | 36 |
| `gallery/application/admin-gallery-asset-preparation.service.ts` | 269 |
| `gallery/application/admin-gallery-asset-preview.service.ts` | 146 |
| `gallery/application/admin-gallery-asset.projection.ts` | 70 |
| `gallery/application/gallery-asset-object-copier.ts` | 177 |
| `gallery/presentation/admin-gallery-asset.controller.ts` | 275 |
| `gallery/presentation/schemas/admin-gallery-asset.request.ts` | 59 |
| `gallery/presentation/schemas/admin-gallery-asset.response.ts` | 85 |
| `gallery/gallery-admin-media.module.ts` | 48 |
| `gallery/gallery-composition.module.ts` | 76 |
| `gallery/presentation/admin-gallery-asset.contract.spec.ts` (test) | 262 |
| `test/integration/admin-gallery-asset-api.integration.spec.ts` (test) | 544 |
| `test/support/gallery-asset-preparation-fixture.ts` (test) | 213 |
| `object-storage/src/object-storage.port.ts` | 72 |
| `object-storage/src/object-storage.types.ts` | 116 |
| `object-storage/src/s3-object-storage.adapter.ts` | 302 |

```text
apps/api/src/bootstrap/app.module.ts = 339 (unchanged) ✔
```

The integration spec at 544 is above the 500 review threshold and below the 600
hard limit. It is one suite because the checkpoint's whole claim is a single
chain of state — a prepared asset, the source it came from, a product that still
delivers, and a published gallery entry — and splitting it would mean two
copies of a MinIO + PostgreSQL bootstrap and two independent arrangements of the
same fixture. Flagged for review rather than hidden.

---

## M. Validation

```text
CHANGE_IMPACT
  packages/object-storage      ObjectStoragePort +copyObject, S3 adapter, types, index
  apps/api  asset module       scope policy (new), scoped query, both read DTOs/docs, response enums
  apps/api  gallery module     preparation + preview + copier + projection + path + policy + errors
                               + controller + 2 schemas + new module + composition registration
  apps/worker (test only)      InMemoryObjectStorage implements copyObject
  apps/api  (test only)        3 ObjectStoragePort fakes gain copyObject
  contracts / api-client       regenerated

TESTS_RUN
  pnpm --filter @embroidery/api typecheck                                  PASS
  pnpm --filter @embroidery/object-storage typecheck                       PASS
  pnpm --filter @embroidery/worker typecheck                               PASS
  pnpm --filter @embroidery/api openapi:generate                           115 / 127 / 250
  pnpm --filter @embroidery/api openapi:check                              PASS (no drift)
  pnpm --filter @embroidery/api-client generate                            tree 944d55aa…
  pnpm --filter @embroidery/api-client check:generated                     PASS (no drift)
  CMD-TEST-APP11-B03A-CONTRACT                                             28/28 PASS
  CMD-TEST-APP11-B03A-API                                                  35/35 PASS
  jest --testPathPatterns="asset-intake|asset-persistence|admin-asset"     92/92 PASS
  jest --testPathPatterns="public-media-delivery|public-gallery|admin-gallery-entry"
                                                                           178/178 PASS  (6 suites)
  eslint apps/api/src/modules/{gallery,asset} + both new test files        clean
  eslint packages/object-storage                                           clean
  eslint apps/worker in-memory-object-storage.ts                           clean
  prettier --check (every changed file)                                    clean
  node tools/check-file-size.mjs × 4 scoped trees                          PASS
  git status / git diff                                                    §N

TESTS_NOT_RUN
  FULL_MONOREPO_TEST = NOT_RUN
  FULL_E2E           = NOT_RUN
  APP11_E01          = NOT_RUN
  full API suite, Admin frontend suite, Storefront suite, worker suite,
  full DB regression, Playwright, unrelated historical phase suites

WHY_NOT_RUN
  Change-impact policy (phase §9, VALIDATION_GOVERNANCE §3). B03A adds a backend
  operation family and one narrow storage-port method. It changes no frontend
  file, no worker runtime file, no schema and no shared seam those suites depend
  on. The seams it *does* touch — the Asset read scope, the public Product media
  contract, and both APP11 gallery lanes — were each rerun in full above.
```

**Two pre-existing failures observed, neither caused by this checkpoint.**
Verified by stashing the working tree and re-running both at `8c08e27c`, where
they fail identically (2 failed in each suite):

- `packages/object-storage` `test/unit/object-key.spec.ts` — 2 cases expect
  `image/svg+xml` to be an unsupported content type; the builder gained it in
  `APP3-W01B` (IMP-D047) and the test was not updated. `object-key.ts` is **not**
  modified by B03A.
- `apps/api` `src/platform/openapi/zod-dto-publication.contract.spec.ts` — 2
  cases assert "19 paths and 23 operations", a stale APP0-era count against a
  document that has held 100+ paths for several phases.

Both are recorded as follow-ups below rather than fixed here: neither is in
B03A's scope and repairing a historical assertion inside this checkpoint would be
unrelated work.

---

## N. Files changed

Git-authoritative.

**Modified (18)**

```text
apps/api/src/modules/asset/application/asset-catalog.query.ts
apps/api/src/modules/asset/presentation/admin-asset.controller.ts
apps/api/src/modules/asset/presentation/schemas/admin-asset.request.ts
apps/api/src/modules/asset/presentation/schemas/admin-asset.response.ts
apps/api/src/modules/gallery/gallery-composition.module.ts
apps/api/src/modules/order/tests/integration/admin-request-asset-context.ts
apps/api/src/modules/order/tests/integration/request-intake-context.ts
apps/api/test/support/payment-evidence-delivery-fixture.ts
apps/worker/src/jobs/asset-inspection/tests/in-memory-object-storage.ts
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
packages/api-client/src/generated/embroidery-api.schemas.ts
packages/api-client/src/generated/embroidery-api.ts
packages/contracts/openapi/openapi.generated.json
packages/object-storage/src/index.ts
packages/object-storage/src/object-storage.port.ts
packages/object-storage/src/object-storage.types.ts
packages/object-storage/src/s3-object-storage.adapter.ts
```

The four `*-context.ts` / `*-fixture.ts` / `in-memory-object-storage.ts` edits
are test-only: each class `implements ObjectStoragePort` and had to gain
`copyObject` for the port extension to typecheck. Three refuse it (the suites
never copy); the worker's in-memory store implements it faithfully, including
the `ContentType` replacement the adapter's `MetadataDirective` performs.

**Added (16)**

```text
apps/api/src/modules/asset/domain/admin-asset-scope.policy.ts
apps/api/src/modules/gallery/domain/gallery-asset-preparation.policy.ts
apps/api/src/modules/gallery/domain/gallery-asset-preparation.errors.ts
apps/api/src/modules/gallery/domain/admin-gallery-asset-path.ts
apps/api/src/modules/gallery/application/admin-gallery-asset-preparation.service.ts
apps/api/src/modules/gallery/application/admin-gallery-asset-preview.service.ts
apps/api/src/modules/gallery/application/admin-gallery-asset.projection.ts
apps/api/src/modules/gallery/application/gallery-asset-object-copier.ts
apps/api/src/modules/gallery/presentation/admin-gallery-asset.controller.ts
apps/api/src/modules/gallery/presentation/schemas/admin-gallery-asset.request.ts
apps/api/src/modules/gallery/presentation/schemas/admin-gallery-asset.response.ts
apps/api/src/modules/gallery/presentation/admin-gallery-asset.contract.spec.ts
apps/api/src/modules/gallery/gallery-admin-media.module.ts
apps/api/test/integration/admin-gallery-asset-api.integration.spec.ts
apps/api/test/support/gallery-asset-preparation-fixture.ts
docs/implementation/reports/APP11-B03A-COMPLETION-REPORT.md
```

---

## O. Follow-ups

All non-blocking. None gates `APP11-B04`.

| ID | Item | Why non-blocking |
|---|---|---|
| `FU-APP11-B03A-01` | No operator deletion/tombstone for an unused gallery-public asset. The existing `AssetRepository.tombstone` is reachable from no HTTP operation at all, in any lane, so B03A had nothing to extend; adding a deletion route would be a new capability beyond the checkpoint. | An unattached gallery asset has **no public address**: `APP11-B03` requires an actual `PUBLISHED` association before any binary is served, proved by the "unattached prepared asset unreachable" case. Unused assets are therefore safe and merely occupy storage. |
| `FU-APP11-B03A-02` | No promotion idempotency. Two operator clicks create two independent gallery assets. | Deliberate and documented in the contract; deduplicating would require a provenance column, i.e. a migration the PO has not authorised. |
| `FU-APP11-B03A-03` | The derived derivative rows carry no `checksum` and none of the `APP3-DB01` metadata quartet. | `asset_derivatives.checksum` is not on the published Asset port, so the source's value is not in hand, and computing one would mean streaming the copied object back through the API. Null is honest; the quartet's all-or-none CHECK is satisfied at 0, and no delivered predicate reads either. |
| `FU-APP11-B03A-04` | Pre-existing: `packages/object-storage` `object-key.spec.ts` — 2 stale cases expect `image/svg+xml` unsupported (added by `APP3-W01B`). | Fails identically at `8c08e27c`; unrelated to B03A. |
| `FU-APP11-B03A-05` | Pre-existing: `zod-dto-publication.contract.spec.ts` — 2 cases pin "19 paths / 23 operations" against a 115-path document. | Fails identically at `8c08e27c`; unrelated to B03A. It is a stale count, not a contract defect — `openapi:check` and the per-checkpoint contract suites are the live gates. |

---

## P. Roadmap

```text
APP11-G01      COMPLETE
APP11-G01-C1   COMPLETE
APP11-D01      COMPLETE
APP11-D01-C1   COMPLETE
APP11-B01      COMPLETE
APP11-B01-C1   COMPLETE
APP11-B02      COMPLETE
APP11-B03      COMPLETE
APP11-B03-C1   COMPLETE
APP11-B03A     COMPLETE
APP11-B04      NEXT
APP11-A01 …    NOT STARTED
```

Exactly one `NEXT`. `APP11-B04` was not started.
