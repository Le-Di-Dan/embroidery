# APP3-B04 — Design Template lifecycle — completion report

| | |
| --- | --- |
| Checkpoint | `APP3-B04` — Design Template publish / unpublish / archive |
| Phase | `APP3` — Design Templates and 2D Studio |
| Status | `COMPLETE — REVIEW_DELIVERED` |
| Entry commit | `86d0458` (`docs(app3): record APP3-B03A evidence`) |
| Implementation commit | `f17a280` (`feat(api): add Design Template lifecycle`) |
| Branch | `production` (not pushed) |
| Execution mode | `DECISIVE_FINISH_MODE` |
| Operations delivered | 3 (`adminDesignTemplate_publish`, `_unpublish`, `_archive`) |
| Migration | none — 34 before, 34 after |

---

## 1. What was delivered

Four of the six `LC-24` transitions, across three HTTP operations:

| Transition | Route | From → to |
| --- | --- | --- |
| `TR-LC24-02` | `POST /api/admin/design-templates/{templateId}/publish` | `DRAFT` → `PUBLISHED` |
| `TR-LC24-03` | `POST /api/admin/design-templates/{templateId}/unpublish` | `PUBLISHED` → `DRAFT` |
| `TR-LC24-04` | `POST /api/admin/design-templates/{templateId}/archive` | `DRAFT` → `ARCHIVED` |
| `TR-LC24-05` | same route | `PUBLISHED` → `ARCHIVED` |

`TR-LC24-06` (restore, `ARCHIVED` → `DRAFT`) is **not** here. It is routed to the
one-operation `APP3-B04A` by `B04_LIFECYCLE_ROUTING_RULING = RESTORE_SPLIT_TO_APP3_B04A`,
which is what kept this checkpoint at the three operations `IMP-D044` PO-09 allows
instead of stopping on a fourth. Its absence is asserted by the gate, by both API
contract specs and by the client contract, in the published artifact and in the
controller source — so it cannot arrive by accident.

### Files

New:

- `apps/api/src/modules/design/application/template-publication.authority.ts` — the whole `GRD-T01` guard, read-only
- `apps/api/src/modules/design/application/design-template-lifecycle.use-case.ts` — the three transitions
- `apps/api/src/modules/design/design-template-lifecycle.spec.ts` — 32 focused tests
- `apps/api/test/integration/design-template-lifecycle.integration.spec.ts` — 21 live-database tests
- `tools/check-app3-b04.mjs`, `tools/check-app3-b04.test.mjs` — the gate and its 40 regressions

Changed: the Template repository port and its Drizzle adapter, the draft error
vocabulary, the audit recorder, the request schemas, the Admin controller, the
module wiring, the phase plan, the scoped command index and three cross-phase
documents. Predecessor gates and specs are covered in §5.

---

## 2. The rules this checkpoint had to get right

### 2.1 The publish guard is complete, not reduced

`IMP-D042` PO-07 says *no backend checkpoint may implement a reduced publish
guard*. `GRD-T01` is therefore composed in full, in this order, and refuses with
a named reason:

| Refusal | Cause |
| --- | --- |
| `NO_IMMUTABLE_VERSION` | nothing to publish — `current_version` is 0 |
| `SCOPE_INCOMPLETE` | the product/side/area triple is not fully set |
| `DOCUMENT_INVALID` | `APP3-P01` refuses the stored document |
| `SCOPE_UNRESOLVED` | the Side is retired, or the Area hangs from a different Side |
| `PLACEMENT_MISMATCH` | `APP3-P02` `validatePlacementSnapshot(…, 'NEW_EDITING')` disagrees |
| `OUT_OF_BOUNDS` | `validateDocumentWithinEmbroideryArea` puts geometry outside the area |
| `MEDIA_INELIGIBLE` | a referenced Asset is not `NORMALIZED`/`READY` |

Two properties are worth stating explicitly because they are invisible in a
passing test:

- **The guard never writes.** A guard that repairs is not a guard: it would turn
  an unpublishable template into a published one and destroy the operator's
  ability to see why it was refused. The gate asserts the authority contains no
  `update`/`insert`/`delete` call at all.
- **`NEW_EDITING`, not `HISTORICAL_RENDER`.** The laxer mode exists so an already
  approved historical document still renders; using it here would let a new
  publish inherit tolerances meant for the past. The gate pins the literal.

The guard runs **before** the transaction opens, so a refusal costs no lock.

### 2.2 A stale token and a wrong source state are one refusal

Each transition is a single `UPDATE … WHERE id = ? AND status IN (…) AND
current_version = ?` with the expected value **in the predicate**. There is no
read-then-write window anywhere in the lifecycle. When the update changes no row
the adapter distinguishes "no such template" from "someone else moved it first",
and the use case translates the guard violation into
`DESIGN_TEMPLATE_VERSION_CONFLICT` → `409`.

