# APP12-V02-C2 — Media Upload, Processing & Image Delivery Reliability Correction

## A. Verdict

```text
APP12-V02-C2 = COMPLETE
APP12-V02    = COMPLETE_AFTER_C2

CORRECTION_USED = 2 / 2
NO V02-C3

APP12-G03 = NEXT   (not started)
```

The reported failure was not object storage. MinIO was healthy for the entire
session, before and after every change. Four defects were found and closed; two
of the reported symptoms were not defects at all.

## B. Human PO C2 override

Authorised as a one-time exception to the one-correction rule
(`V02_MAX_CORRECTIONS = 2`). C2 is a correction under the existing V02
checkpoint and adds no 39th roadmap entry. `ROADMAP_LOCK = LOCKED`,
`CHECKPOINTS = 38`.

During the session the Product Owner also raised one UI defect directly — the
Assets screen carried two buttons opening the same file picker — and approved
publishing one prepared draft product so the `§17` Storefront proof could run in
their own environment. Both are recorded below.

## C. C1 accepted authority — preserved

Not reopened. Brand textual authority stays in the locale JSON, frontend brand
literals remain 0, the strengthened ASCII/indirect static-copy gate remains
binding and still passes, Admin `/login` still reflows at 1024, default locale
is `vi`, there is no language switcher and no `/vi` routes.

## D. Media preflight

The Product Owner's own running stack — gateway, Storefront, Admin, API, worker,
PostgreSQL, MinIO — because `§34.2` requires reproducing the reported defect
where it was reported. All seven services were up and healthy, MinIO included,
for the whole diagnosis.

## E. Media-surface inventory

`/evidences/v02-c2/MEDIA-SURFACE-INVENTORY.md`, built by grepping both apps for
every `<img>`, `next/image`, `background-image`, `createObjectURL` and
`role="img"` — not from memory. It found **four** defective Admin surfaces where
the report named one, and confirmed every Storefront route was already correct.

## F. Human-reported defect reproduction

Reproduced mechanically, and the API log alone would have misled. It said only:

```text
PersistenceError: That value is already in use.  code: DUPLICATE_RESOURCE
POST /api/admin/assets/upload  500  durationMs: 3.676
```

PostgreSQL named the constraint:

```text
ERROR:  duplicate key value violates unique constraint "pk_idempotency_records"
DETAIL:  Key (id)=(1) already exists.
```

Ten consecutive attempts, each failing in 3–4 ms — before a single byte moved,
which is why no object was ever written and why "storage unavailable" was never
plausible on the evidence.

## G. Root causes

**D1 — the 500.** `idempotency_records` held 27 rows with ids 1..27 while its
identity sequence had never been advanced past 0. `claimWithAllocation` guards
`onConflictDoNothing({ target: [operationNamespace, scopeKey] })` — the
*business* uniqueness — so a **primary-key** 23505 is a different constraint and
escapes the guard entirely. Five tables were drifted, and no identity sequence in
the database had ever been called: the signature of `COPY`, which is how
`pg_restore` loads an identity column and which does not advance the owned
sequence. The repository-owned gap is that `tools/db-restore.mjs` verified
row-count parity and migration-journal parity and then printed `restore
verified.` while never checking sequence parity.

**D2 — the misdirection.** `describeApiFailure` ended with
`serverFault → ASSET_COPY.errors.unavailable`, so *any* 5xx rendered as an
object-storage outage. That single fallback is what sent the investigation to
MinIO.

**D3 — the missing contract.** `/api/admin/assets` had list and detail and no
binary delivery, so four Admin surfaces drew a permanent placeholder. Each said
so in its own source; `product-media-placeholder.tsx` even named its successor.

**D4 — measured, then discarded.** `DerivativeGenerationService.measure`
computed each derivative's width, height, media type and byte size;
`finalizeAccepted` promoted the row to `READY` setting only `storage_key`,
`checksum`, `is_watermarked` and `updated_at`. Every THUMBNAIL and
CATALOG_PREVIEW row carried NULL dimensions, so `APP12-H05-C1`'s
`public-media-dimensions.ts` — which states that "`APP2-W01` already writes and
the database has stored all along" — rested on a premise that was false for the
entire catalog lane, and its CLS correction was **inert** there.

## H. Object-storage / gateway correction

None was needed, and this is a finding rather than an omission.

```text
MinIO                 healthy throughout; bucket bootstrap intact
Gateway body limits   client_max_body_size 20m global, 27m upload
§12 probe ~900 KiB    1 020 248 B JPEG → accepted through the real edge
§12 probe  >4 MiB     4 285 414 B PNG  → accepted through the real edge
```

