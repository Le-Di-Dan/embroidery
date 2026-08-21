# APP6-B08 — Design Version Authoring

- Phase: APP6 — Design Review, Approval and Quotation
- Checkpoint: `APP6-B08`
- Mode: `BACKEND / DECISIVE_FINISH`
- Authority: `APP6-G01`, ADR-APP6-001 (IMP-D051), LC-08 `TR-LC08-01`
- HTTP operations: 2

```text
APP6-B07 = ACCEPTED
APP6-B08 = COMPLETE
NEXT CHECKPOINT = APP6-B09
```

---

## 1. Entry truth

| Fact | Value |
|---|---|
| HEAD at entry | `34bdef7` |
| `052e1d7` reachable from HEAD | yes (`git merge-base --is-ancestor` exit 0) |
| Working tree at entry | clean (`git status --porcelain` empty) |
| OpenAPI at entry | 66 paths / 72 operations / 150 schemas |

The B07 baseline was accepted as stated. Nothing in it was modified: its
operation id, its authorization, its port and its response projection are
untouched, and the published artifact diff proves it (§8).

---

## 2. The two operations

```text
POST /api/admin/custom-requests/{requestId}/design-versions
     — adminCustomRequestDesignVersion_create
GET  /api/admin/custom-requests/{requestId}/design-versions
     — adminCustomRequestDesignVersion_list
```

One controller, `AdminCustomRequestDesignVersionController`, on the
`admin/custom-requests` base path. Both ids are **derived** from the controller
class, so — as with B07 — no `CONTROLLER_DOMAIN_KEYS` entry was added and
`APP5-B04`'s two ids are untouched.

Not added: design-case create, a design-case detail route, a design-version
detail route, a current-version mutation, `/send`, `/review`, or a generic
lifecycle route. A contract test asserts the absence over the whole design
surface.

Guards match the verb. The mutation carries `AuthenticatedAdminGuard` +
`StaffOriginGuard` + `StaffJsonBodyGuard`; the `GET` carries the Admin guard
only — a body guard on a bodyless request would be cargo-cult decoration.

---

## 3. Request-bound design-case resolution

The server resolves, and the caller supplies nothing:

```text
requestId
  → custom_requests.current_design_case_id     (canonical pointer, G-DB7-09)
  → the design case
  → and the case must name the request back
```

No `designCaseId` is accepted in any parameter position or body field, so
redirecting authoring onto another request's design thread is unrepresentable
rather than refused. The pointer is followed rather than "latest case for this
request", because the pointer is the canonical relation.

An absent, dangling or foreign pointer answers `409 DESIGN_CASE_UNRESOLVED`. It
is **reported, never repaired**: no second case is created and none is rebound.
Two integration tests prove it, one of them asserting the other request's case
still names its own request afterwards.

APP5 creates the one case at submission; B08 reuses it and has no create path.

---

## 4. `TR-LC08-01` eligibility

`DB3_LIFECYCLE_SPECIFICATIONS.md` states the guard as *"request state ∈
{DIGITIZING, DESIGN_REVIEW}"*, and `design-version-eligibility.ts` is that list
and nothing else.

- `DIGITIZING` → first formal version. `GRD-005` and `APP6-B06` gate entry to
  that state on an accepted quotation, so eligibility already implies acceptance.
- `DESIGN_REVIEW` → a revision, which LC-08 makes a new version rather than an
  edit.
- All eight other LC-11 states → `409 REQUEST_NOT_DIGITIZING`, proved by a test
  that walks every one of them and asserts no version row survives.

**No Admin override exists.** There is no flag, header or body field that
bypasses the guard.

The request is **never moved**. `DesignVersionAuthoringModule` imports
`CustomRequestDesignContextModule` — one read-only port — instead of
`OrderModule`, so `transition()`, `submit()` and `setCurrentQuotation()` are not
merely unused but unreachable from this injector. `TR-LC11-08` remains B09's.

### Race safety

