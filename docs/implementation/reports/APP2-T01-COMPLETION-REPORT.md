# APP2-T01 — Public Catalog Media Delivery Foundation — Completion Report

**Checkpoint.** `APP2-T01` — implement the application-owned, publication-gated public
catalog media delivery foundation required by `APP2-B04`.

**Verdict — `PASS`.**

**Final state**

```text
APP2-T01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-B04 = READY — NOT STARTED
APP2-S01 / APP2-S02 = BLOCKED_BY_APP2-B04
APP2-E01 = BLOCKED_BY_APP2-S01_AND_APP2-S02
FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01 = DEFERRED — NONBLOCKING_FOR_APP2-B04
```

---

## A. Preflight and the B04 blocker

`APP2_T01_PREFLIGHT = PASS`. No partial preflight; every gate ran.

| Check | Result |
| --- | --- |
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` | `6527d27609a77adb5e17f93a2ceeed5da52ecb99` — the exact A04-C1 evidence Commit D |
| `git status --short` | empty (clean tracked/staged tree) |
| `git diff --check` | exit 0 |
| `pnpm check:secrets` | exit 0 — 351 documents, 1647 tracked files |
| `pnpm check:lifecycle` | exit 0 — LC-04: 5 transitions, exactly one `PUBLISHED → DRAFT` |
| `node --test tools/check-lifecycle-consistency.test.mjs` | 10/10 |
| `pnpm quality` | exit 0 |
| `pnpm check:openapi` | exit 0 |
| `pnpm check:api-client` | exit 0 |
| `pnpm check:figma-design-index` | exit 0 |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 |
| `pnpm db:check:manifest` | exit 0 |

Accepted A04 chain verified by `git show --stat`, all unchanged:

```text
e522e9d5d392637814b4dfbc0a0dfdaea1b5a12e  feat(admin): implement product publication interaction   (28 files)
ebd909a063f2a20f6192977b2d94b95de4f1e9bf  docs(app2): record Admin Product Publication evidence     (3 files)
f25abe0bbc50cac5410970bb7fb3f9b769b4f9c5  test(admin): add isolated production publication smoke    (6 files)
6527d27609a77adb5e17f93a2ceeed5da52ecb99  docs(app2): record A04 production correction evidence     (HEAD)
```

The preceding `APP2-B04` entry gate made **no repository change and created no commit**;
`b7df24f` (documentation-only security governance) is legitimate history and was not touched.

### The blocker this checkpoint cures

`APP2-B04 = BLOCKED_BY_PUBLIC_MEDIA_DELIVERY_CONTRACT_GAP`, reproduced from source:

- `DB0_QUERY_CATALOG.md:24` — `Q-01` public listing returns "product cards (name, price,
  **image**, availability)"; line 25 — `Q-02` returns "product + … + **media** + SEO".
- The built OpenAPI carried **16 operations across 13 paths — none public, none binary**.
- `apps/api` **never called `getObjectStream`**. The only callers were the worker's inspection
  jobs and the object-storage contract tests; there was no request→bytes path in the API at all.
- The gateway declared `/api/`, `/healthz`, `= /api/admin/assets/upload` and `/` — no media
  location.
- `apps/admin` rendered `product-media-placeholder.tsx`, deliberately "never an `<img>`".
- The repository already stated the conclusion, in `admin-product.response.ts`: *"Deliberately
  absent: … any media URL — APP2 has no authenticated media-delivery contract, so an address
  here would be fabricated (`FU-APP2-THUMBNAIL-01`)."*

`ADR-APP2-001` §4.7 fully *designs* proxied, publication-gated delivery — cache headers, the
`CATALOG_PREVIEW`/`THUMBNAIL` mapping, a CDN portability seam. **A design paragraph is not a
route**, and the same ADR's B01 scope line says "no public derivative delivery". This is exactly
the case §5.1 excludes: "a route named in a document but absent from runtime does not qualify."

---

## B. Product Owner activation decision

Accepted as given: `PUBLIC_MEDIA_DELIVERY_GATE = BLOCKED`, `PUBLIC_CATALOG_SCHEMA_GATE = PASS`,
`APP2_B04_PREFLIGHT = PASS`. The B04 block was correct and B04 needed no correction because it
never started.

The chosen option — activate `APP2-T01` before `B04` — is implemented exactly: **one** anonymous
publication-gated streaming route, and `B04` remains exactly two JSON operations consuming a safe
route helper. Rejected alternatives (a third B04 operation, shipping without media, fabricated or
presigned or MinIO URLs, Storefront placeholders) are all absent from the delivery.

Recorded as **IMP-D036** in `14-IMPLEMENTATION-DECISION-REGISTER.md`. No prior decision was
renumbered.

## C. Reconciliation of the older T01 wording

Earlier documents routed T01 as "authenticated Admin thumbnail delivery and placeholder
replacement" — the first *visible consumer* of the missing transport, not the capability. The
canonical scope is now the **application-owned catalog derivative delivery foundation**, and this
activation implements only the blocking public lane: anonymous, `PUBLISHED`-only,
`THUMBNAIL` + `CATALOG_PREVIEW`.

It does **not** replace the A01/A02/A03/A04 Admin placeholders, and could not: the delivered
route serves published products to anonymous callers, so it cannot render a DRAFT product's
images in Admin. That needs its own authenticated contract and its own checkpoint —
`FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01 = DEFERRED — NONBLOCKING_FOR_APP2-B04`.

Superseding notes (not rewrites) were added to the phase plan, the master roadmap and the
traceability matrix. Historical completion reports were not edited.

---

## D. Schema and identity representability

`SCHEMA_IDENTITY_GATE = PASS` against the existing **33 migrations**. Verdict:
**`NO_APP2_T01_MIGRATION`** — no migration was created.

| Required fact | Where it lives |
| --- | --- |
| Product by immutable slug | `products.slug`, `unique uq_products__slug` (CST-011/IDX-011) |
| Product PUBLISHED state | `products.status`, `ck_products__status_allowed` (LC-04) |
| Category public state | `categories.status`, `categories.archived_at` |
| Association by product + id | `product_media.id` (PK, `uuid`), `product_media.product_id` (FK) |
| Role and order | `product_media.role` (closed set), `product_media.display_order` |
| The attached Asset | `product_media.asset_id` → `assets.kind/classification/status/deleted_at` |
| The requested derivative | `asset_derivatives.kind/status/is_watermarked` |
| Private storage key | `asset_derivatives.storage_key`, `ck_asset_derivatives__ready_has_storage_key` |

### Opaque route identity

`product_media.id` is used **only** as the `productMediaId` path segment. It is not a storage
key, grants nothing on its own, is not returned as a standalone public DTO field by this
checkpoint, and is not logged as a credential. Every request re-proves Product, Category,
attachment, Asset lane and derivative truth regardless of it.

**Recorded honestly:** the id is *not* a permanent address. `APP2-B02`'s update deletes and
re-inserts a product's `product_media` rows wholesale
(`drizzle-product-draft.repository.ts:217`), so editing a product's media selection mints new
association ids and any previously issued URL stops resolving — safely, as the standard 404. That
is compatible with the contract because `B04` projects media references per read and the route is
`no-store`; it is stated here so no consumer treats the address as durable.

### Stream metadata

Content type is **not** stored per derivative — `asset_derivatives` has no media-type column, and
the parent `assets.mime_type` describes the *original* (PNG/JPEG/WebP), which is not what this
route serves. It is safely derived instead: `APP2-W01` encodes both catalog derivatives through
one frozen policy (`THUMBNAIL_OUTPUT_POLICY` / `CATALOG_PREVIEW_OUTPUT_POLICY`, both
`mediaType: 'image/webp'`), so the persisted `kind` determines the type. The API may not import
the worker, so `public-product-media.policy.spec.ts` reads the worker's declaration and asserts
the two agree — a drift would otherwise ship a wrong `Content-Type` on every catalog image.

Byte size is likewise not persisted. `Content-Length` comes from the provider's length for the
exact object being streamed (`ObjectStreamResult.sizeBytes`), which is authoritative *for the
transport*, and is omitted when it is zero, negative or non-finite — a wrong `Content-Length`
truncates or hangs a response, while omitting it merely falls back to chunked transfer.

Neither `BLOCKED_BY_PUBLIC_MEDIA_REFERENCE_IDENTITY_GAP` nor
`BLOCKED_BY_PUBLIC_MEDIA_STREAM_METADATA_GAP` applies.

---

## E. The exact route and operation

```text
GET /api/public/products/:slug/media/:productMediaId/:rendition
    → publicProductMedia_get
