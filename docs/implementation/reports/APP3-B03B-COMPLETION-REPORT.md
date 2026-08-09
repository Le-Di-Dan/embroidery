# APP3-B03B — Initial Design Template Scope Assignment · Completion Report

`APP3-B03B = COMPLETE — REVIEW_DELIVERED`
Commit A `8021bc2` — `feat(api): assign initial Design Template scope`

---

## A. Why this checkpoint exists

Human review did not accept `APP3-A03`. The blocker, recorded as
`A03_REVIEW_BLOCKER = UI_CREATED_UNSCOPED_TEMPLATE_CANNOT_BECOME_AUTHORABLE`, is
provable from accepted contracts alone:

| Fact | Source |
|---|---|
| The Admin UI creates an **unscoped** DRAFT | `APP3-A02`'s create dialog, deliberately narrowed |
| Create *can* take a complete triple, but A02 does not collect it | `CreateDesignTemplateBody` |
| Every Design Document requires a `DesignPlacementSnapshot` | `APP3-P01` |
| No accepted operation assigns a scope after creation | measured across the whole contract |

So `APP3-A03` could not construct the first document for the ordinary Template
its own list creates. The A03 browser review had to seed a scoped Template
through the published API to prove the editor journey at all — an end-to-end
Admin workflow blocker, not cosmetic debt.

## B. The ruling, implemented

`B03B_SCOPE_RULING = ONE_TIME_INITIAL_SCOPE_ASSIGNMENT_BEFORE_FIRST_VERSION`.

An unscoped Template receives its exact Product + Side + Embroidery Area scope
**once**, while `status = DRAFT`, `current_version = 0`, all three scope columns
are `NULL` and no version rows exist. Afterwards the scope is the validated
triple, the status is still `DRAFT`, the counter is still `0`, and there are
still zero versions.

**There is no rescope and no clear**, and the refusal is the ruling rather than
caution. Once a version exists, its document carries an *immutable* placement
snapshot naming the Side, the Area, the canvas and `pxPerMm`. Rescoping
afterwards would leave every saved version describing a placement the header no
longer claims, and `APP3-B04`'s `GRD-T01` would compare a document against
geometry it was never authored on. Refusing is the only answer that keeps
existing versions meaningful.

## C. The operation

```text
PUT /api/admin/design-templates/{templateId}/scope
adminDesignTemplate_assignScope
```

Body — strict, all three required, nothing else:

```json
{ "productId": "…", "productSideId": "…", "embroideryAreaId": "…" }
```

**No `expectedCurrentVersion`.** Every other guarded write in this surface
carries one because its legal source state is a *range* — a save may advance
from any counter, a publish may transition from any version. This one's legal
source state is a single point, so a caller-supplied token could only ever hold
the value the server already requires, and a field whose only legal value is `0`
is a field that can only be wrong. The compare-and-set pins all four conditions
regardless of what a caller believes. §3's conditional therefore does not fire;
recorded here rather than left implicit.

Response: the shared `AdminDesignTemplateDetailResponse` — `status: DRAFT`, the
exact triple, `currentVersion` **absent**, no document. No open map, no `void`.

## D. Atomicity and the race

`assignInitialScope` is one `UPDATE … WHERE`, never a read-then-write. The
predicate carries every condition of the ruling:

```text
id = :id
AND status = 'DRAFT'
AND current_version = 0
AND product_id IS NULL
AND product_side_id IS NULL
AND embroidery_area_id IS NULL
AND NOT EXISTS (SELECT 1 FROM design_template_versions WHERE design_template_id = :id)
```

The three `IS NULL` clauses are what make the assignment one-time: an
already-scoped Template cannot match, so a rescope is *unrepresentable* rather
than merely unimplemented. The `NOT EXISTS` is not redundant with the counter —
the two agree in every state this code can produce, but "agree in every state we
can produce" is an assumption, and the ruling names *zero immutable versions*.
It costs one correlated subquery and fails closed if they ever diverge; a live
test seeds exactly that divergence and proves the refusal.

