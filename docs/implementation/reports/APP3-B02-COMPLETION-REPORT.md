# `APP3-B02` — public Product Side background delivery

```text
APP3-B02 = COMPLETE — REVIEW_DELIVERED
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = COMPLETE — CLOSED_BY_APP3-B02
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_SCHEMA_BACKED_HTTP_BODY_CHECKPOINTS
APP3 = IN PROGRESS — PUBLIC_SIDE_BACKGROUND_DELIVERY_DELIVERED_FOR_REVIEW
```

Branch `production`, entry HEAD `64ed230`.
Commit A: `6ce1f05` `feat(api): deliver Product Side backgrounds`.
Commit B: this report only. **Nothing pushed.** Working tree clean.

`APP3-W01B` recorded `COMPLETE — REVIEW_ACCEPTED` on the accepted `W01B-C1`
evidence: the fixed decimal budget removed, exact binary64 values preserved with
verified shortest round-trip formatting, one numeric authority across path,
transform, points, geometry and paint alpha, fixed-point and cross-platform
determinism, 795/795 worker tests, 175/175 security corpus, 38/38 live
normalization, and no dependency, Docker, API, schema, migration or delivery
change.

---

## 1. The operation

```text
GET /api/public/products/:slug/sides/:sideCode/background
    publicProductSideBackground_get
```

Anonymous — no guard, asserted as an absence so it cannot be added by accident.
No request body, no query rendition selector, one handler, one binary response.

**Why the address is keyed by placement.** Slug and Side code are the two public,
stable, server-owned identities. Never an Asset id, derivative id, storage key
or Product Side UUID: a background may be *replaced* without the Side changing,
so an artifact-keyed address goes stale on every operator swap, while a
placement-keyed one keeps resolving to whatever the Side's current approved
background is. Knowing an address grants nothing.

---

## 2. Contextual eligibility

One transactionless statement proves twenty facts against a single snapshot —
Product slug, publication, archive; Category publication, archive; Side
membership, code, activity; the background association; the Asset's lane,
classification, status, tombstone; the derivative's kind, READY state,
unwatermarked flag, storage key and complete quartet — then narrows the row with
positive-dimension, approved-media-type and byte-range guards rather than
trusting the CHECK constraints.

Splitting it would open windows in which an unpublish could commit between
checks. The repository opens no transaction: the caller streams afterwards, and
a transaction spanning that would pin a connection for a client's download. The
read path never writes.

`studioEligible` is never an authorization — it is re-derived from the same
facts.

---

## 3. Stream lifecycle and headers

The object is opened **only after** the descriptor resolves, so a caller probing
slugs never reaches the provider and cannot use provider load or timing as an
oracle. Nothing is buffered. A client disconnect aborts the signal and destroys
the upstream body, guarded on `writableEnded` so completed responses are not
reported as cancelled.

`Content-Type` is the persisted `media_type`; `Cache-Control: no-store`;
`X-Content-Type-Options: nosniff`; `Content-Disposition: inline` with no
filename. No ETag, last-modified, bucket, key, checksum, provider endpoint or
original filename reaches a response. `no-store` because unpublish, retirement
and replacement must each revoke the *next* request and no cache-invalidation
consumer exists.

---

## 4. Provider and persisted metadata are reconciled

`APP2-T01` could only trust the provider's count, because `asset_derivatives`
had no size column. `APP3-DB01` added the quartet, so two independent statements
about the same object now exist. Before any byte is sent the provider's count
must be finite, positive and **equal** to the persisted `byte_size`. Where they
disagree the stream is destroyed and the request answers 503: the provider's
length would contradict the manifest a Studio already read, and the persisted one
would truncate or hang the response. The read path never repairs the database.

The shared storage contract needed no change — `ObjectStreamResult.sizeBytes`
already carries the provider's evidence.

---

## 5. Manifest extension

`background` keeps `productSlug`/`sideCode` and gains `delivery`, all-or-nothing:

```text
delivery = { path, widthPx, heightPx, mediaType, byteSize } | null
```

