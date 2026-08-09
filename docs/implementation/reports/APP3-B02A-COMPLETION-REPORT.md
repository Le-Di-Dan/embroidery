# APP3-B02A — Authenticated Admin Product Side Background Delivery — Completion Report

```text
APP3-B02A = COMPLETE — REVIEW_DELIVERED
Commit A  = 45a8a688c271cbe61bfe4bd5174ad9f77ee0b339
Commit B  = this report

APP3-A01 = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED
A01_CORRECTION_BLOCKER = WAITING_FOR_APP3_B02A_REVIEW_ACCEPTANCE
```

A just-in-time backend unblock for an already-delivered frontend checkpoint. No
A01 frontend file was touched.

---

## 1. Why this checkpoint exists

`APP3-A01` refused, correctly, to use the public side-background route, a raw
MinIO/S3 URL, a storage key or an unpublished-product bypass — and was therefore
left with no image to author on. Its report said so plainly:

```text
No background image is rendered.
```

The public route (`APP3-B02`) requires `PUBLISHED`. Placement is authored while
the Product is still `DRAFT`. Those two facts cannot both hold, which is why an
Admin-authenticated delivery route is the only honest way to close the gap.

The **load-bearing proof** in this checkpoint is the pair of live tests that show
both routes running against the same seeded background at the same moment: the
Admin route streams the exact bytes, the public route answers `404`. A suite that
only proved a published product works would have proved the checkpoint
unnecessary.

---

## 2. Route derivation

Derived mechanically, not chosen:

| Source | Value |
|---|---|
| accepted public suffix (`APP3-B02`) | `/api/public/products/{slug}/sides/{sideCode}/background` |
| existing Admin Product hierarchy | `/api/admin/products/{productId}/...` (`placement`, `publication`) |
| **result** | `GET /api/admin/products/{productId}/sides/{sideId}/background` |

Ids replace the public slug and code because Admin already holds both UUIDs from
the placement model, and an id-addressed route cannot be reached by guessing a
public address.

The operation id is **derived from the class name**, not declared:
`createOperationId` builds `<controller minus Controller, lower-cased>_<method>`,
so `AdminProductSideBackgroundController.get` →
**`adminProductSideBackground_get`**. Pinned by a contract test.

---

## 3. Authorization

| Required | Not required |
|---|---|
| authenticated Admin (`AuthenticatedAdminGuard`) | Product `PUBLISHED` |
| Product exists | Category public eligibility |
| Side belongs to **that** Product | public placement visibility |
| Side has a live background Asset association | Design Session credential |

`StaffOriginGuard` is deliberately **absent**. It protects mutations from
cross-origin posts; on a `GET` it would reject the plain `<img src>` an authoring
screen uses, which sends no `Origin` at all. Asserted as an absence, because an
absence is only safe when something checks it.

Membership is a **join**, not a second query:
`innerJoin(productSides, eq(productSides.productId, products.id))` plus
`eq(products.id, …)` and `eq(productSides.id, …)`. A Side of another Product
cannot resolve even when both ids are real.

`product_sides.retired_at` is deliberately not filtered: Admin keeps retired rows
visible as history (`IMP-D041` PO-07), so a retired Side's background stays
inspectable rather than becoming a broken frame.

---

## 4. Storage and media policy

Private throughout. API-owned streaming; **no** presigned URL, MinIO/S3 URL,
bucket, key, filesystem path, storage credential or generic `GET /assets/{id}`.
The caller names a Product and a Side; the server resolves the authorized Asset
internally.

`domain/admin-side-background.policy.ts` **declares no constant of its own** —
every value is re-exported from the `APP3-B02` policy, itself a re-export hub
over `product-placement.policy.ts`. A test asserts the file contains no
`= 'LITERAL'` and no `image/...`, so a second copy of `NORMALIZED`, `ACCEPTED`
or a media type cannot appear here and drift.