The three scope columns are written in the same `SET`, so a partial scope — the
state `IMP-D042` PO-06 calls *wrong* rather than incomplete — cannot be produced
by an interrupted assignment. Nothing else is written: not the status, not the
counter, not a version.

One refusal code for every non-assignable cause, exactly as `saveDraftVersion`
does: a caller learning "already scoped" separately from "not DRAFT" separately
from "has versions" would learn the Template's lifecycle state from a write it
was not allowed to make.

## E. Scope validation

`DesignTemplateScopeAuthority` — `APP3-B03`'s own, reused unchanged. Product
exists, Side belongs to the Product, Area hangs from that Side, neither retired.
Read through `PRODUCT_PLACEMENT_REPOSITORY`, the controller-free port; no
duplicated Catalog SQL and no controller-bearing Catalog import.

**No Product-publication predicate.** `IMP-D042` PO-07 makes readiness
`GRD-T01`, which is `APP3-B04`'s; a draft scoped to an unpublished Product is an
ordinary draft. Proved live against a `DRAFT` Product, and asserted as an
absence in both the use case and the shared authority — the latter so the reuse
cannot silently import a readiness check later.

The scope resolves **before** the transaction opens: it is a read against
Catalog, and holding a write transaction across it would widen the conflict
window for no benefit.

## F. What it creates: nothing

Zero versions, zero documents, zero Asset associations, zero normalization
events, no lifecycle change, no `published_at`, no counter movement.

Each is proved **by omission**: the repository double in the focused suite
carries `saveDraftVersion`, `ensureAssetAssociation`, `publishVersion` and
`attachAsset`, and the tests assert they were never called. A rule that says "we
do not do X" is only proved by offering X and watching it stay untouched. The
live suite counts the version, association and outbox rows after a success.

## G. Audit

One row per success, in the same transaction as the scope:

```text
action     design_template.scope_assigned
targetKind DESIGN_TEMPLATE
summary    { from: 'UNSCOPED', productId, productSideId, embroideryAreaId }
```

The scope ids are the subject of the change, so unlike every other action in
this recorder they belong in the summary: a trail that did not say *which*
placement was chosen would not explain the one thing that happened. No reason —
`IMP-D042` PO-03 requires one for archive and restore only. No document, Asset
id, storage fact or Outbox payload. No Outbox event at all: this operation has
no consumer, and inventing one would be an endpoint announcing work nobody does.

The live suite proves atomicity in both directions: exactly one Audit row after
a success, zero after every refusal, and exactly one after the concurrent race.

## H. Errors

| Situation | Status | Code |
|---|---|---|
| Unknown Template | 404 | `DESIGN_TEMPLATE_NOT_FOUND` |
| Already scoped / has versions / not DRAFT | 409 | `DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE` |
| Triple does not resolve, or a retired row | 400 | `DESIGN_TEMPLATE_SCOPE_INVALID` |
| Partial triple | 400 | Zod, before any repository call |

`DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE` is deliberately distinct from
`…_SCOPE_INVALID`: the first says the *Template* is not a candidate, the second
says the *triple* is wrong. A different triple can fix the second and nothing can
fix the first.

The persistence guard is translated at the use case rather than left to escape —
`assignInitialScope` raises a `PersistenceError`, which is not an
`HttpException` and would surface as a 500 against a published 409.
`APP3-B06B-C1` found exactly that defect in the Session lane.

## I. Tests

**Focused — 34** (`design-template-scope-assign.spec.ts`). Docker-free, every
collaborator a double. Covers the published operation and its body, the
absences, the shared-authority reuse, every non-assignable source state, the
guard translation and the compare-and-set shape.

**Integration — 16** (`design-template-scope-assign.integration.spec.ts`).
Disposable PostgreSQL, no MinIO, driving the **real HTTP stack**: the same
`ValidationModule`, `RequestContextModule` and `HttpResponseModule` production
uses, so the status codes, the envelope and the Zod rejection are the real ones.
Only the three staff guards are replaced, and the admin stand-in binds the actor
through the same `createAdminActor` factory the real guard uses, so the Audit row
comes from a genuinely ALS-bound actor.