A path without dimensions would invite a request that cannot be served;
dimensions without a path would be fabricated geometry. `null` is the single
answer for every non-deliverable reason and is what makes `studioEligible` false.

`widthPx`/`heightPx` are the **derivative's intrinsic** dimensions, proven
distinct from the Side's authored `imageWidthPx`/`imageHeightPx` in both the unit
and the live suites (1000×1000 canvas versus a 2048×1536 background). That
distinction closes `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`.

**A defect its own live-stack case caught.** The manifest predicate did not check
the derivative's media type, so a Side whose derivative was `image/svg+xml`
reported `studioEligible: true` while the route correctly refused it — the
manifest advertising a background the route would not serve. Both now read one
shared `EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES` constant, so they cannot disagree.

---

## 6. Route helper boundary

`@embroidery/contracts` owns `buildPublicSideBackgroundPath`; the API composes
the same path locally, because the compiled API cannot `require` a source-only
package (IMP-D018). A build-excluded contract spec proves byte equality for
representative and escape-worthy values, including the longest code the database
CHECK admits. Both encode each segment; neither reaches for a host, origin or
environment. The request schema's side-code pattern is checked against the
literal read from the schema source rather than a second memory of it.

---

## 7. OpenAPI and generated client

| Artifact | Before | After |
|---|---|---|
| paths | 18 | 19 |
| operations | 22 | 23 |
| schemas | 44 | 45 |
| OpenAPI SHA-256 | `53ef5650…9349e` | `38ab7dae…be683` |
| client tree SHA-256 | `7c446629…b19bf` | `129883fa…29d9d` |

Exactly one new path, one new operation, one new schema
(`PublicPlacementBackgroundDeliveryResponse`); the existing background schema was
extended only with `delivery`. No request-body schema. The operation documents
anonymous access, the binary `image/webp` response, the safe 404 and the 503.
Nothing generated was hand-edited. The platform Zod/body follow-up stays open —
B02 has no request body and does not exercise it.

---

## 8. Evidence

| Command | Result |
|---|---|
| B02 unit + contract (`--testPathPatterns=side-background`) | 43/43 |
| B02 + B01 + APP2 media unit regressions | 133/133, 8 suites |
| B02 live-stack (PostgreSQL + MinIO) | **27/27** |
| all public-media live-stack suites (incl. accepted APP2-T01) | **71/71**, 4 suites |
| placement live-stack regressions | 67/67 |
| `node tools/check-app3-b02.mjs` · `-contract` | PASS |
| `node --test tools/check-app3-b02.test.mjs` | **63/63** |
| B01 · B01N · W01A · W01B · G07 · G06 · G04 · G01 · DB01 gates | PASS |
| their gate suites | 40 · 34 · 40 · 39 · 49 · 46 · 39 · 28 · 39 |
| `openapi:generate` · `openapi:check` | PASS |
| `api-client generate` · `check:generated` · `typecheck` · `test` | PASS · PASS · PASS · 44/44 |
| `api exec tsc --noEmit` · `api build` | PASS |
| `pnpm format:check` · `pnpm lint` | PASS · 24/24 |
| `git diff --check` | clean |

**Live-stack behaviour proven:** exact bytes streamed; headers and reconciled
length; no storage identity in any header; the body is not the JSON envelope; the
manifest's emitted path fetches the identical object with matching length and
type; canvas versus intrinsic dimensions; no private identity anywhere in the
manifest; unpublish, archive, category withdrawal and side retirement each revoke
the next request; a replacement is served at the same address with its new
dimensions; a foreign side code is refused while the owning product still works;
an unknown address is indistinguishable from a draft; non-READY, watermarked,
wrong-kind, absent, withdrawn-after-attachment, tombstoned, unapproved-media-type
and incomplete-quartet derivatives never stream; a missing object and a
provider/row size contradiction both fail safely with no misleading body; the
private original is never returned; and two requests append no audit, outbox or
domain row.

---

## 9. Changed files