```

Verified on the **generated** document, not asserted from intent:

```text
GET /api/public/products/{slug}/media/{productMediaId}/{rendition} => publicProductMedia_get
```

The operation id is derived by the canonical factory (`<controllerKey minus Controller,
lower-initial>_<methodKey>`), so `PublicProductMediaController#get` → `publicProductMedia_get`.
`public-product-media.contract.spec.ts` asserts it rather than trusting the convention.

Renditions: exactly `thumbnail` and `catalog-preview`. No query parameters, no body, no
authentication. **No second media operation** was added. No Admin media route, asset-by-id route,
derivative-by-id route, storage-key route, original-download route, presign route or range-list
endpoint exists.

## F. Visibility predicate

One bounded query in `drizzle-public-product-media.repository.ts` requires, in a single
snapshot:

```text
products.slug = :slug
products.status = 'PUBLISHED'
categories.status = 'PUBLISHED' and categories.archived_at is null
product_media.id = :productMediaId  and product_media.product_id = products.id
product_media.role = 'THUMBNAIL'                       (thumbnail rendition only)
assets.kind = 'CATALOG_MEDIA'
assets.classification = 'PRODUCTION_SENSITIVE'
assets.status = 'ACCEPTED'  and assets.deleted_at is null
asset_derivatives.kind = <mapped kind>
asset_derivatives.status = 'READY'
asset_derivatives.is_watermarked = false
asset_derivatives.storage_key is not null
```

