# APP11-B01-C1 — File-Size Compliance & Evidence Reconciliation

**Correction:** `APP11-B01-C1` (the one and only correction to `APP11-B01`)
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Date:** 2026-08-30
**Baseline HEAD:** `b4e97570`

---

## A. Verdict

```text
APP11-B01-C1 = COMPLETE
APP11-B01    = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-B02
```

Both blocking defects are repaired. No push occurred. No Figma edit occurred.
No migration was added. No B02/B03/B04 work was implemented.

---

## B. Accepted B01 contract unchanged

Exactly four operations, unchanged in path, method, operation id, guard, request
and response:

```text
GET   /api/admin/gallery-entries                    adminGalleryEntry_list
POST  /api/admin/gallery-entries                    adminGalleryEntry_create
GET   /api/admin/gallery-entries/{galleryEntryId}   adminGalleryEntry_detail
PATCH /api/admin/gallery-entries/{galleryEntryId}   adminGalleryEntry_update
```

```text
paths      = 108
operations = 119
schemas    = 238
migrations =  37
```

`create = DRAFT`; PATCH cannot change `slug`/`status`/assets; linked-product
validation still goes through `CATALOG_SUBJECT_PORT`; no publication, no asset
mutation, no public gallery API, no CMS, no per-image alt field. The 41 APP11
design rows remain `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP11-D01-PO-001`.

**Proof that C1 changed nothing observable.** `openapi:check` rebuilds the
document from the live `AppModule` graph and compares it byte-for-byte with the
committed artifact. It passes after the extraction, so every path, operation id
and schema — payment's and gallery's alike — is identical. No regeneration was
performed: C1 touched no controller, decorator or DTO, so regenerating would
have been ceremony.

---

## C. File-size correction

```text
app.module.ts before = 417
app.module.ts after  = 339      (61 lines of headroom under the 400 hard limit)
```

### C.1 A factual correction to the review premise

The review stated that `417` is where B01 broke the policy. The canonical gate
says the file was **already failing before APP11 touched it**:

```text
node tools/check-file-size.mjs   (CMD-CHECK-FILE-SIZE)

at b4e97570 (pre-B01)   FAIL  apps/api/src/bootstrap/app.module.ts: 409 lines
                              exceeds the source hard limit of 400
                              → 80 hard-limit violation(s) repository-wide
after B01               FAIL  417 lines
after B01-C1            PASS  339 lines
                              → 79 hard-limit violation(s) repository-wide
```

This does not excuse B01 — it inherited a violation, made it eight lines worse,
and then asserted compliance in its report, which was the defect worth catching.
It is recorded because the C1 fix removes a violation the repository has been
carrying since before this phase, and because the B01 report must not be
corrected into a second inaccuracy.

### C.2 The semantic extraction

The single largest block in `app.module.ts` was the **CTX-PAY HTTP surface**:
eight modules, every one under `modules/payment`, with 78 lines of composition
argument written against them.

```text
apps/api/src/modules/payment/payment-composition.module.ts   (new, 116 lines)
  imports (verbatim, same order):
    CustomerDepositModule
    CustomerDepositAttemptModule
    CustomerDepositEvidenceModule
    CustomerFinalPaymentModule
    CustomerFinalPaymentAttemptModule
    AdminOrderPaymentModule
    AdminPaymentVerificationModule
    AdminPaymentEvidenceModule
  controllers: none · providers: none · exports: none
```

Why this is architecturally meaningful rather than line-shuffling:

- **The argument belongs beside the modules.** Each of those 78 comment lines
  explains why *these eight* payment modules are eight rather than one — each is
  the whole security boundary of one obligation lane. That is a statement about
  `modules/payment`, so it now lives there. `CLAUDE.md` §5 requires the narrowest
  valid scope; the application root was the widest.
- **It grants nothing.** The wrapper declares no controller, provider or export,
  so no member can resolve anything it could not resolve before. The
  "defined by what it cannot inject" property each payment module is accepted on
  is untouched — `AdminPaymentVerificationModule` is still the only injector in
  the repository that can move money state.