`H04`'s ~1 MiB edge finding did not reproduce on the current repository-owned
development path. The application's 10 MiB ceiling was **not** lowered; the
source generator asserts against it, so a probe can never be a file the
application is right to refuse.

## I. Admin upload pipeline

`tools/backup-runtime.mjs` gains `identitySequenceDrift` and
`resyncIdentitySequences`; `tools/db-restore.mjs` now verifies parity, repairs
it, and re-verifies before it will call a restore verified.
`tools/db-sequence-sync.mjs` is the operator-facing counterpart for a database
already loaded before that check existed — report-only by default, non-zero on
drift so it can gate, `--repair` to fix.

It reproduced the defect and repaired it:

```text
behind: asset_inspections (last_value never, max id 45)
behind: custom_request_transitions (last_value never, max id 4)
behind: customer_merge_events (last_value never, max id 10)
behind: design_reviews (last_value never, max id 5)
behind: idempotency_records (last_value 10, max id 27)
→ repaired — 5 identity sequence(s) advanced past their rows
→ re-check: identity sequence parity OK
```

That is environment repair through a reviewable repository tool, not the manual
state repair `§27` forbids: no asset, derivative or object was touched.

## J. Worker / derivative pipeline

`finalizeAccepted` now writes `width_px`, `height_px`, `media_type` and
`byte_size` alongside the promotion — together, because
`ck_asset_derivatives__metadata_all_or_none` accepts all four or none, so the
database rejects a partial write and the projection can trust what it reads.

```text
kind             rows  with_dimensions  without
CATALOG_PREVIEW    25                2       23   ← 23 historical, 2 corrected
NORMALIZED         20               20        0   ← a different job, always correct
THUMBNAIL          25                2       23
```

Existing rows are **not** backfilled. `public-media-dimensions.ts` already
treats absence as truthful and keeps such media deliverable, so the historical
rows degrade exactly as that document says they should. Backfilling would mean
either re-running inspection over accepted assets or reading dimensions back out
of stored objects, neither of which C2 is authorised to do.

## K. Admin image preview authority

One new operation, `adminAsset_preview`:

```text
GET /api/admin/assets/{assetId}/{rendition}?scope=CATALOG|GALLERY
```

Modelled on the existing `adminGalleryAsset_preview` rather than invented.
Three narrowings, all enforced:

1. **Lane** — reuses `admin-asset-scope.policy`, the same closed vocabulary the
   list and detail reads are confined to. An id outside the named lane is absent
   identically to one that never existed.
2. **Rendition** — an enum of the two processed derivatives. There is no word
   for an original, so a private original is unreachable by vocabulary rather
   than by a check that could be forgotten.
3. **Bucket** — `DERIVATIVES`. The originals bucket is never opened here.