Every constant is **re-exported from `product-publication.policy.ts`**, not re-declared. That is
deliberate: publication decides a product *may* be public, and this route re-proves the identical
facts per request, so the delivery path cannot drift from the publication that authorised it.

Splitting this into sequential lookups would open windows in which a concurrent unpublish could
commit between checks, so it is one statement — which also means no N+1.

Unpublish (`TR-LC04-05`, `PUBLISHED → DRAFT`) stops delivery on the next request; knowledge of a
previously valid URL bypasses nothing. No visibility truth is cached in process. Archive
authority, `TR-LC04-02`, `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` and
`FU-APP2-PRODUCT-ARCHIVE-UI-01` are untouched.

## G. Rendition and role mapping

| Rendition | Derivative kind | Required association role |
| --- | --- | --- |
| `thumbnail` | `THUMBNAIL` | `THUMBNAIL` (the single card image, IMP-D032) |
| `catalog-preview` | `CATALOG_PREVIEW` | none — any ordered association |

`PREVIEW_WATERMARKED`, `MOCKUP`, `NORMALIZED` and private originals are unreachable by
construction; a test walks the full closed `ASSET_DERIVATIVE_KINDS` set and asserts nothing
outside the two catalog kinds is reachable, so a kind added later cannot become public silently.
There is **no fallback**: a missing requested rendition is a 404 even when the other rendition of
the same image is perfectly deliverable (proved in `public-media-visibility.integration.spec.ts`).

## H. Streaming implementation

`PublicProductMediaService.open` resolves the descriptor from PostgreSQL, then opens the object
through `getObjectStream`. **No object-storage call happens before the visibility query
succeeds** — asserted directly, so an anonymous prober never reaches the provider and cannot use
provider timing or load as an oracle.

No buffering, no `Buffer` accumulation, no `readFile`, no base64, no redirect, no presigned URL.
The provider's stream is handed to `StreamableFile` unread — the platform response interceptor
already passes `StreamableFile` through untouched, so the binary is never wrapped. No transaction
spans the byte stream: a read needs none, and holding one would pin a connection for the duration
of a client's download.

Client disconnect is bound to an `AbortController` whose signal is passed to the provider and
which destroys the open body on abort. The `writableEnded` guard is what makes it correct rather
than noisy — `close` fires on every request including successful ones, and aborting after a
finished response would report healthy traffic as cancelled.

## I. Headers and cache policy

```text
Content-Type: image/webp
X-Content-Type-Options: nosniff
Content-Disposition: inline          (no filename parameter)
Cache-Control: no-store
Content-Length: <provider length, when usable>
```

No filename: the original upload name is user-supplied text that `APP2-B01` deliberately never
persists, and a fabricated one would describe the object falsely. No ETag, no `Last-Modified`, no
`x-amz-*`, no bucket, no key, no checksum.

**`no-store` rationale.** Unpublish must revoke access on the next request. Any shared or browser
cache able to answer after that transition would keep serving a withdrawn product, and APP2 has
**no dispatcher** for the `product.published` / `product.unpublished` outbox backlog that would
drive a purge. No event-driven revalidation is claimed, no outbox row was marked dispatched, no
worker consumer was added. Immutable public caching and CDN revalidation remain a later
deployment decision (`ADR-APP2-001` §4.7 portability seam). `tools/nginx-public-media-seam.test.mjs`
additionally asserts no gateway cache zone exists and that any `proxy_cache` directive is `off`.