- **Registration order is preserved exactly.** The array contents are verbatim,
  and `AppModule` imports the wrapper at the precise position the eight entries
  occupied. The OpenAPI artifact matching afterwards is the proof.

`app.module.ts` gained one import and a seven-line replacement comment; nothing
was minified, and no comment was deleted — all 78 lines moved intact.

### C.3 Scoped file-size table

All B01- and C1-owned files, against `CMD-CHECK-FILE-SIZE`'s canonical limits
(source hard 400 / review 300; test hard 600 / review 500):

| PATH | TYPE | LINES | LIMIT | RESULT |
|---|---|---|---|---|
| `apps/api/src/bootstrap/app.module.ts` | source | 339 | 400 | **PASS** (above the 300 review threshold — warning only) |
| `apps/api/src/modules/payment/payment-composition.module.ts` | source | 116 | 400 | PASS |
| `apps/api/src/modules/gallery/gallery-admin.module.ts` | source | 36 | 400 | PASS |
| `apps/api/src/modules/gallery/domain/admin-gallery-entry.policy.ts` | source | 68 | 400 | PASS |
| `apps/api/src/modules/gallery/domain/admin-gallery-entry.errors.ts` | source | 78 | 400 | PASS |
| `apps/api/src/modules/gallery/domain/repositories/gallery-entry.repository.ts` | source | 177 | 400 | PASS |
| `apps/api/src/modules/gallery/application/admin-gallery-entry.projection.ts` | source | 103 | 400 | PASS |
| `apps/api/src/modules/gallery/application/admin-gallery-entry.query.ts` | source | 110 | 400 | PASS |
| `apps/api/src/modules/gallery/application/admin-gallery-entry.service.ts` | source | 120 | 400 | PASS |
| `apps/api/src/modules/gallery/application/linked-product.resolver.ts` | source | 51 | 400 | PASS |
| `apps/api/src/modules/gallery/infrastructure/persistence/drizzle-gallery-entry.repository.ts` | source | 294 | 400 | PASS |
| `apps/api/src/modules/gallery/infrastructure/persistence/gallery-entry-row.mapper.ts` | source | 50 | 400 | PASS |
| `apps/api/src/modules/gallery/presentation/admin-gallery-entry.controller.ts` | source | 263 | 400 | PASS |
| `apps/api/src/modules/gallery/presentation/schemas/admin-gallery-entry.request.ts` | source | 147 | 400 | PASS |
| `apps/api/src/modules/gallery/presentation/schemas/admin-gallery-entry.response.ts` | source | 126 | 400 | PASS |
| `apps/api/src/modules/gallery/presentation/admin-gallery-entry.contract.spec.ts` | test | 261 | 600 | PASS |
| `apps/api/test/integration/admin-gallery-entry-api.integration.spec.ts` | test | 411 | 600 | PASS |

```text
HARD-LIMIT VIOLATIONS AMONG B01/C1-OWNED FILES = 0
```

`app.module.ts` at 339 sits above the **300 review threshold**, which the gate
reports as a warning, not a failure. It is an application-root composition list;
further splitting has diminishing architectural value, so it is left as a
warning and recorded as `FU-APP11-B01-C1-01` rather than driven under 300 by a
second extraction this correction did not need.

**Not fixed, and deliberately so.** The repository-wide run still reports 79
hard-limit violations — 64 in `tools/*.mjs` historical gate scripts and 15 in
APP3–APP9 source. None is B01- or C1-owned, and §12 forbids unrelated historical
cleanup.

---

## D. Evidence reconciliation

Authority: `git diff --name-status b4e97570` against the working tree, with
untracked files staged as intent-to-add so the inventory is complete. No count
below was derived by hand.

```text
FILES_ADDED         = 16
FILES_MODIFIED      =  9
FILES_DELETED       =  0
TOTAL_CHANGED_FILES = 25
```