Behind `AuthenticatedAdminGuard`; `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, `Content-Disposition: inline`,
`Content-Type` from the derivative's own type. No storage key, bucket or signed
URL is exposed. Anonymous access returns **401**, verified live.

## L. Product media association and delivery

Full `§17` journey, in the browser, through the real Admin UI — no database
shortcut:

```text
login → Assets → native file chooser → upload → real worker processing →
tile shows real pixels → hard reload → still visible → open a DRAFT product →
picker (now showing images) → select → save → publication → publish →
Storefront Discover shows the thumbnail → Product Detail shows catalog-preview
```

The public projection now carries the intrinsic size, because D4 persists it:

```json
"media": [{ "url": "…/catalog-preview", "role": "THUMBNAIL", "width": 1250, "height": 1250 }]
```

Product Detail served 1250×1250 at `content-length: 796102` — the exact
`byte_size` the worker recorded.

## M. Gallery media association and delivery

Unchanged by C2 and verified correct before any edit: 14 published entries, 12
covers rendering, `naturalWidth` 480 on every one, HTTP 200 `image/webp`. The
Admin gallery curation tile already had its delivery contract
(`adminGalleryAsset_preview`) and was already rendering.

## N. Payment evidence media regression

C2 touched no payment-evidence code path. The dev database holds zero evidence
rows, so an authorised-read proof was not available there; what was verified:

```text
anonymous GET /api/admin/payment-evidence/{id}/content  → 401
API evidence suites                                      94 tests pass
```

The contract guard for that route now also asserts that the new catalog route
cannot reach evidence: it serves the `CATALOG`/`GALLERY` asset lanes only, and
customer-private evidence is in neither.

## O. Placeholder / fallback policy

| State | Renders |
|---|---|
| Valid deliverable media | the image |
| No media associated | a deliberate neutral tile, named "no preview yet" |
| Processing | its own caption — temporary, and says so |
| Rejected | its own caption — there will never be a preview |
| Fetch failed unexpectedly | its own caption, distinct from "no image" |

One caption used to stand in for all five. The last row is why the `onError`
swap is not the shortcut `§19` forbids: it changes *which truthful state* is
shown, and never disguises a delivery failure as an absent image.

## P. Upload stability 6/6

2 PNG · 2 JPEG · 2 WebP, native file chooser, real gateway, real API, real
worker. `/evidences/v02-c2/UPLOAD-STABILITY.md`.

```text
unexplained 5xx                  0 / 6
terminal state reached           6 / 6
derivatives produced           12 / 12
visible preview                  6 / 6
visible after hard reload        6 / 6
```

The bounded transient-failure retry was **not** run. `§10` makes it conditional
and the healthy path is the release gate; injecting a storage fault is `H04`'s
apparatus, and the mechanisms `H04` documents as silently ineffective on this
cluster would have produced something that looked like evidence without being
any.

## Q. Browser / network proof

`/evidences/v02-c2/NETWORK-EVIDENCE.md`. Every claim is a browser measurement or
a response header. The assertion throughout is `naturalWidth > 0`, because a
request can answer 200 with an error envelope, an empty body or an undecodable
type and still leave an `<img>` in the DOM — the exact shape of this defect.

```text
Admin previews        8/8 → 200, image/webp, no-store, nosniff, naturalWidth 384–480
Discover              200, image/webp, naturalWidth 480, width/height attrs 480
Product Detail        200, image/webp, content-length 796102, naturalWidth 1250
Gallery feed          12/12 → 200, image/webp, naturalWidth 480
anonymous preview     401
```

## R. Before/after screenshots

`/evidences/v02-c2/BEFORE-AFTER.md`, with the images under `admin/` and
`storefront/`. One honest gap is recorded there: there is no "before" screenshot
of the broken Admin tiles, because the Admin was unreachable in a browser until
the SCSS and locale faults found on the way in were fixed. The before-state is
captured where it is actually probative — the API log, the Postgres log and the
sequence readout.

## S. Security / privacy

```text
storage bucket / object key / provider host in a browser   none
presigned URL                                              none
private original reachable                                 no — no rendition names one
Admin preview without a session                            401
customer-private evidence via the catalog route            unreachable (wrong lane)
public surfaces                                            processed derivatives only
```

Pinned by `apps/admin/test/boundary/assets-source.test.ts` and by the two
Admin-binary contract guards.

## T. Accessibility regression

On the changed Admin surfaces:

```text
images with a non-empty alt                8 / 8
decorative glyphs aria-hidden              all
non-image tiles with an accessible name    all
file input labelled and keyboard-focusable yes
one h1                                     yes
```

A full axe pass over the changed surfaces was not run from this session's
browser: the repository's axe harness (`h08-axe.mjs`) runs inside the e2e tier,
and the page CSP blocks injecting the library into the dev stack. The properties
C2 actually changed were verified directly, as above.

## U. Performance regression

Remeasured on the three affected public surfaces (development stack, so
indicative rather than the production-build figures `H05` recorded):

| Surface | CLS | LCP | TTFB | Budget |
|---|---|---|---|---|
| Discover | 0.0001 | 364 ms | 123 ms | CLS ≤ 0.10, LCP ≤ 2.5 s, TTFB ≤ 800 ms |
| Product Detail | 0.0000 | 524 ms | 155 ms | " |
| Gallery | 0.0075 | 492 ms | 288 ms | " |

All green. Product Detail's LCP element is the `IMG`, which is expected for an
image-led detail page.

## V. Follow-up reconciliation

`FU-APP12-H05-02` (above-the-fold lazy/`fetchpriority`) and `FU-APP12-H05-03`
keep their existing owner and status. C2 changed no public loading priority and
did not optimise merely to close a follow-up (`§22`).

**New follow-up — `FU-APP12-V02C2-01`.** `apps/admin/.../assets/styles/assets.scss`
is 513 lines, over the 400-line hard limit. C2 split the responsibility it
touched (`_asset-card.scss`, 114 lines) and left the file **74 lines smaller
than it found it** (587 → 513), which is what `§32` asks. Clearing the limit
requires converting `%assets-control*` / `%assets-surface` from placeholder
selectors to mixins, because Sass `@extend` cannot cross a module boundary —
and that changes emitted CSS on the banner, progress, collection and
continuation blocks, none of which C2 touched. Recorded rather than done.

**New follow-up — `FU-APP12-V02C2-02`.** `X-Content-Type-Options: nosniff` is
emitted twice on authenticated media responses, once by the route and once by
the gateway's shared security-header include. Pre-existing and identical on the
`APP11` gallery preview route. Harmless; belongs to whoever owns the gateway
header set.

## W. API / OpenAPI / client delta

```text
paths        125 → 126   (+1)
operations   138 → 139   (+1)
schemas      278 → 278   ( 0)
public ops    49 →  49   ( 0)
```

Within the `§29` authority of ≤ 2, and one rather than two. `openapi:check` and
`api-client check:generated` both green. No generic raw asset-download endpoint.

## X. Files changed

53 files, +1972 / −219 across four commits. New source: the preview policy,
service and controller (API); the shared media tile, its URL builder and its
copy (Admin); the product media tile; `_asset-card.scss`;
`tools/db-sequence-sync.mjs`; the acceptance spec, its world and the upload
source generator. Deleted: `product-media-placeholder.tsx`, whose successor it
had named itself.

## Y. File-size

Every source file C2 added or touched is under 400 lines and every test under
600, except the pre-existing `assets.scss` recorded as `FU-APP12-V02C2-01`.
`node tools/check-file-size.mjs` over the changed trees: **0 files above the
review threshold**.

## Z. Validation

```text
git diff --check                                     clean
Admin jest (full)                          134 suites / 1931 tests   pass
Storefront jest (full)                     134 suites / 2533 tests   pass
API contract specs                          53 suites / 1290 tests   pass
API asset specs (Docker-free)               12 suites /  304 tests   pass
API evidence specs                                        94 tests   pass
Worker asset-inspection specs               10 suites /  158 tests   pass
openapi:generate + openapi:check                                    green
api-client generate + check:generated                               green
check-i18n-message-keys                                             OK
check-i18n-static-text                                              OK
check-report-secrets                        676 docs / 5358 files    pass
check-storefront-route-authority                                    pass
check-file-size (changed trees)                                     pass
check-scss-file-size                        1 pre-existing (FU-01)
prettier --check (changed trees)                                    clean
eslint: admin, api, worker, e2e-testing                             clean
tsc --noEmit: admin, api, e2e-testing                               clean
production builds: Admin, Storefront, API, Worker                   pass
Playwright (live, PO stack): 6/6 uploads, reload durability,
  association journey, Discover, Product Detail, Gallery,
  anonymous refusal, CWV on three surfaces                          pass