## J. Route helper and the B04 handoff

`packages/contracts/src/public-media/public-product-media-path.ts`:

```ts
buildPublicProductMediaPath({ slug, productMediaId, rendition }): string
// → /api/public/products/{encodedSlug}/media/{encodedProductMediaId}/{rendition}
```

Relative application path only — no host, protocol, object-store base, signature or expiry.
Inputs are strictly validated (slug charset matching the server's own derivation, canonical UUID,
closed rendition union) and throw rather than returning a best-effort string, because a malformed
address would surface as a broken image in a page rather than at the call site.

**Placement, and a deliberate constraint.** The helper lives in `@embroidery/contracts`, the
narrowest existing shared transport-contract package, so `B04`/`S01`/`S02` share one address.
The compiled API **cannot** load that package: it resolves to TypeScript source with no build
output, and under IMP-D018 `node dist/main.js` would fail at load — `contracts-package-boundary.spec.ts`
exists precisely to catch a runtime import. This was hit during implementation and corrected: the
API declares its own `PUBLIC_PRODUCT_MEDIA_RENDITIONS` in its delivery policy, and
`public-product-media.contract.spec.ts` asserts the API's registered route composes to *exactly*
`buildPublicProductMediaPath(...)` for both renditions, and that the two rendition lists are
identical. The copies are held together by a test rather than an import — and the architectural
boundary was respected rather than reopened.

No B04 DTO was implemented.

## K. Architecture and persistence

```text
presentation/public-product-media.controller.ts        HTTP + stream response only
presentation/schemas/public-product-media.request.ts   strict Zod path validation
application/public-product-media.service.ts            visibility → open object, safe errors
domain/public-product-media.policy.ts                  rendition/role/kind mapping, headers
domain/public-product-media.errors.ts                  three-code safe taxonomy
domain/repositories/public-product-media.repository.ts port + descriptor
infrastructure/persistence/drizzle-public-product-media.repository.ts   one SQL statement
catalog-public-media.module.ts                         its own module
asset/infrastructure/storage/object-storage.module.ts  shared port binding
```

No controller SQL, no generic media CRUD, no duplicate Asset/Product repository. The delivery
route lives in its own module rather than in `CatalogDraftModule`/`CatalogPublicationModule`,
which carry authentication, the Origin allowlist and audit wiring — a public route has no
business sharing that graph.

**One narrow refactor, disclosed.** `objectStorageProviders` was spread directly into
`AssetIntakeModule`. A second consumer would have constructed a **second** S3 client from the same
configuration and logged the startup summary twice, so the providers were wrapped in a new
`ObjectStorageModule` that both modules import. This adds no adapter behaviour and changes no
configuration; it removes duplication rather than adding it. Bucket bootstrap stays with the asset
feature (`APP2-I03`) — a read path must not be able to create anything.

The internal descriptor carries the private `storage_key`. It never crosses the API response
boundary, is never logged and never appears in an error — asserted by test.

## L. Safe errors and security

| Code | Status | Used for |
| --- | --- | --- |
| `PUBLIC_PRODUCT_MEDIA_NOT_FOUND` | 404 | every visibility and eligibility miss |
| `PUBLIC_PRODUCT_MEDIA_INVALID` | 400 | malformed slug, media id or rendition |
| `PUBLIC_PRODUCT_MEDIA_UNAVAILABLE` | 503 | provider failure after a valid descriptor |

Every miss — unknown product, DRAFT, ARCHIVED, withdrawn category, unknown/foreign/detached
association, wrong asset lane, missing/pending/processing/failed/watermarked derivative, wrong
role for the rendition — returns the **identical** 404. A caller cannot distinguish an
unpublished product from a nonexistent one.

**Recorded platform behaviour:** the canonical exception mapper replaces every 5xx code and
message with `INTERNAL_SERVER_ERROR` and generic text (documented in `asset-intake.errors.ts`,
`APP2-B01` §20). So the 503 keeps its actionable **status** on the wire while the operator-facing
code is redacted — the live test asserts exactly that rather than the name, because that is what
is true.

No guard is applied. `AuthenticatedAdminGuard`, `StaffOriginGuard` and `StaffJsonBodyGuard` are
opt-in per controller in this codebase, so "public" is the absence of a decorator — and an
absence is only safe if something asserts it. Three tests do: no controller guard metadata, no
handler guard metadata, and no `@UseGuards(`/`@ApiCookieAuth(`/identity import in the source
(matched as *usage*, so the controller's own doc comment explaining which guards do not belong
cannot satisfy the check). Global request id, safe envelope, exception redaction and structured
logging are unchanged; nothing global was weakened.

