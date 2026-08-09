# APP3-B05A — Published Design Template Asset Delivery

`COMPLETE — REVIEW_DELIVERED`. Commit A `b7eb10d`. Not pushed.

One anonymous contextual binary operation. No migration, no dependency, no
worker, frontend or Figma change, no root script.

## A · Entry state

The operator accepted the Admin Template branch through `APP3-A04` at handoff.
Recorded in the phase status block: `D01`, `D01-C1`, `B04`, `B04A`, `B05`,
`W01A`, `W01B`, `W01B-C1`, `DB01`, `A01`, `A02`, `A03`, `A03-C1` and `A04` all
`COMPLETE — REVIEW_ACCEPTED`; `B05A` `READY — NOT STARTED`; `S01`
`BLOCKED_BY_APP3-B05A`; `B06C` `READY — NOT STARTED`.

A04's accepted commits `78986de` / `8bc0107` were not reopened. Entry tree clean
on `production`, 21 commits unpushed.

## B · Route-entry audit and the locked route

Prior authority deferred the spelling to this checkpoint's entry. Audited: the
`APP3-B05` public reads and their current-published-version selection, the
`APP3-P01` image-reference identity, `APP2-T01` contextual media delivery, the
`APP3-B02` Side-background route, the operation-id factory, and the slug /
positive-integer / UUID conventions.

Nothing in the current repository mechanically contradicts the directive's
proposal, so it is locked as given:

```
GET /api/public/design-templates/{slug}/versions/{version}/assets/{assetId}
```

It shares the `public/design-templates` base with both B05 reads and collides
with neither: the detail read is `:slug`, this has four more segments. The
contract spec pins the segment list exactly — `[':slug', 'versions', ':version',
'assets', ':assetId']` — so the address cannot drift into a shape where the asset
segment stands alone.

## C · Operation id

`publicDesignTemplateAsset_get`, minted by `PublicDesignTemplateAssetController`.

The factory derives the domain from the **controller class name**, which
`APP3-B04A` established the expensive way — a responsibility split renamed all
eight accepted Admin ids without one route changing. This is deliberately its own
controller class rather than a third method on `PublicDesignTemplateController`:
a different authorization and a different transport, and the class name is chosen
so the id it mints is the one the phase records. The contract spec asserts the
derivation directly rather than reading it back out of the artifact.

## D · Current-public-version authorization

The requested version must carry a publication timestamp **and** be the highest
version that does. Both halves are one SQL statement against one snapshot:

```sql
design_template_versions.published_at IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM design_template_versions newer_version
  WHERE newer_version.design_template_id = design_templates.id
    AND newer_version.version > design_template_versions.version
    AND newer_version.published_at IS NOT NULL)
```

`published_at` is **never cleared** when a newer version is published, so a
version that was once public stays *marked* public forever. The `NOT EXISTS` is
the only thing standing between this route and an accidental public
version-history API. `current_version` is never consulted, for `APP3-B05`'s
reason: in every state the delivered lifecycle can reach it coincides with the
highest published version, and that is exactly why a public read must not lean on
it.

Refused identically: an older historical published version, a newer unpublished
one, a made-up one, and one belonging to another template.

## E · Current Catalog and scope eligibility

Re-evaluated at request time through `ProductPlacementRepository.findPublicPlacementScope`
— the same controller-free port `APP3-B05`, `B07` and `B08` already use. Design
asks; Catalog defines. `GRD-T01` proved the chain active at publication and
nothing keeps it true afterwards: `IMP-D041` PO-07 retires without deleting, so a
retired Side or Area still resolves as a reference.

No Catalog SQL is re-derived, and the gate refuses any appearance of
`products.status`, `categories.status` or `retiredAt` in this checkpoint's
service. Nothing is written back — a read that "repaired" a template would mutate
store data from an anonymous request, and would be wrong the moment the product
was republished.

Proved live: unpublishing the Product, retiring the Side and retiring the Area
each stop the very next request on a path that worked a moment earlier.

## F · Exact version document membership