Reused verbatim: editor-safe `NORMALIZED` derivative kind and `READY` state, the
unwatermarked rule (`INV-22`), the raster-only media types (SVG absent by
construction, `IMP-D044` PO-03), the `DERIVATIVES` bucket, `no-store`, `nosniff`
and a filename-free `inline` disposition. No normalization or transformation on
`GET`, no worker job, no migration, no new dependency.

`no-store` matters *more* here than on the public route: these bytes may belong
to a product that was never published, so no shared or browser cache may retain
them.

---

## 5. Range / conditional semantics

`APP3-B02` publishes no `ETag`, `If-None-Match`, `Range` or `Accept-Ranges`, and
neither does this. The gate asserts their absence: a media protocol surface added
for one screen is a surface the public route would then be expected to match.

---

## 6. Module boundary

New module `CatalogAdminSideBackgroundModule` imports `DatabaseModule`,
`ObjectStorageModule` and `IdentityModule` — and nothing else. It does **not**
import `CatalogPlacementModule`, `CatalogDraftModule` or `AuditModule`, so the
route cannot acquire a write capability by transitive provider access. Asserted
mechanically.

No controller-bearing Catalog module is imported and no other module's concrete
Drizzle adapter is touched.

**Why the service is a separate class rather than shared with `APP3-B02`.** §8
asks for reuse over duplication, and the media *policy* is fully shared. The ~30
lines of open-and-reconcile logic are not, because the `APP3-B02` gate asserts
its invariants against the **body of its own service** (`providerSize !==
descriptor.byteSize`, `result.body.destroy()`, `contentType:
descriptor.mediaType`, resolve-before-storage). Extracting them would move that
code out from under an accepted checkpoint's gate. Parity is held structurally
instead: one shared policy for every constant, and the `APP3-B02A` gate asserting
the same four invariants here. What legitimately differs — publication predicates
and the error vocabulary — is exactly what would have had to be parameterised.

---

## 7. Order of operations

`findDeliverable` **then** `getObjectStream`, asserted by index comparison in the
gate. No object-storage call happens until the contextual read has succeeded, so
a caller probing ids cannot use provider load or response timing as an oracle.
No transaction wraps the storage I/O; the read opens none at all (DEC-DB7-006),
because a transaction spanning a download would pin a connection for its
duration. No storage writes.

---

## 8. Error behaviour

Three codes, mirroring `APP3-B02`:

| Code | Status | When |
|---|---|---|
| `ADMIN_SIDE_BACKGROUND_INVALID` | 400 | malformed id |
| `ADMIN_SIDE_BACKGROUND_NOT_FOUND` | 404 | every resolution miss |
| `ADMIN_SIDE_BACKGROUND_UNAVAILABLE` | 503 | storage outage or size contradiction |

Unauthenticated is `401`, from the existing guard.

The single 404 covers unknown Product, unknown Side, a Side of a **different**
Product, no background association, a withdrawn or tombstoned Asset, and an
absent/unready/watermarked/incomplete derivative. The caller here is an operator,
so the reason is not secret from them — but reporting "the Asset exists, its
derivative is not READY" would put asset-lifecycle internals into a catalogue
response, and a distinguishable 404 would let one Product's id enumerate
another's sides. Proved: the unknown-Product and unknown-Side bodies are
identical on `code` and `message`.

A missing object is `503`, never `404`: the row says READY with a durable key, so
`404` would tell an operator their placement is broken when the fault is in
storage. No asset id, storage key, bucket or lifecycle detail appears in any
error.

---

## 9. OpenAPI and client

```text
before: 31 paths · 36 operations · 81 schemas
after:  32 paths · 37 operations · 81 schemas
delta:  +1 path · +1 operation · +0 schemas
```

Both artifacts regenerated (never hand-edited) and both currentness gates pass.
The 200 response is a concrete binary — `image/webp`, `format: binary` — not the
JSON envelope. `401`, `400`, `404` and `503` are published; security is
`adminSession`.