No path or query parameter becomes an object-storage key — the key is read from
`asset_derivatives.storage_key`, never composed, so percent-encoded traversal in either identity
segment reaches nothing (tested).

`pnpm check:secrets` passes. Leak scans across headers, success payloads and error bodies reject
storage key, bucket, MinIO host/port, provider endpoint, ETag and checksum.

---

## M. Unit tests — 47, run twice

`pnpm --filter @embroidery/api exec jest --testPathPatterns="public-product-media"` →
**3 suites, 47 tests, 47 passed**, twice.

- `public-product-media.policy.spec.ts` (11) — closed rendition set, exact kind mapping,
  unreachability of every other derivative kind including `PREVIEW_WATERMARKED`, role rules,
  total maps, bucket/cache/disposition/nosniff constants, and the worker content-type agreement.
- `public-product-media.service.spec.ts` (18) — rendition translation, **no storage call on a
  visibility miss**, exactly one call to the derivatives bucket at the stored key, policy content
  type beating the provider echo, no key/bucket/checksum/ETag on the returned shape, length
  handling for usable/zero/negative/NaN, provider failure and vanished object both → unavailable,
  no provider message or endpoint in the safe error and no `cause`, abort propagated, stream
  handed on unread, caller signal reaching the provider.
- `public-product-media.contract.spec.ts` (18) — exact registered route, route↔helper agreement
  for both renditions, rendition lists identical to the shared contract, operation id, single
  handler, three anonymity assertions, and strict path parsing including a derivative kind or an
  uppercase value as a rendition, a storage-key-shaped media id, and an unknown extra parameter.

Plus `packages/contracts` **24 tests (12 new)** for the helper, and
`tools/smoke-app2-t01-public-media.test.mjs` **7** Docker-free orchestration tests covering the
WebP signature discriminator (rejecting JSON, PNG and a non-WebP RIFF container) and the restore
plan, including that an `ARCHIVED` product is restored to `ARCHIVED` and that nothing is restored
when the smoke failed before it published.

`tools/nginx-public-media-seam.test.mjs` **5** — no media-specific gateway location, a generic
`/api/` location in every template, no object-store reference, no cache zone and no enabled
`proxy_cache`, and the upload seam still scoped to exactly one location.

The API's pinned OpenAPI shape assertion in `build-openapi-document.spec.ts` was updated
13 → 14 paths and 16 → 17 operations. The quality gate caught it; it is a real counter of the
delivered contract, not a loosened assertion.

## N. Live PostgreSQL + MinIO integration — 36 cases

`pnpm test:public-media:integration` → **2 suites, 36 tests, 36 passed**, clean exit with no open
handles. Disposable PostgreSQL with all 33 migrations, disposable private MinIO (pinned
`minio/minio:RELEASE.2025-04-08T15-41-24Z`), driven **through HTTP** so the transport facts are
actually observed. The `§17` object-storage cases and the `§21` API-integration cases are proved
by this one HTTP-driven pass rather than by two harnesses asserting the same thing; the harness
composes the existing `api-integration-context` and `disposable-minio` rather than adding a third.

`public-media-delivery.integration.spec.ts` — exact `THUMBNAIL` bytes; exact `CATALOG_PREVIEW`
bytes and proof the rendition selected the derivative rather than the asset; `image/webp` +
`nosniff` + `inline` (no filename) + `no-store` + exact `Content-Length`; no
etag/x-amz/minio/bucket/storage/checksum/last-modified header and no storage key; raw bytes not
the JSON envelope; canonical request-id correlation; anonymous with no cookie and no
`WWW-Authenticate`; unpublish → 404 → republish → 200; a vanished object → 503 with no leak;
MinIO refusing anonymous direct object access; **client disconnect destroying the upstream object
stream**; and audit/outbox/products/assets/derivatives/media counts identical across three reads.

`public-media-visibility.integration.spec.ts` — DRAFT, ARCHIVED, unknown slug, withdrawn
category (restored in `finally`), unknown association, an association belonging to another
product (shown deliverable on its own product first), a detached association, the card rendition
from a gallery association, four asset-lane degradations (rejected, wrong kind, reclassified
`PUBLIC`, tombstoned), four derivative degradations (pending, processing, failed, watermarked), a
never-generated derivative, no cross-rendition fallback, and safe 400s for unknown/uppercase/
derivative-kind renditions, malformed uuid, malformed slug and encoded traversal.