Decided by `validateDesignDocumentStructure` — the P01 authority every writer
passed through — then by looking for an `image` element whose `assetId` matches.

Two consequences, both wanted. A document the current P01 authority cannot safely
interpret yields **no** references, so delivery fails closed; it is not repaired,
migrated or partially read on the way past. And only a genuine image element
counts: the pre-validation reader `assetIdsIn` accepts an `assetId` on an element
of any type — correct for building an allowlist before a candidate is validated,
wrong as an authorization — so a stray `assetId` on a text or shape element
authorizes nothing. The gate refuses `assetIdsIn` appearing in the membership
module at all.

## G · Durable Template↔Asset association

`design_template_assets` is reached as a **join**, so an asset never associated
with this template, or associated with a different one, is not selectable rather
than filtered out afterwards.

Both halves are required, and the live suite proves each direction:

- **Association without a current-version reference → 404.** The association is
  cumulative: `APP3-B03A` records every asset an Admin ever placed, and removing
  an image in a later version does not remove the row. The test saves a document
  without the image, publishes it, asserts the association row is still there
  (`count = 1`), and shows the address refuses.
- **Document reference without an association → 404.** The association row is
  deleted out of band and the same address stops working.

No association is mutated on this path.

## H · Asset and derivative eligibility

Lane: `TEMPLATE_SOURCE` + `PRODUCTION_SENSITIVE` + `ACCEPTED`, `deleted_at IS
NULL` — re-checked rather than trusted from the save that created the
association, because an original can be rejected or tombstoned long after an
Admin placed it.

Derivative: `kind = NORMALIZED`, `status = READY`, `is_watermarked = false`, and
the whole quartet asserted column by column — `storage_key`, `media_type`,
`width_px`, `height_px`, `byte_size`. `READY NORMALIZED` implies them by CHECK,
but this path *reads* every one, so it asserts the facts it depends on instead of
trusting a constraint from a distance. Zero or negative dimensions and any
unapproved media type are refused at the narrowing step.

`ORIGINAL`, `THUMBNAIL`, `CATALOG_PREVIEW`, `PREVIEW_WATERMARKED` and `MOCKUP`
are not merely excluded by the predicate — the gate refuses any of those strings
appearing anywhere in this checkpoint's source. Normalization is never requested
or generated during the GET.

## I · Raster and sanitized SVG

Exactly two deliverable media types, both persisted outputs of an accepted lane:
`image/webp` from `APP3-W01A` and `image/svg+xml` from `APP3-W01B`'s
`TEMPLATE_SVG_OUTPUT_POLICY`. The check is on the derivative's **persisted**
`media_type`, never the parent asset's `mime_type`, which describes the uploaded
original nobody may see.

SVG is safe here only because the candidate *is* the already-sanitized
`NORMALIZED` derivative — the raw source is not a candidate and there is no
branch that could select it. Nothing re-sanitizes, re-parses or otherwise
re-decides what W01B ruled; the gate refuses `sanitize`, `DOMPurify`, `jsdom` and
`parseSvg` anywhere in this source. That `image/svg+xml` is present here and
absent from the Side-background list is the whole difference between the two
routes (`IMP-D044` PO-04 vs PO-03).

Proved live: a sanitized SVG derivative streams byte-identically under
`Content-Type: image/svg+xml`.

## J · Storage and stream ordering

```
validate path → resolve the durable candidate (one statement)
  → prove document membership → re-prove Catalog eligibility
    → only then open the object
```

No object-storage call happens until every term has succeeded, so a caller
probing slugs, versions or asset ids never reaches the provider and cannot use
response timing or provider load as an existence oracle. The unit suite asserts
this positively — a refused probe records zero provider calls **and** zero scope
resolutions — and the gate compares the *call-site* positions of the two proofs
against `openObject`, not their first mention, because both names appear in the
import list above.

Storage is `ObjectStoragePort.getObjectStream` against the private `DERIVATIVES`
bucket. No URL, bucket, key, presign, credential, provider endpoint, derivative
id or original filename leaves the process; the live suite asserts every one of
those is absent from the response headers. No transaction spans the stream — an
ordinary read needs none (`DEC-DB7-006`) and one here would pin a connection for
the length of a client's download.