The request row is locked with `SELECT … FOR UPDATE` (`lockDesignContext`) before
the state is judged, then `createVersion` takes the design-case lock — request
first, case second, the same order `APP6-B03`/`B05` use, so two concurrent
authors cannot deadlock. Without the request lock a concurrent `APP6-B05`
cancellation could commit between the check and the insert. No process-local
mutex was invented; the version-number race stays where the delivered repository
already arbitrates it, on `uq_design_versions__case_version`.

---

## 5. Branch derivation — server-side, never client-selected

`ADR-APP6-001` §3.2: a request holding a `customer_owned_products` row is a COP
request (CST-027 makes that at most one, so the test is total). The derivation
reads only persisted request state, so two versions of one request cannot land
on different branches — there is no input that could make them.

### 5.1 Catalog

The quartet is assembled from two authorities, deliberately:

| Column | Source |
|---|---|
| `product_id` | `custom_requests.product_id` |
| `product_variant_id` | `custom_requests.product_variant_id` |
| `product_side_id` | the exact submitted Design Session |
| `embroidery_area_id` | the exact submitted Design Session |

The session is reached through a new read-only Design port,
`SUBMITTED_DESIGN_PLACEMENT_PORT`, whose single statement carries B07's exactness
rule verbatim: session id **and** `submitted_request_id = :requestId` **and**
status `SUBMITTED`, one `WHERE`, no `OR`. A foreign session is unreachable rather
than fetched and rejected.

All four are then proved to form one chain by `PLACEMENT_HIERARCHY_PORT`
(G-DB7-10..13) inside the write transaction, and the Side/Area rows are resolved
through the existing `SessionPlacementResolver` — widened to accept a minimal
`{productId, productSideId, embroideryAreaId}` reference so B08 reuses APP3's
retirement, chain and unit-conversion rules rather than copying them.
`DesignSession` still satisfies that shape structurally, so every APP3 caller is
unchanged.

`physical_width_mm`/`physical_height_mm` are the **Product Side's** dimensions,
never anything the caller sent.

### 5.2 No substitution — the acceptance criterion

Every incomplete Catalog context is `409 CATALOG_PLACEMENT_UNRESOLVED` with
nothing written:

| Missing | Proved by |
|---|---|
| request has no variant | test asserts `design_versions` count is **0** repo-wide |
| no submitted session | test |
| session belongs to another request | test |
| session product ≠ request product | code (`resolveCatalog`) |
| Side/Area no longer form a chain | `SessionPlacementResolver` returns `undefined` |

Nothing anywhere picks another active variant, the first side, the latest area,
an unrelated Catalog row, or converts the request to COP.

### 5.3 Customer-owned

Persists `customer_owned_product_id`, a NULL Catalog quartet, and both nonblank
placement labels. `DesignVersionPlacement` is a **discriminated union**, not one
interface with five nullable fields, so CST-129 is a type-level fact: no value of
that type names both branches or carries half a quartet, and `placementColumns()`
writes an explicit `null` for every column of the other branch so no row can
inherit a stale one.

`assertValidPlacement` deliberately does **not** run on this branch
(ADR-APP6-001 §3.3): there is no Catalog authority to reconcile against, and
running it would require fabricating the ids the ADR exists to prevent.

---

## 6. COP placement envelope

`physical_width_mm`/`physical_height_mm` on a COP version are the **embroidery
placement envelope**, supplied by the operator, bounded (`> 0`, ≤ 10 000 mm) and
required.

They are never derived from `customer_owned_products.physical_width_mm` /
`physical_height_mm`. The integration fixture seeds the item at 600 × 900 mm and
the version at 120 × 90 mm, and asserts the persisted row is 120 × 90 — so
"the item's dimensions were not adopted" is an assertion rather than a claim.

The document must agree with the envelope, compared **quantized-exact** on both
sides — the same rule `validatePlacementSnapshot` applies to Catalog — and the
canvas must *be* the envelope, so no element has somewhere legal to sit outside
the area to be stitched. Containment then runs against that rectangle, with the
engine receiving it as an argument and needing no change.

The synthesized area authority carries **empty-string** identity fields: the
containment path reads only the four bound values, and a plausible-looking id
would be the fabrication the ADR forbids.

---

## 7. Design Document — the v2 widening

### 7.1 The version mechanism, and why `CURRENT` did not move