The generated client uses the repository's existing blob convention:

```ts
apiRequest<Blob>({ url: `…/sides/${sideId}/background`, method: 'GET', responseType: 'blob' })
```

**The operation is deliberately not added to the curated `@embroidery/api-client`
export surface.** That boundary follows the repo's own precedent — an operation
crosses it when a consumer exists (`adminProductPlacementGet` crossed for A01;
`publicProductMediaGet` is still withheld). `APP3-A01-C1` adds the export when it
renders the image. B02A is backend-only.

---

## 10. Focused tests — 27, Docker-free

`apps/api/src/modules/catalog/admin-side-background.spec.ts`

Contract: exactly one handler · derived route · GET · derived operation id ·
Admin guard attached · **no Origin guard** · two strict UUID params.
Policy: raster only, never SVG · DERIVATIVES not ORIGINALS · `no-store` · no
constant of its own · exactly three error codes.
Predicates: membership joins present · **no publication or Category predicate** ·
Asset lane and derivative re-proved · no transaction.
Module: one controller · auth/database/storage imports only · no placement,
draft or audit module · no other Drizzle adapter · no presign/upload/delete.
Service: streams the persisted media type · never touches storage on a miss ·
refuses a size contradiction · provider failure → unavailable · abort propagates
· bucket from policy · never buffers.

---

## 11. Live integration — 13, real PostgreSQL + real MinIO

`apps/api/test/integration/admin-side-background.integration.spec.ts`

Driven through real HTTP with a real Admin session; the body is read as raw bytes
so a JSON envelope could not masquerade as success.

- **unpublished Product streams its exact object** (status asserted `DRAFT` first)
- **the public route refuses the same background at the same moment** (404)
- still serves after the Product is published
- ruled headers and the reconciled `Content-Length`; no filename
- bytes, not an envelope, and no `http` in the body
- no storage identity in any header (key, asset id, bucket, `minio`, `sha256`, `NORMALIZED`)
- anonymous → **401**
- Side of a different Product → 404
- unknown Product and unknown Side → 404, **indistinguishable**
- malformed id → 400
- deleted object → 503
- object contradicting the recorded size → 503
- three reads mutate **no** row, audit, outbox or object (counts and
  `product_sides.updated_at` unchanged; bytes still exact afterwards)

No mocked object store was substituted for the delivery proof.

---

## 12. Checker

```text
node tools/check-app3-b02a.mjs        PASS
node --test tools/check-app3-b02a.test.mjs   34 pass / 0 fail
```

The gate recomputes every fact from the repository and **does not read this
report**. It asserts entry authority (B02 accepted; A01 delivered *and* carrying
the background-preview blocker — a JIT child whose parent blocker vanished is
scope nobody asked for), one protected operation, membership, the **absence** of
publication predicates, the reused policy, the four delivery invariants, the
published binary contract, and the capability negations.

**Its own tests found four real weaknesses in it**, each of which had passed a
mutation that leaves a working route:

1. it accepted **one** `z.string().uuid()` anywhere in the params file while the
   other segment took any string — now both fields are named;
2. it matched a lane constant **anywhere**, including an unused import, so a
   dropped `eq(assets.status, …)` predicate still passed — now asserted as the
   predicate;
3. it matched `CatalogAdminSideBackgroundModule` anywhere in `app.module.ts`,
   including the import statement, so a module imported but never registered
   passed — now scoped to the `imports` array;
4. it matched `responseType: 'blob'` anywhere in the generated client, and two
   other operations already stream blobs, so this one silently becoming a JSON
   read passed — now scoped to this operation's request object.

Registered as `CMD-CHECK-APP3-B02A`, `CMD-TEST-APP3-B02A`,
`CMD-TEST-APP3-B02A-API`, `CMD-TEST-APP3-B02A-INTEGRATION`. No root script; root
scripts remain **30**.

---