## K · Headers and cache

`Content-Type` from the persisted `media_type`; `Cache-Control: no-store`;
`X-Content-Type-Options: nosniff`; `Content-Disposition: inline` with no
filename; `Content-Length` the reconciled size. No `ETag`, `Last-Modified`,
`Range`, `Accept-Ranges` or `max-age`.

`no-store` is not negotiable. A template version is immutable; its **authorization
context** is not. Unpublish, archive, publishing a newer version, a product
leaving the catalogue, and a retired Side or Area each revoke this address without
the version changing by one byte — and there is no cache-invalidation consumer in
this system.

Integrity reuses `APP3-B02`'s rule: the provider's object size must equal the
persisted `byte_size`, both finite and positive. Where two authorities describe
the same bytes and disagree, the honest answer is to send neither — streaming at
the provider's length would contradict the intrinsic dimensions a Studio already
read from the document; streaming at the persisted length would truncate or hang
the response. The stream is destroyed before the refusal.

## L · Safe 404 and 503

Three error codes and no more. Twelve distinguishable internal reasons collapse
into one `PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND`: unknown slug, `DRAFT`,
`ARCHIVED`, unpublished-after-the-fact, withdrawn product, retired Side or Area,
unknown version, historical-but-not-current version, unknown asset, foreign
asset, association-without-reference, reference-without-association, wrong lane
or status, and a derivative that is absent, unready, watermarked, incompletely
described or of an unapproved type.

A storage or integrity contradiction is a **503**, deliberately not a 404: by the
time it can be thrown the full authorization has already succeeded, so the
template *is* public and the object *should* be there. A 404 would tell an honest
caller to stop asking for something that will exist again once the fault is
repaired.

A malformed slug, version or asset id is a 400 at the boundary — refused before
it becomes a predicate that matches nothing, which would be indistinguishable
from a version that legitimately is not public.

No message interpolates a slug, version, asset id, bucket, key, provider name or
column. Every one is a literal in a table the gate parses.

## M · PostgreSQL + MinIO evidence

Two suites, 23 cases, real disposable PostgreSQL and real disposable MinIO,
everything over HTTP. The template is built by the real `APP3-B03`/`B03A`/
`B03B`/`B04` services, so `design_template_assets` is written by the production
save path and the association under test is the one production produces. Only the
`TEMPLATE_SOURCE` asset is seeded directly — see §R.

**Transport** (`public-template-asset-delivery.integration.spec.ts`): exact
`NORMALIZED` bytes; the ruled header set and the reconciled length; sanitized SVG
under its persisted type; no storage identity in any header and no JSON envelope
around the binary; the private original never returned; unready and watermarked
derivatives refused; a deleted object and a doubled object both 503; the
non-disclosure comparison; malformed addresses 400; zero durable delta.

**Revocation** (`public-template-asset-revocation.integration.spec.ts`): unpublish
stops the next request; archive stops it; republication re-enables only the
current version; **publishing v2 retires v1's address while v1's `published_at`
is asserted still set**; product withdrawal, Side retirement and Area retirement
each stop delivery; association-without-reference and reference-without-association
both refused; another template's asset refused at this template's address while
each address still serves its own bytes.

### The defect the live proof found

The newer-published-version test compared `design_template_versions` with itself,
and Drizzle emitted **one relation name for both sides**. The correlated
predicate degenerated to `version > version` — always false — so `NOT EXISTS` was
always true and **every historical published version stayed addressable**.
Publishing v2 left every v1 asset address serving.

Every focused test passed. Every current-version case passed. Only the
version-rollover scenario against a real database could see it. Closed with an
explicit `alias(designTemplateVersions, 'newer_version')`, and the gate now
refuses the unaliased form by name.

## N · Public non-disclosure proof

Five genuinely different invisible states — unknown slug, a `DRAFT` template, an
unknown version of a published template, an unknown asset, and another template's
asset — were fetched over HTTP and their `status:code:message` triples compared.
One distinct value:

```
404:PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND:That design template asset is not available.
```

A separate case asserts the refusal body contains no slug, asset id,
`DERIVATIVES`, table name or lifecycle state.

## O · Zero-write proof

Structural first: the module binds `PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY` —
one method, a read — and **not** `DESIGN_TEMPLATE_REPOSITORY`. There is no
`AuditModule`, no outbox dependency and no normalization dispatcher in its
closure, so there is nothing to write, append or enqueue *with*. The adapter file
contains no `insert`, `update`, `delete` or `for('update')`, and the gate refuses
each of those plus `AuditRecorder`, `OutboxEventStore`, `appendEvent` and
`enqueue` anywhere in this checkpoint's source.

Then measured: a snapshot of `design_templates`, `design_template_versions`,
`design_template_assets`, `assets`, `asset_derivatives`, `audit_events` and
`outbox_events` before and after a mixture of two served and two refused
requests, compared as **deltas** rather than absolutes so another suite's rows
cannot make it pass or fail (`APP3-B06B-C1`). Zero movement in all seven.

## P · OpenAPI and client delta

```
34 paths / 39 operations / 83 schemas   →   35 / 40 / 83
```

Schemas measured, not assumed: a binary response with no request body publishes
two media types rather than a component.

- OpenAPI sha256 `592b9bf78d6dbdea89a403f7509ee7c6ccac2390618432f74556b334d6b7c435`
- generated-client tree `d9aac2b3bfb322c1d604f2802e8a9b154bcb8744eabc780652658196d84735b9`

Both recorded as a **new tier** in `check-app3-b01n-artifacts.mjs` with no line
above them edited, so every earlier world still proves the artifact that phase
actually shipped.

Generated shape:

```ts
publicDesignTemplateAssetGet(slug: string, version: number, assetId: string) => Blob
```

No security requirement, no request body, no query parameter. No TanStack hooks
and no curated export — the consumer-driven boundary waits for `APP3-S01`, which
can construct the address deterministically from `slug`,
`publishedVersion.version` and the document's image `assetId`. B05A adds no
storage URL or derivative id to B05's JSON, so there is no N+1 expansion.

**Disclosed finding.** An `@ApiParam` with no `schema` generates as `unknown` for
that argument — the same family as `APP3-P04`'s schema-less response generating
as `void`. B05A declares a `schema` on every parameter. The accepted `APP3-B05`
detail read still takes an `unknown` slug; that is **reported, not repaired**, and
is not B05A's to change.

## Q · Checker and gate evolution

New: `tools/check-app3-b05a.mjs` (351) with `-authorization.mjs` (162) and
`-transport.mjs` (143), split by responsibility so no file crosses the 400-line
source limit, plus `tools/check-app3-b05a.test.mjs` (550) — 52 cases, each
breaking exactly one ruled property in a throwaway repository copy.

The mutations worth reading are the ones that leave a working route: the
newer-version clause dropped so history stays addressable, the alias removed, the
document proof deleted so the cumulative association alone authorizes, the
eligibility call removed so a withdrawn product keeps serving, storage opened
before the decision, and the deliverable list widened. Each authorization term is
broken independently.

Predecessor gates made world-aware on `isB05ADelivered`:

| Gate | Stale proxy | Now |
|---|---|---|
| B05 | "B05A is recorded **and unstarted**" | one of four legitimate status lines |
| B05 | "a third public Template operation is a failure whatever it is called" | B05A's route excluded **by name**; the ban still fires when the phase is rewound |
| A04 | frozen OpenAPI + client digests | asserted only before B05A; after it the surface counts carry the assertion, and the historical hashes are **not** rewritten |
| B01N | artifact hash tiers | new B05A tier, nothing above it edited |
| B01, DB01, G01, G02, G04 | path allow-lists refusing any `design-templates` shape | consult `acceptedPublicTemplateAssetPaths`, kept apart from `acceptedPublicTemplatePaths` so B05-owned operation counts stay two |