```text
SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS   [1]  →  [1, 2]
CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION       1   →   1   (unchanged)
BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION = 2  (new)
```

ADR-APP6-001 §3.4 rule 2 names the **supported-versions** mechanism, and rule 3
says the Catalog/Studio path keeps emitting the version it emits today and that
APP3 is not modified. Those two together decide the design, and the decisive
evidence is in APP3's own code: `DesignDocumentAuthority`,
`TemplateDocumentAuthority` and `TemplatePublicationAuthority` each pin an
incoming document to `=== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION`, and
`buildEmptyDocument` emits it. Raising the constant would have

1. started emitting v2 into every new Catalog Session and Template, and
2. **refused every already-persisted v1 Session and Template document on its
   next autosave**, as `DOCUMENT_SCHEMA_UNSUPPORTED`.

So `CURRENT` stays 1 and the widening rides `SUPPORTED`. A useful consequence
comes free: those same three pins now *reject* a v2 branch-capable document from
ever entering a Catalog Session or Template, with **zero APP3 edits**.

`tools/check-app3-p01.mjs`'s assertion
`CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION must be exactly 1` therefore still
passes, and no mode-awareness had to be added to that gate.

### 7.2 v1 preserved

`readPlacementId` branches on the declared version *before* reading a field. Below
v2 it calls `requireString` unchanged, so no v1 payload takes a different path
through the validator than it did before B08. Asserted directly:

- v1 + both ids `null` → `INVALID_DOCUMENT` ×2;
- v1 + one id `null` → `INVALID_DOCUMENT`;
- v1 + both ids present → still valid.

No stored document is rewritten, no canonical bytes change, and no hash moves.

### 7.3 v2 semantics

| Document | Result |
|---|---|
| both ids non-null (Catalog) | accepted |
| both ids `null` (COP) | accepted, and `null` survives the rebuild as a value |
| one `null`, one present | rejected, both directions |
| a key omitted | rejected — absence must be written down, not implied |
| empty-string id | rejected, exactly as v1 |

No `branch` discriminator field was added to `DesignDocument`: the complete pair
*is* the branch, and a second way to say it is a second thing that can disagree.
No placement labels were added either — they are separate frozen human evidence
on the version row.

### 7.4 No migration step

`DESIGN_DOCUMENT_MIGRATIONS` stays empty and `assertContiguous` still holds
(no steps, ending at `CURRENT` = 1). None is needed and none was forced: v1 and
v2 are not a linear upgrade of one document but the Catalog-only shape and the
branch-capable shape. A Catalog formal version authored from a v1 submitted
session document **stays v1**, byte for byte; only the COP branch — which could
not be written at v1 at all — is authored at v2.

### 7.5 Publication

The committed `design-document.schema.json` was regenerated by the existing
`scripts/generate-schema.mjs` (no second generator, no hand-authored schema, no
B08-local Zod copy). `DesignDocumentSchemaNode.type` was widened to
`string | readonly string[]` to match what that generator now emits.

The generator emits JSON Schema's `type: ["string","null"]`, which OpenAPI 3.0
does not define. `design-document-schema.augmentation.ts` gained **one**
structural, key-agnostic rewrite beside its existing two —
`type: ["string","null"]` → `type: "string", nullable: true`. Without it the
generated client would have fallen back to an untyped value, the same silent
widening `APP3-B08-C1` added that file to end. Verified in the artifact and in
the client:

```ts
// packages/api-client/src/generated/embroidery-api.schemas.ts
embroideryAreaId: string | null;
productSideId: string | null;
```

Both fields remain **required** in the published schema.

---

## 8. Version semantics, lineage and the current pointer

- Every successful call **inserts a new row**; there is no update path to a
  previous version at any layer, and CST-090's S24 trigger rejects one anyway.
- Version numbers are monotonic under the delivered `createVersion`, arbitrated
  by `uq_design_versions__case_version`. No process-local counter was built.
- **Lineage is read from the case**, never accepted from the body: the new
  version's parent is the case's current version. A caller-supplied
  `parentVersionId` could name another case's version and REL-046's FK would not
  notice, so the field is absent from the contract. The first version has no
  parent and none is invented — `parent_version_id` is nullable precisely so the
  root of a chain can say so.