## 13. Predecessor gate reconciliation

A new Admin `products/{id}/sides/...` path invalidated **six** predecessor gates
(B01, B02, B01N, DB01, G01, G04) plus the artifact digests — the same cascade
`APP3-B05` hit. Fixed the same way: through the **one** shared surface authority
rather than by editing six literals.

- `app3-accepted-surface.mjs` gained the B02A world (32/37/81) and the path
  authority `acceptedAdminSideBackgroundPaths`;
- `check-app3-b01n-artifacts.mjs` gained the B02A frozen world beside the
  existing ten;
- two rules became **mode-aware in both directions**: B02's "exactly one side
  path" and "exactly one side-background controller". Both now name the paths and
  controllers each *delivered* checkpoint owns rather than counting them — a
  count would have been satisfied by any second file, which is precisely what the
  regression test injects.

`app3-accepted-surface.mjs` crossed the 400-line source limit as a result. Its
per-checkpoint path concern moved to `app3-accepted-paths.mjs` and is
re-exported, so the split moved code without moving a single import.

---

## 14. Validation evidence

| Command | Result |
|---|---|
| B02A focused API spec | **27 passed** |
| B02A live PostgreSQL + MinIO integration | **13 passed** |
| `node tools/check-app3-b02a.mjs` | PASS |
| `node --test tools/check-app3-b02a.test.mjs` | **34 / 0** |
| `check-app3-b02` (predecessor) | PASS |
| `check-app3-b01` (placement) | PASS |
| `check-app3-db01` | PASS |
| every other APP3 gate (b03, b03a, b04, b05, b06a, b06b, b07, b08, g01–g07, p01–p03, w01a, w01b, a01) | PASS |
| `check-api-dist-boundary` | PASS (669 files) |
| API `tsc --noEmit` · `eslint` · `nest build` | PASS |
| `openapi:check` | PASS |
| `api-client check:generated` · `tsc` · `jest` | PASS (44) |
| `pnpm lint` | PASS (24 tasks) |
| `pnpm format:check` | PASS |
| `git diff --check` | clean |

Not run, deliberately: `pnpm quality`, frontend tests, Figma work.

### Disclosed pre-existing failures — not caused by this checkpoint

Established by stashing the change and re-running at `158363a`, so these are
measured rather than assumed:

| Suite | At HEAD | With B02A |
|---|---|---|
| `check-app3-b01.test.mjs` | 4 fail | 4 fail |
| `check-app3-b01n.test.mjs` | 1 fail | 1 fail |
| `check-app3-b02.test.mjs` | 1 fail | 1 fail |

Identical before and after. The one B02A-caused failure — B02's controller test
matching the old message — was fixed by updating that test to the mode-aware
rule.

`check-file-size.mjs` reports **25** hard-limit violations, exactly the count and
the same file set as at HEAD. None is a B02A file (largest new file: the checker
at 332 lines, which only crosses the 300 *review* threshold). Four already-over
gate files grew 3–5 lines each from allowlist additions.

---

## 15. Scope

No migration. No new dependency. No worker change. No frontend change. No Figma
work. No A01 file touched. One operation, one module, one gate.

---

## 16. Forward

```text
APP3-B02A = COMPLETE — REVIEW_DELIVERED
APP3-A01  = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED
A01_CORRECTION_BLOCKER = WAITING_FOR_APP3_B02A_REVIEW_ACCEPTANCE
```

After human acceptance of B02A, the next checkpoint is **`APP3-A01-C1`**, whose
only product change is rendering the authorized Side background in
`PlacementPreview` and proving visual and interaction alignment. It will also add
`adminProductSideBackgroundGet` to the curated api-client export surface, which
this checkpoint deliberately withheld.

`APP3-A01` is **not** marked accepted here, and A01-C1 is not implemented.

**Final state:** branch `production`, working tree clean, Commit A immediately
precedes Commit B, nothing pushed.