Every path exactly once, attributed to the checkpoint that owns it:

| # | Status | Path | Owner |
|---|---|---|---|
| 1 | M | `apps/api/src/bootstrap/app.module.ts` | B01 + **C1** |
| 2 | A | `apps/api/src/modules/payment/payment-composition.module.ts` | **C1** |
| 3 | A | `apps/api/src/modules/gallery/application/admin-gallery-entry.projection.ts` | B01 |
| 4 | A | `apps/api/src/modules/gallery/application/admin-gallery-entry.query.ts` | B01 |
| 5 | A | `apps/api/src/modules/gallery/application/admin-gallery-entry.service.ts` | B01 |
| 6 | A | `apps/api/src/modules/gallery/application/linked-product.resolver.ts` | B01 |
| 7 | A | `apps/api/src/modules/gallery/domain/admin-gallery-entry.errors.ts` | B01 |
| 8 | A | `apps/api/src/modules/gallery/domain/admin-gallery-entry.policy.ts` | B01 |
| 9 | M | `apps/api/src/modules/gallery/domain/repositories/gallery-entry.repository.ts` | B01 |
| 10 | A | `apps/api/src/modules/gallery/gallery-admin.module.ts` | B01 |
| 11 | M | `apps/api/src/modules/gallery/infrastructure/persistence/drizzle-gallery-entry.repository.ts` | B01 |
| 12 | A | `apps/api/src/modules/gallery/infrastructure/persistence/gallery-entry-row.mapper.ts` | B01 |
| 13 | A | `apps/api/src/modules/gallery/presentation/admin-gallery-entry.contract.spec.ts` | B01 |
| 14 | A | `apps/api/src/modules/gallery/presentation/admin-gallery-entry.controller.ts` | B01 |
| 15 | A | `apps/api/src/modules/gallery/presentation/schemas/admin-gallery-entry.request.ts` | B01 |
| 16 | A | `apps/api/src/modules/gallery/presentation/schemas/admin-gallery-entry.response.ts` | B01 |
| 17 | A | `apps/api/test/integration/admin-gallery-entry-api.integration.spec.ts` | B01 |
| 18 | M | `docs/design/FIGMA_DESIGN_INDEX.md` | B01 (approval only; **untouched by C1**) |
| 19 | M | `docs/implementation/SCOPED_COMMAND_INDEX.md` | B01 (two ACTIVE rows; **untouched by C1**) |
| 20 | M | `docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md` | B01 + **C1** (roadmap rows) |
| 21 | A | `docs/implementation/reports/APP11-B01-COMPLETION-REPORT.md` | B01, **corrected by C1** |
| 22 | A | `docs/implementation/reports/APP11-B01-C1-COMPLETION-REPORT.md` | **C1** |
| 23 | M | `packages/api-client/src/generated/embroidery-api.schemas.ts` | B01 (generated) |
| 24 | M | `packages/api-client/src/generated/embroidery-api.ts` | B01 (generated) |
| 25 | M | `packages/contracts/openapi/openapi.generated.json` | B01 (generated) |

### D.1 What was wrong in the B01 report, and what it now says

| Claim in B01 | Truth | Disposition |
|---|---|---|
| "**Added (10)**" over a list of 11 paths | 11 runtime source files | heading corrected to "Added — runtime source (11)" |
| "**Modified (7)**" over a list of 9 paths | 9 modified files | heading corrected to "Modified (9)" |
| the B01 report file itself was absent from the inventory | it is a changed file | added as "Added — documentation (1)" |
| "`app.module.ts` … remains inside the hard limit" | false at 417, and false at 409 before it | sentence withdrawn; replaced with the three-point gate measurement and a pointer to this report |
| "B01 adds two passing cases to `zod-dto-publication.contract.spec.ts`" | B01 does not change that file | corrected — see §E |

The B01 report now carries a Git-derived inventory with `FILES_ADDED = 14`,
`FILES_MODIFIED = 9`, `FILES_DELETED = 0` for its own 23 files; this report's 25
adds the two C1-owned files.