- **Immutability proved**: a test snapshots v1's full row, creates v2, and
  asserts v1's row is `toEqual` its earlier self.
- **No supersession.** `supersede()` is not called; `TR-LC08-05` happens in B09's
  send transaction where it is atomic with the send.

### The current-version pointer — resolved with source evidence

The pointer **advances to the new DRAFT, inside the create transaction.**

Sources:

- `DB7_TX_APP_GUARD_MATRIX.md` G-DB7-02 names the applicable transaction as the
  *"version create/send tx"* and the enforcing method as
  `DesignCaseRepository.setCurrentVersion` — the create transaction is an
  explicitly named site, not an inference;
- `DB4_SNAPSHOT_AND_VERSIONING_MODEL.md` line 12 records REL-044 as
  **TX-consistent**;
- `TR-LC08-01`'s In-tx column lists "version row (parent ref)" and does not
  forbid the pointer;
- the delivered `setCurrentVersion` accepts any version of the case regardless of
  status, so the repository does not forbid pointing at a DRAFT.

Neither prohibited shortcut was taken: the pointer was not set merely because a
row appeared (the repository permits it and G-DB7-02 names the site), and it was
not left stale.

It is **not** a claim about review state. `findVersionInReview` and
`uq_design_versions__case__sent_for_review` remain the only arbiters of what is
under review (GRD-004), so advancing the pointer while an older version is still
`SENT_FOR_REVIEW` takes nothing from B09's arbitration. Nothing in the repository
reads `design_cases.current_version_id` today except `findById`/the mapper.

---

## 9. Audit and outbox

**Audit: required and delivered.** `DB3_AUDIT_SPECIFICATION.md` lists *"Design
version create/send/decision/void — TR-LC08-01/02/03/07"* and
`DB3_LIFECYCLE_SPECIFICATIONS.md` marks `TR-LC08-01`'s Audit column **yes**. One
`design_version.created` row per version, target kind `DESIGN_VERSION` (already
in `AUDIT_TARGET_KINDS` since DB7), written in the caller's transaction.

The summary carries version refs and branch facts only. The specification says
verbatim *"document content never in audit (hash ref only)"*, so no
`design_document`, no element and no customer text is serialized — and no hash
either, because a DRAFT has none and inventing one would put a value in the trail
that matches nothing.

**Outbox: none, and none invented.** `SE-004 design.review-ready` is B09's,
emitted when a version is *sent*. A draft has no consumer. The module holds no
notification intake port, and a test asserts `notification_intents` is empty
after a create.

---

## 10. Version list and review outcomes

Bounded projection per version: `versionId`, `version`, `status`,
`parentVersionId`, `documentSchemaVersion`, derived `branch`, the four Catalog
ids **or** the two labels, `physicalWidthMm`/`HeightMm`, `current`, `sentAt`,
`approvedAt`, and `reviews`.

- Order is version ascending, as the delivered repository already orders it.
- **All** historical versions stay visible — superseded and void included.
- Each branch reports its own facts and `null` for the other's, so the mixed row
  CST-129 makes unstorable is not reintroduced at the read edge.
- `current` is read from `design_cases.current_version_id` itself, never guessed
  from "the highest version number".
- The **document is not returned**: B07 is the source read, and a history list
  carrying every document would ship the whole thread per render. A test asserts
  the response contains no `schemaVersion`.
- No storage key, derivative, preview hash, provider reference or secret appears,
  and none is reachable — the repository types carry none of them.

**Review outcomes are read, never inferred.** `listReviews` joins
`design_reviews` to `design_versions` so the case is the scope *in SQL*, ordered
`decided_at, id` — `design_reviews` has no sequence column, so a bare timestamp
sort would not be deterministic. A DRAFT and a never-decided version both report
`[]`; nothing derives an outcome from `DesignVersion.status`. Each entry carries
outcome and instant only — no `feedback`, `customer_id`, `grant_id` or
`step_up_challenge_id`.

B08 reads outcomes only: no approve, revision request, step-up, grant resolution
or agreement acceptance is implemented.

---

## 11. Request contract

The create body is `.strict()` with exactly five fields:

```text
document  placementSideLabel  placementAreaLabel  physicalWidthMm  physicalHeightMm
```

A contract test asserts that list exactly and that none of eighteen server-owned
names is accepted (`requestId`, `designCaseId`, `customerId`,
`customerOwnedProductId`, `productId`, `productVariantId`, `productSideId`,
`embroideryAreaId`, `adminId`, `actorKind`, `status`, `version`,
`parentVersionId`, `branch`, `documentHash`, `previewHash`,
`previewDerivativeId`, `createdAt`). Sending one is a `400` naming the key —
ignoring it would let an operator believe it had taken effect.

The COP fields are optional *in the schema* and conditionally required *in the
use case*, where the branch is known. Requiring them in the schema would mean the
schema had to be told which branch it was on by the caller, reintroducing the
client-selected branch the ADR forbids. Sending them on a Catalog request is
`422 PLACEMENT_INPUT_INVALID` — a refusal, not a silent ignore.

`document` carries the `APP3-B08-C1` publication marker, so it publishes as a
`$ref` to the one generated `DesignDocument` component and the generated client
types it accordingly.

Labels are trimmed then `min(1)`, so CST-130's `btrim` nonblank rule is reachable
as a `400` naming the field rather than an opaque database 500.

---

## 12. OpenAPI and generated client — one controlled cycle

Order run, once each:

1. `pnpm --filter @embroidery/design-document schema:generate`
2. focused API typecheck (`tsc --noEmit -p tsconfig.json`)
3. `pnpm --filter @embroidery/api openapi:generate`
4. semantic diff inspection
5. `pnpm --filter @embroidery/api openapi:check`
6. `pnpm --filter @embroidery/api-client generate`
7. `pnpm --filter @embroidery/api-client check:generated`
8. downstream typechecks

| Metric | Before | After |
|---|---|---|
| paths | 66 | **67** |
| operations | 72 | **74** |
| schemas | 150 | **155** |

The five new schemas are `AuthorDesignVersionBody`, `DesignVersionResponse`,
`DesignVersionReviewResponse`, `DesignVersionCreatedResponse` and
`DesignVersionListResponse`.

Semantic diff: the artifact changed by **623 insertions and 0 deletions** — so
B07's operation, the Design Document components and every existing schema are
byte-identical apart from the two widened placement properties, which are
additions within their nodes. Exactly one `DesignDocument` component exists; no
duplicate was introduced.

Steps 5 and 7 were re-run once after Prettier reformatted the controller and the
request schema (line wrapping only). That is the sole rerun, and its input change
is the formatting pass; both reported "up to date" with the same client tree hash
`2c45f140…`.

No generation loop: `openapi:generate` and `api-client generate` were each run
exactly once.

---

## 13. Validation ledger

