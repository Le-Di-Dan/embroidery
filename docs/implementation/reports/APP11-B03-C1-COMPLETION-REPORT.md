# APP11-B03-C1 — Composition Compliance & Media-Intake Roadmap Reconciliation

**Checkpoint:** `APP11-B03-C1` (the one and only correction to `APP11-B03`)
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Date:** 2026-08-30
**Baseline HEAD:** `a0bc4cb5` (`feat(app11): deliver Admin gallery media selection and publication (APP11-B02)`), with the uncommitted `APP11-B03` working tree

---

## A. Verdict

```text
APP11-B03-C1 = COMPLETE
APP11-B03    = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-B03A
```

No push occurred. No migration was added. No new HTTP operation was added. No
B03 runtime behaviour changed. `APP11-B03A` was defined but **not** started, and
`APP11-B04` was not started.

---

## B. Accepted B03 contract unchanged

```text
OpenAPI paths      = 113
OpenAPI operations = 125
OpenAPI schemas    = 247

migrations         = 37
```

```text
GET /api/public/gallery-entries                                      publicGalleryEntry_list
GET /api/public/gallery-entries/{slug}                               publicGalleryEntry_detail
GET /api/public/gallery-entries/{slug}/assets/{assetId}/{rendition}  publicGalleryEntry_asset
```

Verified by `openapi:check`, which rebuilds the document **from the live module
graph** and compares it against the committed artifact. It reports the artifact
up to date, so the route surface after the composition change is byte-identical
to the one the Product Owner provisionally accepted: same three paths, same
three operation ids, same 113/125/247, and every B01/B02 operation id untouched.
Nothing was regenerated — the check alone is the proof, exactly as §10 required.

Every locked behaviour in the correction prompt §§1, 6, 7 is unchanged and was
re-proved, not merely asserted: the three gallery live-database suites (82 tests)
all pass against the new composition. `DELETION_PENDING` stays refused;
`FU-APP11-B02-01` stays `RESOLVED_BY_APP11_B03`.

---

## C. Composition correction

```text
app.module.ts before B03   = 339
app.module.ts after B03    = 346   (the defect)
app.module.ts after B03-C1 = 339   (exactly restored)
```

The reduction is **semantic, not cosmetic**. Nothing was minified, no comment was
dropped to save a line, and no threshold was changed. What changed is ownership:

`apps/api/src/modules/gallery/gallery-composition.module.ts` (new, 68 lines) now
owns the whole CTX-GAL HTTP surface —

```text
GalleryCompositionModule
  imports:
    GalleryAdminModule        (APP11-B01/B02 — the seven Admin operations)
    GalleryPublicModule       (APP11-B03 — the two anonymous JSON reads)
    GalleryPublicMediaModule  (APP11-B03 — the one anonymous binary route)
```

— and `AppModule` registers **one** Gallery module at the position the block
occupied. The three-module argument (why the surface is three boundaries rather
than one) moved *beside* those modules, where it belongs, instead of expanding
the application root.

This is not a new pattern. `PaymentCompositionModule` was created by
`APP11-B01-C1` for the identical reason and states it in its own docblock: the
per-module security argument "belongs beside them — not in the application root,
where it was the single largest block". The B03 report's claim that the growth
was unavoidable was wrong, and the precedent for the correct answer already
existed in this repository. That section of the B03 report has been marked
superseded rather than deleted.

**Boundary properties preserved.** The composition module declares no
controller, no provider and no export, so it grants no capability any member did
not already have and broadens no injection authority. Each member keeps its own
injector, so the "defined by what it cannot inject" property each was accepted on
holds exactly as before:

| Member | Still cannot inject |
|---|---|
| `GalleryPublicModule` | object storage; either AGG-18 write port; any Admin provider |
| `GalleryPublicMediaModule` | any Admin provider; the guarded publication writer; the JSON read port |
| `GalleryAdminModule` | unchanged from B01/B02 |