---

## E. Shared OpenAPI test provenance

```text
SHARED_TEST_FILE_CHANGED_BY_B01 = false
PRE_EXISTING_FAILURE_CONFIRMED  = true
B01_CAUSED_FAILURE              = false
```

**Proof that the file is untouched:**

```text
$ git status --short -- apps/api/src/platform/openapi/zod-dto-publication.contract.spec.ts
(no output)
$ git diff --stat b4e97570 -- apps/api/src/platform/openapi/zod-dto-publication.contract.spec.ts
(no output)
```

**Where the "two added cases" came from.** The spec walks every `*.request.ts`
module in the API source tree and generates one `it.each` case per documented
JSON request body. B01's new `admin-gallery-entry.request.ts` publishes two JSON
bodies (`CreateGalleryEntryBody`, `UpdateGalleryEntryBody`), so the run grew by
two **generated** cases — 92 → 94 — with no line of the shared file moving. The
B01 report's phrasing implied an edit; it has been corrected to say so.

**Provenance of the two failures, reproduced against the exact baseline** by
stashing only the two generated artifacts and running that single file:

```text
with the b4e97570 artifact   2 failed, 90 passed, 92 total
with the B01 artifact        2 failed, 92 passed, 94 total
```

The two failures are:

- `nothing else about the published surface moved › keeps 19 paths and 23
  operations` — a stale absolute count asserted against the **live** artifact,
  which has carried far more than 19 paths for many phases;
- `no request body publishes an empty schema › publicDesignSession_create
  publishes its fields` — an APP3 body.

Neither names a Gallery path, operation or schema, and both fail identically
without B01's artifact. **Disposition: not repaired here.** §4.1 and §12 forbid
touching unrelated APP3/global count debt, and there are no B01-owned edits in
that file to revert — the equivalent B01 coverage already lives in
`admin-gallery-entry.contract.spec.ts`, which asserts the four operations, the
absent routes, the absent `altText` and the DTO refusals. It remains
`FU-APP11-B01-02` for its owner.

---

## F. Contract / OpenAPI stability

```text
paths      = 108
operations = 119
schemas    = 238
```

Unchanged from B01. **No regeneration was performed** — C1 touched no
controller, decorator, DTO or response class, so the artifacts could not drift,
and regenerating for ceremony would have produced a pointless diff. Instead the
drift gates were run to prove they remain current:

```text
pnpm --filter @embroidery/api openapi:check       PASS — artifact is up to date
pnpm --filter @embroidery/api-client check:generated
                                                  PASS — tree hash 087f08e9…
```

Fingerprints therefore stand exactly as recorded in the B01 report §G:

```text
openapi.generated.json                       90c46ef1e9edd534fe334b7535bf9058b592c1e39c115e29810ab0a4c92d14b8
api-client/src/generated/embroidery-api.ts   d8cc429c2bfaa738d69b1d5ea7b128412007d47c7c2cedef754879037cfb615c
api-client/src/generated/embroidery-api.schemas.ts
                                             903a53fbf3c9918d645264de6f404f94fbbc307f7a3257c884a7af9e29fa3579
```

Because `openapi:check` builds the document from the live module graph, its pass
is simultaneously the proof that the extraction preserved **both** surfaces: the
eight payment modules still register their routes, and `GalleryAdminModule` is
still registered with its four operations.

---

## G. Validation