Two source specs carried the same proxy and were corrected the same way:
`public-design-template.spec.ts` excluded B05A's address by name from its
two-operation count and replaced "no `assets`/`preview`/`download` shape exists"
with the real assertion — **this controller** cannot stream, whoever else can.

B05A is never relabelled as a third B05 operation. Ownership stays
`publicDesignTemplate_list` / `publicDesignTemplate_detail` for B05 and
`publicDesignTemplateAsset_get` for B05A.

The gate reads no completion report.

## R · TEMPLATE_SOURCE intake

```
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED
```

Unchanged. Nothing in the delivered system uploads a `TEMPLATE_SOURCE` original,
and B05A invented no intake to close it — a production API written to make a test
pass is a surface nobody reviewed. The asset row and its derivative are inserted
by a canonical disposable fixture, exactly as `product-placement-fixtures.ts`
already does for a Side background, and the object is written at the key the row
records so the two agree. The checkpoint remains valid because text-only
templates need no asset bytes, B03A owns the association semantics and W01A/W01B
own normalization.

The gate refuses any phase document that drops the follow-up.

Also carried unchanged: `FU-APP3-CONFLICT-CODE-CONTRACT-01`,
`FU-APP3-A02-D01-CONTRACT-DRIFT-01`, `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01`,
`FU-ADMIN-SHARED-DIALOG-01`, `FU-ADMIN-SHELL-NARROW-DESKTOP-01`,
`FU-DESIGN-PUBLISH-DS-INPUT-01`.

## S · Files and sizes

37 files. New API source, all under the 400-line limit: policy 115, errors 102,
port 62, membership 44, adapter 240, service 201, request schema 47, controller
208, module 54. Tests, all under 600: unit 448, contract 223, transport
integration 248, revocation integration 246, context 229, fixtures 155. Tools:
351 / 162 / 143 / 550.

Modified: `app.module.ts` (one registration), `public-design-template.spec.ts`
(two proxies), the two generated artifacts, the phase document, the scoped
command index, and eight tool files.

## T · Commit A

`b7eb10d` — `feat(api): deliver published Template assets`.

## U · Validation

Scoped per `VALIDATION_GOVERNANCE.md` §3 to what this change justifies: B05A's
own gate and tests, the gates §29 names, and the gates whose source this
checkpoint edited.

- B05A focused contract/authorization **54/54**; live PostgreSQL + MinIO **23/23**
- B05A gate **PASS**; B05A gate regressions **52/52**
- Gates: `b05a b05 b04 b04a w01a w01b db01 g04 p01 g01 b01 b01n b02 g02 a04` — all **PASS**
- Gate regressions: b05a 52, b05 63, b01n 34, g01 28, g04 39, db01 39, a04 33 — 0 failures
- B05 affected suites **111/111**
- API typecheck, lint, build **PASS**; `openapi:check` and `check:generated` **up to date**
- api-client typecheck **PASS**, tests **44/44**
- `pnpm lint` **24/24**; `format:check` clean; `git diff --check` clean

**Disclosed pre-existing failures.** `check-app3-b01.test.mjs` (4) and
`check-app3-g02.test.mjs` (1) fail identically at `HEAD` with this work stashed
including untracked files. They pre-date the checkpoint, are not its subject, and
were not repaired here.

**A scoping correction, disclosed.** An early run swept 28 APP3 gates at once.
That was a diagnostic to discover which gates the new route broke, not
validation; the recorded validation set is the scoped one above.

## V · Repository state

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed.

## W · Roadmap

```
APP3-B05A = COMPLETE — REVIEW_DELIVERED
APP3-S01  = BLOCKED_BY_APP3-B05A_REVIEW_ACCEPTANCE
APP3-B06C = READY — NOT STARTED
```

On acceptance, `APP3-S01` becomes the next frontend checkpoint. `APP3-B06C`
remains JIT for `APP3-S06` and must not run first. S01 is not implemented here,
and the gate asserts it.

Truthfulness: no `TEMPLATE_SOURCE` intake exists; no historical published version
is exposed; an asset id alone authorizes nothing; no raw SVG is delivered; no
public caching exists; `APP3-S01` is not implemented.