```

Two pre-existing failures were confirmed against a stashed tree and are **not**
C2's: the `design-session-*` specs and `test/acceptance/app6-e01/`, both of
which need harness environment (Design Session pepper, database) this session
did not provide.

`packages/e2e-testing/specs/app12/v02-c2-media.acceptance.spec.ts` and its
project are committed but **not executed**: wiring a new `--app12-v02-c2` mode
through the orchestrator's per-mode conditionals is a larger change than the
correction warranted once the same journeys had been proven live against the
Product Owner's own stack, which is where `§34.2` required them. It is ready for
whoever runs the disposable tier next.

## AA. Hygiene

```text
shared-dev commercial residue    0 — no order, payment or customer row touched
G03 data created                 false
production deployed              false
pushed                           false
migrations                       38 (unchanged); no migration 0039
tables                           79 (unchanged)
Wave 2 enabled                   no
```

Added to the Product Owner's development database, deliberately and with
approval: six uploaded test images, and one draft product
(`tui-vai-theu-thu-cong`) published with one of them attached. Both are
representative development data for the `§17` proof, not `APP12-G03`'s
persistent UAT dataset, which remains G03's to create.

One infrastructure change worth naming: `packages/i18n` is now bind-mounted into
both Next apps in `docker-compose.dev.yml`. It was the one shared source package
that was not, so an added message key was missing at runtime until the image was
rebuilt — and `messageView` throws on a missing key, so the page returned 500
while both i18n gates passed against the repository. That asymmetry cost real
time during this correction.

## AB. Final baseline

```text
OpenAPI       126 paths · 139 operations · 278 schemas · 49 public
migrations    38
tables        79
roadmap       LOCKED at 38 checkpoints
```

## AC. Parent correction notice

A concise notice is appended to `APP12-V02-COMPLETION-REPORT.md`. V02's and
V02-C1's historical evidence are unchanged.

## AD. Roadmap

```text
APP12-V02-C2 = COMPLETE
APP12-V02    = COMPLETE_AFTER_C2
CORRECTION_USED = 2 / 2 — no V02-C3

NEXT = APP12-G03   (not authorised to start here, and not started)
```