Correction-impact only.

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E           = NOT_RUN
APP11_E01          = NOT_RUN
```

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api typecheck` | **PASS** |
| 2 | `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runTestsByPath test/integration/admin-gallery-entry-api.integration.spec.ts` (`CMD-TEST-APP11-B01-API`) | **PASS** — 22/22. Boots the real `AppModule`, so this is the direct proof that the extracted composition still registers `GalleryAdminModule` |
| 3 | `pnpm --filter @embroidery/api exec jest --runTestsByPath src/modules/gallery/presentation/admin-gallery-entry.contract.spec.ts` (`CMD-TEST-APP11-B01-CONTRACT`) | **PASS** — 34/34 |
| 4 | `pnpm --filter @embroidery/api openapi:check` (`CMD-OPENAPI-CHECK`) | **PASS** — no regeneration needed |
| 5 | `pnpm --filter @embroidery/api-client check:generated` (`CMD-API-CLIENT-CHECK`) | **PASS** — no regeneration needed |
| 6 | `pnpm --filter @embroidery/api exec eslint src/bootstrap/app.module.ts src/modules/payment/payment-composition.module.ts` | **PASS** — 0 problems |
| 7 | `pnpm exec prettier --write` on the two C1 source files | both already conformant |
| 8 | `node tools/check-file-size.mjs` (`CMD-CHECK-FILE-SIZE`) | scoped table in §C.3 — **0 violations among B01/C1-owned files**; 80 → 79 repository-wide |
| 9 | `pnpm --filter @embroidery/api exec jest --runTestsByPath src/platform/openapi/zod-dto-publication.contract.spec.ts` | run **only** to prove provenance (§E); left failing, not repaired |
| 10 | `git status --short`, `git diff --name-status b4e97570` | §D |

### Not run, and why

```text
full monorepo / API / Admin / Storefront / worker suites — C1 changed one
    composition file and documentation; the OpenAPI drift gate already proves the
    whole route surface is byte-identical
full DB regression      — 0 migrations, 0 schema changes
Playwright / APP11-E01  — no route or screen exists for APP11 yet
payment behaviour suites— the payment modules were moved, not modified; the
    artifact check proves their published surface is unchanged, and the wrapper
    adds no provider that could alter their injectors
historical phase suites — no shared provider, table or contract touched
```

---

## H. Files changed

Git-authoritative; see §D for the complete 25-row inventory with per-file
ownership. C1's own footprint is four files:

```text
M  apps/api/src/bootstrap/app.module.ts                                417 → 339
A  apps/api/src/modules/payment/payment-composition.module.ts          new, 116
M  docs/implementation/reports/APP11-B01-COMPLETION-REPORT.md          corrected
M  docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md         roadmap row
A  docs/implementation/reports/APP11-B01-C1-COMPLETION-REPORT.md       this file
```

`docs/design/FIGMA_DESIGN_INDEX.md` and
`docs/implementation/SCOPED_COMMAND_INDEX.md` were **not** re-edited by C1: the
design approval needs no change (§9 of the correction brief) and no scoped
command changed — `CMD-TEST-APP11-B01-CONTRACT` and `CMD-TEST-APP11-B01-API`
still name the same paths and still pass as written.

---

## I. Follow-ups (non-blocking)

- **`FU-APP11-B01-C1-01`** — `app.module.ts` at 339 lines is inside the hard
  limit but above the 300-line review threshold. If a future checkpoint needs
  headroom, the order/custom-request and design families are the next coherent
  extractions, on the pattern this correction established.
- **`FU-APP11-B01-C1-02`** — the repository carries **79** file-size hard-limit
  violations, 64 of them in `tools/*.mjs`. `CMD-CHECK-FILE-SIZE` is indexed as an
  `ACTIVE_SCOPED` gate but cannot currently pass repository-wide, so it cannot
  fail a checkpoint that introduces a new violation. That is how B01 shipped a
  417-line root file with a report claiming compliance. Worth an owner.
- `FU-APP11-B01-01`, `-02`, `-03`, `-04` from the B01 report stand unchanged.

---

## J. Roadmap

```text
APP11-G01      COMPLETE
APP11-G01-C1   COMPLETE
APP11-D01      COMPLETE
APP11-D01-C1   COMPLETE
APP11-B01      COMPLETE
APP11-B01-C1   COMPLETE
APP11-B02      NEXT
APP11-B03      NOT STARTED
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

Exactly one `NEXT`. `APP11-B02` was not started.