`GalleryModule` — the DB7-CP3 persistence module — is **deliberately absent**
from the composition. It stays persistence-focused: the Admin members import it
for the AGG-18 ports, the public members hold their own read-only ports, and no
controller hangs off it. No controller or service moved between modules; only
who registers whom changed.

---

## D. Media-intake blocker reconciliation

```text
FU-APP11-B03-01 = BLOCKING_PHASE_GAP   (was: NONBLOCKING)
ROUTED_TO       = APP11-B03A
```

The Product Owner is right that this is not a future enhancement. `APP11-B02`
may attach only a `PUBLIC`, non-tombstoned asset and `APP11-B03` may deliver only
such an asset, so with no delivered producer the Gallery cannot be operated end
to end at all — and `APP11-A02` is a frontend checkpoint that cannot manufacture
a backend pipeline. A fixture or a direct `insert` is not a product workflow.

### Audit findings (measured, nothing implemented)

| Question | Finding | Source |
|---|---|---|
| Is there an operator-usable asset intake at all? | **Yes** — `POST /api/admin/assets/upload` (`adminAsset_upload`) | `asset/presentation/admin-asset.controller.ts` |
| Can it produce a `PUBLIC` asset? | **No.** `assetKind` and `classification` are single-value enums in the documented multipart contract and fixed constants in the service — `classification` is annotated "Fixed by policy and not client-selectable" | `schemas/admin-asset.request.ts` `uploadMultipartSchema()`; `asset-intake.service.ts` L382–383 |
| What are the fixed values? | `INTAKE_ASSET_KIND = 'CATALOG_MEDIA'`, `INTAKE_CLASSIFICATION = 'PRODUCTION_SENSITIVE'` | `asset/domain/asset-intake.policy.ts` |
| Why fixed? | INV-09, stated in the policy: *"Intake is never `PUBLIC`: public visibility is reached only through a publication flow, so the client cannot select this value at all."* | same file |
| Does anything promote an asset to `PUBLIC` later? | **No.** Nothing in the repository writes `assets.classification` after insert. The one port that transfers an asset between owners documents that it changes "not its storage key, its classification, its status or its …" | repository-wide search; `customer-ownership-transfer.port.ts` |
| Do the derivatives B03 serves already exist for uploaded assets? | **Yes.** The worker's `CATALOG` inspection lane writes `THUMBNAIL` + `CATALOG_PREVIEW`, unwatermarked, `READY`, and moves the asset `INSPECTING → ACCEPTED` | `apps/worker/src/jobs/asset-inspection/domain/asset-inspection-lane.ts` `CATALOG_INSPECTION_LANE` |
| Would a `PUBLIC` asset be visible to an operator? | **No.** Every Admin asset read is hard-scoped to the `{CATALOG_MEDIA, PRODUCTION_SENSITIVE}` pair | `asset-scope.filters.ts` `scopePredicate`; `asset-catalog.query.ts` `SCOPE` |

Two consequences worth stating plainly:

1. **The derivative half of the gap is already solved by delivered code.** An
   asset uploaded through `adminAsset_upload` ends up `ACCEPTED` with exactly the
   two `READY`, unwatermarked derivatives `APP11-B03` serves. Only the
   classification is wrong for Gallery.
2. **The architecture already names the shape of the answer.** INV-09 says
   `PUBLIC` is reached "through a publication flow", not through intake — so a
   promotion step is the intended mechanism, not an invention.

---

## E. `APP11-B03A` canonical checkpoint definition

Written into the APP11 phase document at **§7.1**, with §3.2 recording the
blocker. Summarised:

```text
APP11-B03A — Admin Gallery Media Intake & Public Derivative Preparation

an authorized operator can create or prepare a Gallery-eligible PUBLIC asset,
which APP11-B02 can attach and APP11-B03 can publicly deliver,
with no direct database mutation and no test-only seeding
```