Several published-then-degraded states are reached by SQL because a product **cannot** be
published with a pending or watermarked derivative — that is the only way those states exist on a
published product, and it is precisely the scenario the per-request re-check defends against.

The shared non-disclosure assertion compares the error code by **equality** and sweeps only the
free text and metadata: a substring scan over the whole body would match
`PUBLIC_PRODUCT_MEDIA_NOT_FOUND` itself, i.e. the very constant that proves non-disclosure.

The persistent development database was never used as the integration fixture; the harness
refuses to run against it by name.

## O. Gateway smoke — 14/14

`pnpm smoke:app2-t01-public-media` → **14/14 passed**, run twice.

```text
[PASS] gateway healthy
[PASS] unknown rendition rejected at the gateway :: {"status":400}
[PASS] unknown product is a safe 404 :: {"code":"PUBLIC_PRODUCT_MEDIA_NOT_FOUND"}
[PASS] draft product is not served :: {"entryStatus":"DRAFT"}
[PASS] published thumbnail streams real WebP bytes :: {"status":200,"bytes":16400,"webp":true}
[PASS] response headers are the locked delivery policy :: image/webp | nosniff | inline | no-store
[PASS] no storage or provider header reaches the client :: {"leaked":[]}
[PASS] catalog-preview is a different, larger derivative :: {"thumbnail":16400,"preview":28378}
[PASS] the same address works on the admin host
[PASS] unpublish stops delivery on the next request
[PASS] republish restores delivery
[PASS] minio is not exposed through the gateway :: {"status":308}
[PASS] the read route wrote no audit or outbox row :: before/after {"audit":"112","outbox":"35"}
[PASS] development product restored to its entry status :: {"status":"DRAFT"}
```

The **400 on an unknown rendition** is the load-bearing proof that the route is registered: a
nonexistent path would 404, so a *validation* rejection can only come from the handler's pipe.

`PUBLIC_MEDIA_GATEWAY_POLICY_GAP` does **not** apply — the generic `/api/` proxy carries the
binary route unchanged, so **no tracked Nginx or Compose change was made**. This was verified
against the running gateway, not inferred.

**Disclosed:** the smoke publishes by writing `products.status` directly on the development
database, because arranging a PUBLISHED product needs an Admin session and this is a *read* test.
No operator credential was requested or used, no credential was rotated, and nothing was written
to `.env`. That path writes no audit and no outbox row, which is why the before/after counts are
expected to be **identical** — and they are (audit 112, outbox 35 unchanged), which is itself the
evidence that the read route writes nothing. The original status is captured before the change and
restored in `finally` on success and failure alike; the product ended at `DRAFT`, its entry state.

## P. Client-abort proof

`public-media-delivery.integration.spec.ts` binds the application server to a real port (supertest's
in-process agent cannot express a mid-response disconnect), wraps the storage port to capture the
`Readable` the provider returned, issues a real request, destroys the response and socket once
headers arrive, and asserts every captured stream reports `destroyed === true`. The test runs last
and returns the listener, and its deadline timer is cleared on both outcomes — a dangling timer
kept the Jest worker alive past the assertion in an earlier iteration.

## Q. Outbox and audit boundaries

The route writes no audit event, outbox event, product, asset or derivative row. It reads no
outbox event, claims none, dispatches none, and changes no event status. The development backlog
is unchanged: **outbox 35, audit 112 at entry and exit** of the gateway smoke; the integration
suite asserts equality across all six tables on a disposable database. No cache invalidation from
outbox is claimed.

---

## R. OpenAPI and generated client

| Artifact | Before | After |
| --- | --- | --- |
| OpenAPI SHA-256 | `c100df4e2a0b0721e5354f4f78d92312dcaeea5edd617775d8d8cd7062b34323` | `3d905a5736c44c6c7ee1ca482789b3bd7c53c5f198f68b1252244519a788c9e5` |
| Paths | 13 | **14** |
| Operations | 16 | **17** |
| Schemas | 27 | **27** (unchanged) |
| Client tree SHA-256 | `7f2a67a325904e0584688dc2c0f54ac55ac1de5b06817a7faf1ccd3eec51da7f` | `be372048edd8d5b2e5257856cfe3aee2d9e7fc09297f643935038bbb0c0a8899` |

Exactly one operation added: `publicProductMedia_get`. Generated through the canonical scripts
(`pnpm openapi:generate`, `pnpm api-client:generate`); no generated file was hand-edited.
Generated client delta: `packages/api-client/src/generated/embroidery-api.ts`, **23 insertions,
0 deletions** — `publicProductMediaGet` and its result type. `embroidery-api.schemas.ts` is
unchanged. No unrelated churn.