Directive §13's 29 cases map onto these two suites; the ones worth naming:

| Case | Where proved |
|---|---|
| Unscoped DRAFT v0 succeeds; status, counter and version rows unchanged | live |
| Response carries no `currentVersion` and no document | both |
| No version, association or outbox row after success | live |
| Wrong Product/Side, wrong Side/Area, retired Side, retired Area | live, each leaving all three columns `NULL` |
| Unpublished Product succeeds | live (fixture Product moved to `DRAFT` on purpose) |
| Already scoped refused, original triple untouched | live |
| Partial legacy scope fails closed rather than being repaired | live |
| Version > 0 refused; version rows at counter 0 also refused | live |
| PUBLISHED and ARCHIVED refused | live |
| Audit only on success; scope and Audit roll back together | live |
| Two concurrent different assignments → one 200, one 409, one complete triple, one Audit row, zero versions | live |

## J. Pre-existing defects found and repaired

**1. The shared design integration fixture could not seed.** `design-fixture.ts`
(last touched 2026-07-21) inserts `product_sides` and `embroidery_areas` without
`code`, which migration `0034` (2026-08-04, `APP3-DB01`) made `NOT NULL`. Every
suite seeding through it has failed in `beforeEach` since. **Repaired** — B03B's
own integration requirement cannot be met without it. Recorded as
`FU-APP3-DESIGN-FIXTURE-CODE-01 = RESOLVED_BY_APP3-B03B`.

**2. A regression that asserted nothing.** `check-app3-b01n.test.mjs`'s
platform-follow-up case mutates `FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN`
→ `CLOSED`. `APP3-P03` closed that follow-up, so the text has not existed for
some time: the mutation was a no-op, the gate passed, and the test failed on its
own assertion. **Re-pointed** at the branch that is actually live — a follow-up
may only be closed by a checkpoint the phase records as complete.

**3. Not repaired, and deliberately so.** Three integration suites importing
`DesignModule` still fail at module init because `DESIGN_SESSION_SECRET_PEPPER`
is unset in the persistence harness. Different module, different root cause, and
deciding how Session auth config reaches a shared harness is a real decision
rather than plumbing. `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01 = OPEN`.

## K. Gate evolution

Eight rules pinned absolute surface totals and broke on the +1. Each was made
world-aware through a **shared authority** rather than re-litigated in place:

| Gate | Was | Now |
|---|---|---|
| `app3-accepted-paths` | Admin Template paths per checkpoint | gains a `B03B` entry; every gate consulting it follows |
| `app3-accepted-surface` | surface per delivered world | gains the 33/38/82 world |
| `check-app3-b01n-artifacts` | digest + facts cascade | **new tier** beside the existing ones; no historical hash rewritten |
| `check-app3-b02a` | `32` paths / `37` operations | `acceptedSurface(rootDir)` |
| `check-app3-b04` | `7` template operations, `5` guarded writes | both derived from the path authority |
| `check-app3-a02` / `a03` | frozen totals | the enumerated Admin Template path set, plus a floor |
| `design-template-{save,lifecycle,admin}.spec` | `5` guard pairs | counted from the contract's mutating operations |
| `build-openapi-document.spec`, `design-session-response.contract.spec` | `19/23` and `23/27` literals | compared against the **committed artifact** |

The last two are worth naming: `build-openapi-document.spec`'s own comment
recorded that its count "had been failing before `APP3-P03` touched anything".
A hard-coded total says nothing about correctness and rots on every operation;
comparing the in-process document to the committed artifact is both stronger and
stable, because it catches exactly the drift that matters — a controller changed
without regeneration.

Ownership is unchanged: B03 create/list/detail · B03A document save · **B03B
initial scope assignment only** · B04 publish/unpublish/archive · B04A restore ·
B05 public reads.

## L. Frontend untouched