**Smallest candidate solution: option C — promotion/preparation over an existing
eligible source asset**, not a new upload lane. Options A and B (reuse or add an
upload that can emit `PUBLIC`) would have to weaken or fork the INV-09 intake
rule for a capability the promotion path can provide without touching intake at
all; option D found no other producer. The derivatives already exist; what is
missing is a guarded Admin promotion of an already-`ACCEPTED` catalog-media asset
into the Gallery-public lane, plus the minimum read change that lets an operator
see the result.

**Four open questions B03A must settle before writing code** — recorded rather
than guessed here:

1. **In-place mutation vs. derived asset.** The public Product media route
   requires `classification = PRODUCTION_SENSITIVE`
   (`PRODUCT_MEDIA_ASSET_CLASSIFICATION` in `product-draft.policy.ts`), so
   promoting in place an asset already attached to a published Product would
   silently break that Product's images. B03A must either refuse promotion of an
   in-use product asset or produce a distinct Gallery asset, and must prove which
   against the delivered `product_media` associations.
2. **`kind` disposition.** `APP11-B02` deliberately did not scope eligibility to
   `kind`, so a promoted `CATALOG_MEDIA` asset already qualifies. Whether to move
   it to `GALLERY_MEDIA` has a real consequence: the worker owns no
   `GALLERY_MEDIA` lane, so a re-inspection would never run.
3. **Admin visibility.** Whether the existing scoped reads gain a Gallery lane or
   B03A publishes its own narrow read. This is what makes the HTTP delta one
   operation or two.
4. **Lifecycle and cleanup.** What un-promotion means, and what happens to a
   promoted asset a curator later detaches.

**Acceptance B03A must guarantee** (all ten from the correction prompt §4.2 are
carried into §7.1 verbatim in substance), under locked constraints: no migration
unless live schema inspection proves the asset model cannot represent the
workflow; `CUSTOMER_PRIVATE` originals stay unexposed; the
`PRODUCTION_SENSITIVE` lane is not weakened; no per-image alt persistence; no
generic CMS; B02 and B03 behaviour frozen.

---

## F. HTTP budget

```text
APP11_ORIGINAL_HTTP_DELTA = +11        (B01 +4, B02 +3, B03 +3, B04 +1)
APP11_MEDIA_INTAKE_DELTA  = TBD_BY_APP11_B03A_PREFLIGHT
```

Recorded in the phase document §3 alongside the original figure, and in the
backend slice table as `TBD` for the `APP11-B03A` row. The original `+11` is
superseded transparently, not preserved by hiding the gap — the phase exit
criterion that read "OpenAPI delta exactly +11 operations" now reads "+11 plus
whatever `APP11-B03A` measures".

`MEDIA_INTAKE_HTTP_DELTA = 0` is **not** claimed, and the evidence positively
excludes it: no code writes `assets.classification` after insert, and the intake
contract cannot express `PUBLIC` in either its DTO or its service constants. So
the delta is demonstrably at least one operation. Whether it is one or two
depends on open question 3 above, which B03A measures — this correction does not
invent the number.

---

## G. Validation

Correction impact is composition registration plus documentation; no controller,
DTO, service, repository, policy or projection changed.

```text
pnpm --filter @embroidery/api exec tsc -p tsconfig.json --noEmit
  -> PASS (clean)

pnpm --filter @embroidery/api run openapi:check
  -> PASS — artifact up to date, rebuilt from the live module graph
     113 paths / 125 operations / 247 schemas, unchanged

pnpm --filter @embroidery/api exec jest --runTestsByPath \
  src/modules/gallery/presentation/public-gallery-entry.contract.spec.ts \
  src/modules/gallery/presentation/admin-gallery-entry.contract.spec.ts \
  src/modules/gallery/presentation/admin-gallery-entry-lifecycle.contract.spec.ts
  -> 3 suites, 96 passed

pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runTestsByPath \
  test/integration/public-gallery-api.integration.spec.ts \
  test/integration/admin-gallery-entry-api.integration.spec.ts \
  test/integration/admin-gallery-entry-lifecycle-api.integration.spec.ts
  -> 3 suites, 82 passed

pnpm --filter @embroidery/api exec eslint \
  src/bootstrap/app.module.ts src/modules/gallery/gallery-composition.module.ts
  -> PASS (0 problems)

npx prettier --check <every touched source and document>
  -> PASS

wc -l apps/api/src/bootstrap/app.module.ts
  -> 339                      (target <= 339; source hard limit 400)
wc -l apps/api/src/modules/gallery/gallery-composition.module.ts
  -> 68                       (source hard limit 400, review threshold 300)
```