Selected per `VALIDATION_GOVERNANCE.md` §3 from what this change actually
touches. No repository-wide aggregate was run.

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/design-document test` | **183 passed** / 10 suites |
| `pnpm --filter @embroidery/design-document typecheck` | pass |
| `pnpm --filter @embroidery/design-document schema:check` | up to date |
| `pnpm --filter @embroidery/api exec tsc --noEmit -p tsconfig.json` | pass |
| `jest src/modules/design/tests/integration/design-version-authoring` | **31 passed** |
| `jest src/modules/design/presentation/admin-custom-request-design-version.contract` | **9 passed** |
| `jest src/modules/order/presentation/admin-custom-request-submitted-design.contract` | **10 passed** (B07, reconciled) |
| `jest src/modules/design/tests/integration/design-case.integration` + `approval-snapshot.integration` | **39 passed** |
| `pnpm --filter @embroidery/design-engine typecheck` + `test` | pass / **137 passed** |
| `pnpm --filter @embroidery/api-client typecheck` | pass |
| `pnpm --filter @embroidery/admin exec tsc --noEmit` | pass |
| `pnpm --filter @embroidery/storefront exec tsc --noEmit` | pass |
| `pnpm --filter @embroidery/api openapi:check` | up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date |
| `npx eslint <changed .ts>` | clean |
| `npx prettier --write <changed>` | 8 files reformatted |
| `git diff --check` | clean |
| `node tools/check-app3-p01.mjs` | **2 failures, both pre-existing** (§14) |

### Why the DB7 design suites needed an environment note

`design-case.integration` and `approval-snapshot.integration` boot `DesignModule`
and the object-storage config, which read `DESIGN_SESSION_SECRET_PEPPER` and the
`OBJECT_STORAGE_*` set from the process environment. In this shell those are
unset, so both suites were red **at HEAD** (verified on a stashed, pristine tree:
22 failed / 22). They were then run with **synthetic** values supplied inline for
the run only — no `.env` was read, written or consulted, and no credential was
rotated — and both are green at **39 passed**, proving the widened port, adapter
and row mapper did not break the delivered AGG-10/AGG-11 contracts.

Note that B08's own harness needs neither variable: `DesignVersionAuthoringModule`
does not import `DesignModule`, which is itself evidence of the module boundary.

### Not run, deliberately

Per §21: no B06 transition/race suite (no lock, transaction boundary or
`expectedFrom` semantics changed), no B05 quotation races, no full APP3 Design
Session suite, no full design-engine sweep beyond the focused run above (engine
source is unchanged — only an imported type widened, so the 137-test run is the
regression proof), no full API regression, no frontend or worker suites, no
Playwright, no DB manifest/fingerprint suite, no migration generation, no Figma
checker, no SonarQube.

No race suite was added: `createVersion` already owns a DB-arbitrated
version-number race that B08 does not change, and the composition is covered by
the focused integration tests.

---

## 14. Follow-up dispositions

| Follow-up | Disposition |
|---|---|
| `FU-APP6-DB01-02` (no COP-lookup index) | **`NOT_REQUIRED_BY_B08_QUERY_SHAPE`.** Every B08 access is a PK/UQ/FK-supported point lookup: `custom_requests` by PK, `customer_owned_products` by `custom_request_id` (CST-027 unique, IDX-029), `design_cases` by PK, `design_sessions` by PK, `design_versions` by `design_case_id` (FK/CST-021), `design_reviews` joined by `design_version_id` (FK). No scan and no new access path, so no DDL was added "to be safe". |
| `FU-APP6-DB01-01` (drizzle-kit spurious regex pair) | Unchanged; belongs to the next real database-change checkpoint. No migration generation was run here. |
| `FU-APP6-B08-P01-GATE-01` | **New.** `tools/check-app3-p01.mjs` asserts `highest migration is 34` and a `_journal.json` tag from the APP3 era. `APP6-DB01`'s `0035`/`0036` invalidated both, so the gate has been red at HEAD since that checkpoint — 2 failures, identical before and after B08 (proved against a stashed pristine tree). Its DesignDocument assertions, including `CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION must be exactly 1`, all pass. Not swept here (§21 forbids sweeping unrelated APP3 gates); the constants belong to a DB-owning checkpoint. |
| `APP6-A02` exact-version document detail | **Recorded, not added.** If the workbench later needs one version's full document, it is a third operation and belongs to the checkpoint that needs it. B07 already publishes the *source* document, and the create response returns the created version — no silent third operation was added here. |

---

## 15. Files changed

**`packages/design-document`** (the ADR §3.4 widening)

- `src/schema/constants.ts` — v2 constant; `SUPPORTED` → `[1, 2]`; `CURRENT` unchanged
- `src/schema/document.ts` — `productSideId`/`embroideryAreaId` → `string | null`
- `src/validation/structure.ts` — version-aware placement reader + pair rule
- `src/validation/structure.spec.ts` — v2 suite; future-version case moved to v3
- `src/index.ts`, `src/schema/generated/index.ts`
- `src/schema/generated/design-document.schema.json` (regenerated)

**`apps/api` — design module (new)**

- `domain/design-version-authoring.errors.ts`, `domain/design-version-eligibility.ts`
- `domain/repositories/submitted-design-placement.port.ts`
- `infrastructure/persistence/drizzle-submitted-design-placement.repository.ts`
- `application/author-design-version.use-case.ts`, `design-version-branch.resolver.ts`,
  `formal-design-version.authority.ts`, `list-design-versions.query.ts`,
  `design-version.projection.ts`, `design-version-audit.recorder.ts`,
  `design-version-actor.ts`
- `presentation/admin-custom-request-design-version.controller.ts`,
  `design-version-http-errors.ts`, `schemas/admin-design-version.{request,response}.ts`
- `design-version-authoring.module.ts`
- tests: `tests/integration/design-version-{context,authoring.integration.spec}.ts`,
  `presentation/admin-custom-request-design-version.contract.spec.ts`

**`apps/api` — design module (modified)**

- `domain/repositories/design-case.repository.ts` — branch union, `parentVersionId`,
  `DesignVersionReview`, `listReviews`
- `infrastructure/persistence/drizzle-design-case.repository.ts` — branch-aware
  insert, Catalog-only chain assertion, `listReviews`
- `infrastructure/persistence/design-row.mapper.ts` — `toVersionPlacement`
- `application/session-placement.authority.ts` — minimal reference type
- `tests/integration/design-fixture.ts`, `design-case.integration.spec.ts` — branch tag

**`apps/api` — order module (new)**

- `domain/repositories/custom-request-design-context.port.ts`
- `infrastructure/persistence/drizzle-custom-request-design-context.adapter.ts`
- `custom-request-design-context.module.ts`

**`apps/api` — other**

- `openapi/design-document-schema.augmentation.ts` — nullable dialect rewrite
- `bootstrap/app.module.ts` — module registration
- `modules/order/presentation/admin-custom-request-submitted-design.contract.spec.ts`
  — B07's frozen Admin-request mutation list reconciled with the new route

**Generated**

- `packages/contracts/openapi/openapi.generated.json`
- `packages/api-client/src/generated/embroidery-api{,.schemas}.ts`

**Docs**

- `docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`
- this report

No migration, no SCSS, no Figma node, no frontend, no worker, no `.env` write.
`SCOPED_COMMAND_INDEX.md` unchanged — B08 introduced no new reusable command.

---

## 16. Scope guard

Not implemented, and structurally unreachable from this module: B09
send-for-review, `TR-LC08-02`, `TR-LC11-08`, `DESIGN_REVIEW` projection, GRD-004
arbitration, the review-ready outbox event, B10 secure customer review, B11
approve/revision, Approval Snapshot, agreement publication, frontend, database
migration, and any order/payment/inventory/production work. B07's authorization
semantics are unmodified.

---

## 17. Verdict

```text
APP6-B07 = ACCEPTED
APP6-B08 = COMPLETE
HTTP OPERATIONS ADDED = 2
TR-LC08-01 CREATE DRAFT = DELIVERED
VERSION LIST + REVIEW OUTCOMES = DELIVERED
EXISTING DESIGN CASE = REUSED
REQUEST ELIGIBILITY = DIGITIZING OR DESIGN_REVIEW ONLY
CATALOG BRANCH = COMPLETE AUTHORITATIVE CATALOG CONTEXT
CATALOG SUBSTITUTION = ABSENT
COP BRANCH = CUSTOMER_OWNED_PRODUCT + NULL CATALOG QUARTET
COP PLACEMENT LABELS = FROZEN / NONBLANK
COP ENVELOPE = VERSION PHYSICAL DIMENSIONS
COP ITEM DIMENSIONS AS EMBROIDERY ENVELOPE = FORBIDDEN
DESIGN DOCUMENT COP VERSION = DELIVERED VIA SUPPORTED-VERSION MECHANISM
DESIGN DOCUMENT V1 SEMANTICS = UNCHANGED
MIXED NULL PLACEMENT IDS = REJECTED
HISTORICAL VERSION MUTATION = ABSENT
CURRENT VERSION POINTER = DELIVERED AUTHORITY PRESERVED
SEND FOR REVIEW = NOT STARTED
TR-LC11-08 = NOT PROJECTED
DESIGN.REVIEW-READY = NOT EMITTED
APPROVAL SNAPSHOT = NONE
SERVER RASTER PREVIEW = NONE
DATABASE MIGRATION = NONE
B09 = NOT STARTED
NEXT CHECKPOINT = APP6-B09
```

Local commit: `8debf9f`. Nothing pushed.