That translation is not incidental. `APP3-B06B-C1` recorded a defect where an
error that was not an `HttpException` surfaced as a `500` against a published
`409`; this checkpoint wires the translation from the start, and the gate asserts
it rather than assuming it.

### 2.3 `published_at` is stamped by a predicate, not a branch

```sql
UPDATE design_template_versions SET published_at = ?
WHERE design_template_id = ? AND version = ? AND published_at IS NULL
```

`IMP-D042` PO-04 says set once, never cleared, never rewritten. Expressed as an
`IS NULL` predicate rather than a read-and-branch, a concurrent republish cannot
slip between the read and the write. A template published, unpublished and
published again keeps its **original** timestamp — proved live in §3.2, which is
the only place that proof can exist.

---

## 3. Evidence

Every command below was run on the implementation commit's tree. Commands are
indexed in `SCOPED_COMMAND_INDEX.md` as `CMD-CHECK-APP3-B04`,
`CMD-TEST-APP3-B04`, `CMD-TEST-APP3-B04-API` and `CMD-TEST-APP3-B04-INTEGRATION`.

### 3.1 Focused and gate suites

| Command | Result |
| --- | --- |
| `node tools/check-app3-b04.mjs` | exit 0 |
| `node --test tools/check-app3-b04.test.mjs` | 40/40 |
| `node --test tools/check-app3-b03.test.mjs` | 34/34 |
| `node --test tools/check-app3-b03a.test.mjs` | 40/40 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=design-template …` | 85/85 across 3 suites |

Full APP3 gate sweep, all exit 0: `b04 b03a b03 g01 g02 g03 g04 g05 g06 g07 db01
p01 p02 p03 b01n`.

### 3.2 Live PostgreSQL — 21/21

`CMD-TEST-APP3-B04-INTEGRATION` runs the whole HTTP stack against a disposable
database. Beyond the transition and guard cases it carries two proofs that only a
real database can give:

**Republication keeps the original timestamp.** Publish, unpublish, publish
again; assert `published_at` is unchanged. Against a read-and-branch
implementation this passes only by luck; against the `IS NULL` predicate it
passes by construction.

**Three race families**, each run in-process with real concurrent requests. The
assertion is the invariant, not a fixed pair of status codes: at least one
success, every response 200 or 409, the end state in the allowed set, and the
**delta** in audit rows equal to the number of successes.

Counting the delta rather than the absolute matters — the setup publishes, so an
absolute count is off by one before the race even starts. That is the same error
`APP3-B03` recorded, and it was made and caught again here.

> **Finding — `[200, 200]` on unpublish-versus-archive is correct.** The
> assertion initially demanded `[200, 409]` and got two successes. That is not a
> lost update: archive accepts `DRAFT` **and** `PUBLISHED`, so
> `PUBLISHED → DRAFT → ARCHIVED` is two valid transitions serialized, and the
> final state is legitimate. The expectation was wrong, not the implementation.
> Recorded in phase plan §6.26.3 so the next reader does not re-derive it.

### 3.3 Contract and repository-wide checks

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/api openapi:check` | up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date, tree `2ead0316…c433` |
| API typecheck (`tsc --noEmit`) | clean |
| `@embroidery/api-client` typecheck | clean |
| `pnpm lint` | 24/24 tasks |
| `pnpm format:check` | clean |
| `git diff --check` | clean |

Surface **26 → 29 paths / 31 → 34 operations / 73 → 76 schemas**. OpenAPI
generated once, client generated once. Migrations 34 → 34. Root scripts 30,
unchanged.

---

## 4. What this checkpoint did *not* do

- No migration, no schema change, no new column.
- No version created, no row deleted or hard-deleted. Archive is retention.
- No status cascaded into Product, Assets, Sessions or template versions.
- No outbox event — no accepted consumer contract exists for a lifecycle event,
  and inventing one would publish a contract nothing has agreed to.
- No `restore` route, use case, or `from: 'ARCHIVED'` transition.
- No install, no dependency change, no worktree, no junction or symlink.

---

## 5. Predecessor gates this checkpoint legitimately invalidated

`APP3-B03` and `APP3-B03A` had pinned the Admin Template **operation count** (3,
then 4) and the **guarded-write count** (1, then 2) as literals, and had listed
this checkpoint's three routes as forbidden. All three are correct statements
about the world before B04 and wrong after it.

Rather than relax them, both are re-derived from the shared surface authority.
`acceptedAdminTemplateOperationCount(rootDir)` sums the operations of the paths
each *accepted* checkpoint owns, so every checkpoint that adds a route moves the
count for all gates at once — and an operation no accepted checkpoint explains
still fails in every world. The lifecycle routes moved from a flat ban to a
mode-aware rule asserted in **both** directions: refused while B04 is unstarted,
**required** once it is accepted. Each gate's regression suite now proves both
worlds by rebuilding the undelivered phase status rather than by adding a route
to the real artifact — which after B04 proves nothing.