The success response is documented as binary (`image/webp`, `format: binary`) with the
`Cache-Control` and `X-Content-Type-Options` headers described; errors continue through the
canonical safe JSON envelope schema. The operation carries no security requirement and no private
storage detail. The generated binary function was **not** hand-exported to Admin or Storefront —
the consuming frontend checkpoint owns its narrow barrel surface.

## S. Frozen artifacts

| Baseline | Status |
| --- | --- |
| Database — 33 migrations / 78 tables / 833 columns / 190 CHECKs | **unchanged**, `pnpm db:check:manifest` exit 0 |
| Database fingerprint `82864268…` | **unchanged** |
| Figma — 72 registry IDs / 72 node rows | **unchanged**, gate + 31/31 tests pass |
| `apps/admin` | **untouched** |
| `apps/storefront` | **untouched** |
| `apps/worker` | **untouched** |
| Tracked Nginx / Compose | **untouched** |
| Dependencies / lockfile | **untouched** |
| Product lifecycle (LC-04, 5 transitions) | **unchanged**, `pnpm check:lifecycle` exit 0 |
| B04 JSON operations | **not started** |

## T. Commit A

```text
136243f37948934ee5f63544a1fa7f8f3fecd133
feat(api): implement public catalog media delivery
```

**31 files changed, 3068 insertions(+), 12 deletions(-)** — implementation, contract, tests and
authority reconciliation only. No completion report, no final checkpoint closure.

| File | Δ |
| --- | --- |
| `apps/api/jest.config.mjs` | 12 +- |
| `apps/api/jest.public-media.config.mjs` | 25 + |
| `apps/api/src/bootstrap/app.module.ts` | 2 + |
| `apps/api/src/modules/asset/asset-intake.module.ts` | 5 +- |
| `apps/api/src/modules/asset/infrastructure/storage/object-storage.module.ts` | 24 + |
| `apps/api/src/modules/catalog/application/public-product-media.service.ts` | 141 + |
| `apps/api/src/modules/catalog/application/public-product-media.service.spec.ts` | 281 + |
| `apps/api/src/modules/catalog/catalog-public-media.module.ts` | 35 + |
| `apps/api/src/modules/catalog/domain/public-product-media.errors.ts` | 89 + |
| `apps/api/src/modules/catalog/domain/public-product-media.policy.ts` | 146 + |
| `apps/api/src/modules/catalog/domain/public-product-media.policy.spec.ts` | 115 + |
| `apps/api/src/modules/catalog/domain/repositories/public-product-media.repository.ts` | 50 + |
| `apps/api/src/modules/catalog/infrastructure/persistence/drizzle-public-product-media.repository.ts` | 106 + |
| `apps/api/src/modules/catalog/presentation/public-product-media.controller.ts` | 151 + |
| `apps/api/src/modules/catalog/presentation/public-product-media.contract.spec.ts` | 158 + |
| `apps/api/src/modules/catalog/presentation/schemas/public-product-media.request.ts` | 40 + |
| `apps/api/src/openapi/build-openapi-document.spec.ts` | 5 +- |
| `apps/api/test/integration/public-media-delivery.integration.spec.ts` | 390 + |
| `apps/api/test/integration/public-media-visibility.integration.spec.ts` | 334 + |
| `apps/api/test/support/public-media-context.ts` | 105 + |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | 1 + (IMP-D036) |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | 27 +- |
| `package.json` | 5 +- (three new scripts) |
| `packages/api-client/src/generated/embroidery-api.ts` | 23 + (generated) |
| `packages/contracts/openapi/openapi.generated.json` | 173 + (generated) |
| `packages/contracts/src/index.ts` | 11 + |
| `packages/contracts/src/public-media/public-product-media-path.ts` | 105 + |
| `packages/contracts/src/public-media/public-product-media-path.test.ts` | 83 + |
| `tools/nginx-public-media-seam.test.mjs` | 111 + |
| `tools/smoke-app2-t01-public-media.mjs` | 246 + |
| `tools/smoke-app2-t01-public-media.test.mjs` | 81 + |