`apps/admin` has no change. The generated client publishes
`adminDesignTemplateAssignScope`, and the curated `@embroidery/api-client`
boundary deliberately does **not** export it — the gate asserts that absence, and
a regression proves the gate refuses the export. `APP3-A03-C1` brings it across
after B03B acceptance. No Figma node was touched.

## M. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=design-template-scope-assign` | **50 passed**, 2 suites (34 focused + 16 integration) |
| `pnpm --filter @embroidery/api exec jest` (design + openapi unit specs) | **340 passed**, 16 suites |
| `node tools/check-app3-b03b.mjs` | pass — **80 assertions** |
| `node --test tools/check-app3-b03b.test.mjs` | **28 passed** |
| every `tools/check-app3-*.mjs` (45 gates) | pass |
| regressions for every gate edited (`a02`, `a03`, `b02a`, `b04`, `b01n`) | 22 / 53 / 34 / 40 / 34 — all pass |
| `pnpm --filter @embroidery/api typecheck` · `build` | pass |
| `pnpm --filter @embroidery/api openapi:check` | artifact up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date (`96c3a6a5…`) |
| `pnpm --filter @embroidery/api-client typecheck` · `test` | pass · 44 passed |
| `pnpm lint` | 24/24 workspaces |
| `pnpm format:check` · `git diff --check` | clean · clean |

Not run, per §20: `pnpm quality`, frontend suites, worker, full E2E, Figma.

**Prettier reformatted gate files twice**, and both times every gate and every
regression suite was re-run afterwards — a reformat silently invalidates string
anchors, which `APP3-A02` learned the hard way.

## N. Surface

| Fact | Entry | Exit |
|---|---|---|
| Paths | 32 | **33** |
| Operations | 37 | **38** |
| Schemas | 81 | **82** (the request body; the response reuses B03's detail) |
| Migrations | 34 | 34 |
| Root scripts | 30 | 30 |

## O. Follow-ups

| Id | Status |
|---|---|
| `FU-APP3-TEMPLATE-SCOPE-EDIT-01` | **`PARTIALLY_RESOLVED_BY_APP3-B03B`** — initial assignment for an unscoped zero-version DRAFT delivered; general rescope after assignment or versioning not provided and not required by current APP3 |
| `FU-APP3-CONFLICT-CODE-CONTRACT-01` | `OPEN` — carried unchanged |
| `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` | `OPEN` — carried unchanged |
| `FU-APP3-DESIGN-FIXTURE-CODE-01` | `RESOLVED_BY_APP3-B03B` |
| `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` | **new** — `OPEN` |
| `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01` | **new** — `OPEN` |

**No claim of general scope editing is made anywhere**, and the gate asserts the
follow-up wording so the record cannot start making one.

## P. Disclosed deviation — file size

`admin-design-template.controller.ts` and `drizzle-design-template.repository.ts`
were already **455** and **494** lines at B03B entry, over CLAUDE.md §6's hard
maximum of 400. B03B added 68 and 69 lines, reaching 523 and 563.

Splitting them is a refactor across four checkpoints' surfaces
(B03/B03A/B03B/B04) and is not B03B's to make: the controller's "eight
operations, no ninth" listing is itself an asserted property, and the adapter
implements one port interface. The gate therefore binds the file B03B *created*
and separately requires the overrun to be **recorded** — a gate that fails on a
pre-existing condition the checkpoint may not fix is a gate that gets disabled.
`FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`.

## Q. Status

```text
APP3-B03B = COMPLETE — REVIEW_DELIVERED
APP3-A03  = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED
A03_CORRECTION_BLOCKER = WAITING_FOR_APP3_B03B_REVIEW_ACCEPTANCE
APP3-B04A = READY — NOT STARTED
```

`APP3-A03` is **not** marked accepted. `APP3-A03-C1` is not implemented, and
neither is `APP3-B04A` or `APP3-A04`.

After human acceptance of B03B:

```text
NEXT_REQUIRED_CHECKPOINT = APP3-A03-C1
```

Working tree clean. Nothing pushed.