```text
TESTS_RUN =
  gallery contract suites (B01, B02, B03)          96 passed
  gallery live-database suites (B01, B02, B03)     82 passed
  API typecheck · openapi:check · scoped ESLint · Prettier · file-size
```

The **generated-client check was not re-run and the client was not
regenerated**: `openapi:check` proves the contract document is unchanged, and the
client is derived from that document alone. `openapi:generate` was likewise not
re-run — §12 lists the artifact and the client as changes to avoid, and neither
needed to change.

The B01/B02 suites were run under §10.6: the composition wrapper *does* change
their boot path, because `GalleryAdminModule` is now reached through
`GalleryCompositionModule` and all three suites boot the real `AppModule`.
Running them is what turns "the route graph is equivalent" from a claim into an
observation.

```text
TESTS_NOT_RUN / WHY_NOT_RUN =
  FULL_MONOREPO_TEST  = NOT_RUN   no repository-wide aggregate exists or is permitted
  FULL_API_SUITE      = NOT_RUN   only Gallery composition registration changed
  ADMIN_FRONTEND      = NOT_RUN   untouched
  STOREFRONT          = NOT_RUN   untouched
  WORKER_SUITE        = NOT_RUN   untouched (audited by reading only)
  DB_REGRESSION       = NOT_RUN   no migration, no schema change
  PLAYWRIGHT          = NOT_RUN   no browser surface
  APP11_E01           = NOT_RUN   not this checkpoint
  APP10_E01 and other historical phase suites = NOT_RUN   no shared seam touched
  api-client generate/check = NOT_RUN   contract unchanged, proved by openapi:check
```

**File size.** `app.module.ts` = 339 (target met exactly);
`gallery-composition.module.ts` = 68. Both inside the 400-line source limit and
below the 300-line review threshold. **This is not a repository-wide file-size
PASS** — `node tools/check-file-size.mjs` still reports 79 pre-existing
hard-limit violations, all in files neither B03 nor this correction touched.

---

## H. Files changed

Git-authoritative, C1 only (`git status --short`, restricted to this
correction's paths):

```text
M  apps/api/src/bootstrap/app.module.ts                                  346 -> 339
M  docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
M  docs/implementation/reports/APP11-B03-COMPLETION-REPORT.md
A  apps/api/src/modules/gallery/gallery-composition.module.ts
A  docs/implementation/reports/APP11-B03-C1-COMPLETION-REPORT.md
```

`app.module.ts` is now byte-identical to its `APP11-B03` entry state except for
the Gallery block, which registers `GalleryCompositionModule` in place of
`GalleryAdminModule` and carries a six-line comment of the same length as the one
it replaces.

The `APP11-B03` report was edited in two places only: the composition section is
marked superseded, and `FU-APP11-B03-01` is reclassified with its routing. Its
verdict header and §O roadmap were aligned to the corrected `NEXT`. No B03
evidence, count or proof was rewritten.

The uncommitted `APP11-B03` working tree (36 files) is unchanged by this
correction apart from the two files above.

---

## I. Roadmap

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
APP11-B03A     NEXT
APP11-B04      NOT STARTED
APP11-A01      NOT STARTED
APP11-A02      NOT STARTED
APP11-S01      NOT STARTED
APP11-S02      NOT STARTED
APP11-S03      NOT STARTED
APP11-S04      NOT STARTED
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT` = `APP11-B03A`. B04 is no longer `NEXT`. Neither was started.