## U. Validation matrix

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/persistence lint / typecheck / test` | exit 0 (via `pnpm quality`) |
| `pnpm --filter @embroidery/object-storage lint / typecheck / test` | exit 0 (via `pnpm quality`) |
| `pnpm --filter @embroidery/api lint` | exit 0 |
| `pnpm --filter @embroidery/api typecheck` | exit 0 |
| `pnpm --filter @embroidery/api test` | 108 suites / 1398 tests pass |
| `pnpm --filter @embroidery/api build` | exit 0 (run by `openapi:generate`) |
| focused T01 unit suite ×2 | 3 suites / **47** tests, twice |
| `pnpm test:public-media:integration` | 2 suites / **36** tests |
| `pnpm smoke:app2-t01-public-media` ×2 | **14/14** |
| `node --test tools/nginx-public-media-seam.test.mjs` | 5/5 |
| `node --test tools/smoke-app2-t01-public-media.test.mjs` | 7/7 |
| `pnpm openapi:generate` / `pnpm check:openapi` | exit 0 |
| `pnpm api-client:generate` / `pnpm check:api-client` | exit 0 |
| `pnpm check:secrets` / `check:lifecycle` + its 10/10 test | exit 0 |
| `pnpm check:frontend-boundaries` / `check:spike-boundaries` / `check:e2e` | exit 0 |
| `pnpm check:figma-design-index` + its 31/31 test | exit 0 |
| `pnpm db:check:manifest` | exit 0 |
| `node tools/check-file-size.mjs` | passed; no T01 file above a threshold |
| `pnpm quality` | exit 0 |
| `git diff --check` | exit 0 |

**Substitutions recorded.** `pnpm test:public-media:integration` is the new script for the
Docker-requiring suites and replaces the prompt's separate PostgreSQL/MinIO and API-integration
commands, which this single HTTP-driven pass proves together. `pnpm smoke:app2-t01-public-media`
is the new gateway/production smoke. Both are excluded from `pnpm quality`, which stays
Docker-free, via `jest.public-media.config.mjs` and the `testPathIgnorePatterns` entry in
`apps/api/jest.config.mjs`.

**Cleanup.** Zero disposable residue: no leftover containers matching the harness, no leftover
disposable databases, no temporary images. Shared-dev durable evidence: **none created** — audit
112 and outbox 35 at entry and exit, one development product temporarily published and restored to
`DRAFT`.

## V. Acceptance

All 68 criteria in §29 are satisfied. The ones worth naming explicitly:

- **(2)** A04 and A04-C1 accepted commits unchanged; **(3)** clean entry; **(4)** `evidences/`
  untouched and unstaged; **(5)** nothing pushed.
- **(7)** No migration; **(8)** `product_media.id` representable and used exactly as authorised.
- **(10, 13)** Exactly one binary route, anonymous, no second media endpoint.
- **(16–24)** Publication, category, attachment, asset lane, derivative readiness and watermark
  all re-checked per request; all misses collapse to one safe 404; unpublish revokes on the next
  request; no in-process visibility cache.
- **(27–31)** No private original, `getObjectStream` only, no buffering, disconnect closes the
  upstream stream, no transaction spanning the stream.
- **(32–36)** Safe content type, `nosniff`, `inline` without filename, `no-store`, no provider
  metadata.
- **(37–42)** Relative shared helper, no host or storage base, API/helper consistency asserted,
  storage key internal, no provider leak, safe provider failure.
- **(51–52)** No audit or outbox write; the existing backlog untouched.
- **(58, 59)** No tracked Nginx/Compose change; no dependency or lockfile change.

## W. B04 handoff

`APP2-B04` is unblocked and unstarted. It should:

- project media references **only** through `buildPublicProductMediaPath` from
  `@embroidery/contracts` — never composing the path, and never exposing `product_media.id` as a
  standalone DTO field;
- map the list projection to `thumbnail` and the detail gallery to `catalog-preview`, in
  `product_media.display_order`;
- remain **exactly two** JSON operations, `publicProduct_list` and `publicProduct_detail`;
- note that a media address is not durable across a media edit (§D), and that the route is
  `no-store`, so per-read projection is the correct pattern;
- keep the browser route unresolved — `/san-pham/<slug>` is still a proposal in `450:404`
  awaiting Product Owner confirmation, and neither T01 nor B04 makes it canonical.

`APP2-S01`/`APP2-S02` remain `BLOCKED_BY_APP2-B04`; `APP2-E01` remains
`BLOCKED_BY_APP2-S01_AND_APP2-S02`. `FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01`,
`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`, `FU-APP2-PRODUCT-ARCHIVE-UI-01`,
`FU-APP2-PRODUCT-VARIANTS-SKU-01` and `FU-APP2-CATEGORY-MANAGEMENT-01` are all unchanged and
nonblocking.