> **Finding — two predecessor rules had become satisfiable by this checkpoint's
> own code.** Both scanned the whole repository file:
>
> - B03's *"create writes a `DRAFT` header"* was satisfied by B04's **unpublish**,
>   which legitimately writes `status: 'DRAFT'`. Create could have started
>   templates in any state and the gate would have stayed green.
> - B03A's *"the save compares and sets on `current_version`"* was satisfied by
>   B04's shared `transition`, which carries the same predicate. The save could
>   have become a read-then-write and the gate would have stayed green.
>
> Both are now scoped to the method they actually rule. Neither was a live
> defect — both implementations are correct — but each gate had silently stopped
> being a gate, which the mutation tests exposed when the mutations stopped
> failing. This is the *mode-aware gate* pattern reappearing in a new form:
> a rule stated over a file rather than over its subject decays as the file grows.

The same file-scoped care applies to this checkpoint's own gate: prose is never
scanned for a word. Every rule asserts **usage** — a call, a decorator, a
predicate — because six earlier occurrences of word-scanning fired on comments
explaining why the thing was *not* done.

---

## 6. `ENGINEERING_JUDGMENT`

Recorded under `DECISIVE_FINISH_MODE`; none required an operator ruling.

1. **Concurrency token = `expectedCurrentVersion`**, per §5 hierarchy step 2. No
   canonical B04 authority names one; `APP3-B03A` established this token, and a
   source-state predicate plus counter compare-and-set gives a deterministic race
   outcome without a new column.
2. **`archive` was narrowed in place, not duplicated.** The port already had an
   unguarded `archive(id, at)` used by one older integration spec. Narrowing it
   to the guarded lifecycle shape keeps one archive seam; the single caller moved
   with it.
3. **Two new error codes joined the existing vocabulary** rather than a second
   error type: `DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED` (409 — a source state that
   forbids the transition, which the Admin resolves by reloading) and
   `DESIGN_TEMPLATE_PUBLISH_NOT_READY` (422 — the right state but not ready,
   resolved by fixing the template). One translation point, two distinct meanings.

---

## 7. Limitations and pre-existing failures

**Four API suites fail for reasons that pre-date this checkpoint**, none of them
touched by it (`git status` confirms all four are unmodified):

- `src/openapi/build-openapi-document.spec.ts` — pins `pathCount` at **19**
- `src/openapi/design-session-response.contract.spec.ts` — pins **23 paths**
- `src/platform/openapi/zod-dto-publication.contract.spec.ts` — pins **19 paths**
- `test/architecture/catalog-placement-boundary.spec.ts` — an `AssetModule`
  boundary assertion, unrelated to Templates

Proof they were already red at the entry commit: `86d0458`'s **committed**
artifact already published **26** paths, which no `toHaveLength(19)` or
`toHaveLength(23)` can satisfy. B04 moves the same number 26 → 29 without
changing their pass/fail state. They are out of this checkpoint's scope and
fixing them would be unrelated refactoring; they need an owner.

**`src/modules/design/tests/integration/design-template.integration.spec.ts`
could not be executed locally.** This checkpoint changed one call site in it
(`archive(id, at)` → the guarded command shape). The suite fails during Nest
module construction, before any test body, on a chain of missing local
configuration — `DESIGN_SESSION_SECRET_PEPPER`, then `OBJECT_STORAGE_PROVIDER`.
The failure is harness-wide, not file-specific: the untouched
`design-case.integration.spec.ts` on the same `persistence-test-context` fails
identically (22/22). The changed line is covered indirectly — it typechecks under
the API typecheck, and the same repository method is exercised live 21/21 by the
B04 integration suite. Running this suite needs the full dev stack and is left
for an environment that has it.

No credential was read, written, echoed or rotated. `.env` was handed to a
process via `--env-file` and never read out; the one synthetic value used for a
diagnostic run was a throwaway test string.

---

## 8. Forward state

```text
APP3-B04  = COMPLETE — REVIEW_DELIVERED
APP3-B04A = READY — NOT STARTED          (restore, 1 operation, TR-LC24-06)
APP3-B05  = READY — NOT STARTED          (recommended next)

NEXT_ELIGIBLE_IMPLEMENTATION_CHECKPOINTS = APP3-B05 APP3-B04A APP3-D01 APP3-B06C
NEXT_RECOMMENDED_IMPLEMENTATION_CHECKPOINT = APP3-B05
```

`APP3-B05` is recommended because B04 has finally given it something to read — a
template can now reach `PUBLISHED` — and it is the only remaining checkpoint on
the longest chain, `B05 → B05A → S01`. `APP3-B04A` and `APP3-B06C` are genuinely
ready and sit on shorter branches.

`FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` remains **open and unowned**: no
accepted API creates a `TEMPLATE_SOURCE` Asset, so a template carrying artwork
still cannot be authored end to end through the API. B04 does not close it and
does not depend on it — a text-only template publishes correctly.