New API source: the delivery policy, errors, path composer, repository port,
Drizzle repository, service, request schema, controller and module (9 files);
plus the contracts route helper. New tests: contract spec, service spec,
live-stack suite. New tools: `check-app3-b02.mjs`, `check-app3-b02-contract.mjs`,
`check-app3-b02.test.mjs`.

Modified: the placement projection, repository port, Drizzle repository, policy,
response schemas, public controller, app module, contracts index, three test
files and the placement fixture; the OpenAPI and generated client; the phase
document, roadmap and command index; and six predecessor gates plus three of
their test suites (§10). `public-background-metadata.mapper.ts` was extracted so
the placement repository stayed within the 400-line source limit.

Zero changes to: `packages/database`, `packages/domain-types`, `apps/worker`,
`apps/admin`, `apps/storefront`, `infrastructure/**`, the root manifest, any
Figma or design document. No dependency or lockfile change. Migrations remain
**34**; root scripts remain **30**.

---

## 10. Disclosed deviation

`APP3-B01`, `APP3-B01N`, `APP3-W01A`, `APP3-G04`, `APP3-G01` and `APP3-DB01` each
froze the pre-B02 published surface — "no APP3 HTTP operation beyond B01", frozen
OpenAPI and generated-client digests, frozen path lists. B02 is required to add
exactly one operation, so those gates could not pass unchanged while §13 requires
them to pass. Each was made **mode-aware** on this checkpoint's delivered status
line, in the pattern used nine times before: two consistent worlds and no third,
with the half-flipped mixture asserted to fail. `APP3-G06` and
`APP3-W01B-boundaries` additionally accept the platform follow-up's *refined*
wording while still refusing its closure.

§12 lists only `tools/check-app3-b02*.mjs` among allowed tools, so these edits sit
outside that list. They are recorded as
`PREDECESSOR_GATES_MADE_MODE_AWARE_ON_B02`.

Two smaller disclosures:

- `apps/api/test/support/product-placement-fixtures.ts` gained optional quartet
  overrides, so a suite that writes real bytes can record the size it actually
  wrote — and one proving the mismatch refusal can record a size it deliberately
  did not.
- The live-stack suite is named `public-media-side-background.integration.spec.ts`
  so it runs under the **existing** `jest.public-media.config.mjs`. No second
  smoke or integration architecture was created.

---

## 11. Limitations

1. **File-size violations.** Nine files exceed the hard limit. Three are
   pre-existing and untouched (`check-app3-g03.mjs` 409,
   `check-app3-g05.test.mjs` 609, `check-app3-g01.mjs` 411→418). Five more are
   gate tools this checkpoint pushed over by its mode-aware edits
   (`check-app3-b01.mjs` 399→406, `check-app3-db01.mjs` 397→404,
   `check-app3-g04.mjs` 399→404, `check-app3-g06.mjs` 400→410) plus
   `check-app3-b02.test.mjs` at 639. The operator directed that tools files not
   be forced under the limit in this checkpoint; the application source file that
   crossed it was split instead and is now 388 lines.
2. **A pre-existing intermittent in the placement concurrency suite.** "advances
   the token on every successful replace" fails roughly two runs in five, with a
   *new* `updated_at` earlier than the old one. Characterised on both sides:
   2/4 failing runs with these changes, 2/5 failing runs at `64ed230` with the
   changes stashed. Unrelated to B02 — nothing here touches
   `lockProductForReplace`.
3. **Range requests are not supported**, because the accepted APP2 binary
   foundation does not own them. A Studio fetching a whole background needs none.
4. **No cache-invalidation consumer exists**, so `no-store` is the only safe
   policy. Immutable public caching remains a later deployment decision.
5. `FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01` stays open and still blocks
   schema-backed HTTP **body** checkpoints. Its scope was refined, not closed:
   B02 shipping a body-free operation is what proved the narrower statement.

---

```text
APP3-B02 = COMPLETE — REVIEW_DELIVERED
```

Human review owns `APP3-B02 = COMPLETE — REVIEW_ACCEPTED`.
