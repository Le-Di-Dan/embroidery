# APP3-B03A — Design Template draft document save

```text
APP3-B03A = COMPLETE — REVIEW_DELIVERED

B03A_TOOLING_MANUAL_INTERVENTION =
TWO_PRIOR_NOOP_INSTALLS + TARGETED_VIRTUAL_STORE_INVALIDATION_THEN_FROZEN_INSTALL
```

Commit A — `7d0efba4adae539b7b6a4e041123cb1c6532e930`
`feat(api): save Design Template draft versions`

## A. Entry state

| Fact | Value |
|---|---|
| HEAD at entry | `2ec2008` |
| `APP3-B03` | `COMPLETE — REVIEW_ACCEPTED` (recorded by this checkpoint) |
| surface at entry | 25 paths / 30 operations / 72 schemas |
| migrations / root scripts | 34 / 30 — unchanged at exit |
| B03A implementation | already in the working tree, uncommitted, typechecking clean |

The implementation was written before the tooling stop and was **preserved
throughout**: nothing was reset, stashed, cleaned, reverted or recreated.

## B. Toolchain damage chronology

The damage pre-dated `APP3-B03A`. During `APP3-B03` a detached worktree was given
a directory junction to the live `node_modules`; the later `rm -rf` of that
worktree followed the junction and emptied package directories inside the pnpm
**virtual store** (`node_modules/.pnpm/<entry>/node_modules/<pkg>`). The global
content-addressable store was never touched.

## C. Every repair command actually run

```text
1. pnpm install --frozen-lockfile          → "Already up to date", 300 ms, NOOP
2. pnpm install --frozen-lockfile --force  → "Already up to date", 282 ms, NOOP
3. rmdir the 7 known-empty virtual-store dirs
   pnpm install --frozen-lockfile          → "Already up to date", NOOP
4. rm node_modules/.modules.yaml
   pnpm install --frozen-lockfile          → "Already up to date", NOOP
5. rm node_modules/.pnpm-workspace-state-v1.json
   pnpm install --frozen-lockfile          → Packages: +7   ✅
6. rmdir 1 further empty scoped dir (@angular-devkit/schematics)
   rm node_modules/.pnpm-workspace-state-v1.json
   pnpm install --frozen-lockfile          → Packages: +1   ✅
7. pnpm --filter @embroidery/api exec nest --version → 11.0.24, exit 0
```

**Do not read this as "no install was run" or "nothing forbidden was run".** Six
install invocations ran across three operator rulings; two of them repaired
something. What is true is that **no dependency-changing install ran**.

## D. The exact repair step that succeeded

Step 5, and the diagnosis behind it is the reusable part. pnpm decides what to
install from recorded module state, not from package contents. The emptied
directories still *existed*, so both `--frozen-lockfile` and `--force`
short-circuited in under 300 ms without reading a single package directory —
`--force` forces *resolution*, not re-extraction of a virtual-store directory
pnpm already believes is correct.

Deleting `.modules.yaml` was not enough either. The marker that actually gates
this in pnpm 11 is **`node_modules/.pnpm-workspace-state-v1.json`**; removing it
made the very next frozen install re-link all seven packages from the intact
global store, offline, in 3.5 s.

Step 6 was needed because my original seven-package inventory was **incomplete**:
the scan that produced it did not descend into `@scope/` directories, so
`@angular-devkit/schematics` was missed and surfaced as the next missing module.
A corrected full scan found exactly one more.

**One earlier diagnosis was wrong and worth recording.** Three consecutive probes
contradicted each other — store fine, 925 entries fine, one entry gutted —
because an earlier `cd` into `node_modules/.pnpm/@nestjs+cli.../node_modules`
persisted across Bash calls and every relative path after it resolved inside that
directory. `SHELL_CWD_DISCIPLINE = ABSOLUTE_REPOSITORY_BASE_USED_FOR_ALL_REPAIR_PROBES`
was adopted and every probe in this checkpoint uses an absolute base.

## E. Lockfile / manifest / source-diff integrity

Captured before each repair and re-checked after:

```text
pnpm-lock.yaml            f4e65240d5117c3d   unchanged across all six installs
package.json              e066614d86d6d265   unchanged
apps/api                  a7f09ac0507ce5be   unchanged
packages/api-client       6037ab55d258ef64   unchanged
packages/design-document  1ffb838745696a22   unchanged
packages/design-engine    61b59f24d957804e   unchanged
packages/persistence      ac28895ab4cac4ac   unchanged
packages/database         edd930056af4b08b   unchanged
packages/domain-types     637d477209496e90   unchanged

tracked B03A source diff  9 files, +393/-13, byte-identical before and after
dependency added/updated  none
`git status` for lockfile and every package.json   empty
```

## F. The B03A contract

| Method | Route | `operationId` |
|---|---|---|
| `PUT` | `/api/admin/design-templates/{templateId}/document` | `adminDesignTemplate_saveDocument` |

```jsonc
{ "expectedCurrentVersion": 0, "document": { /* full DesignDocument */ } }
```

A **full snapshot**, never a patch: a version is immutable from creation, so a
patch would have to be applied against a version the server reconstructs, and two
clients patching the same base would silently merge instead of conflicting.

`expectedCurrentVersion = 0` is the ordinary first save, because `APP3-B03`
creates a header with no version at all. The server derives the next number; a
caller that could choose it could overwrite an immutable version. The body
accepts nothing else — no `version`, `publishedAt`, `status`,
`documentSchemaVersion`, `templateId` or association id.

Errors: `400` invalid body, `404` unknown template, `409` stale
`expectedCurrentVersion` **or** a non-`DRAFT` template, `422` a document `APP3-P01`
refuses. The two conflict causes share one code deliberately: a caller learning
"not DRAFT" separately from "counter moved" learns the template's lifecycle state
from a save it was not allowed to make.

## G. The P01 / P02 boundary

`TemplateDocumentAuthority` composes `readSchemaVersion` →
`prepareDesignDocument` → `validateDesignDocumentContext`, and **nothing else**.
It is a separate authority from `DesignDocumentAuthority.validateForSave`, which a
Session save uses, for two reasons — and the second is binding:

- a draft may legitimately hold **no scope at all** (`IMP-D042` PO-06), so there
  is frequently no Side or Area to validate a placement snapshot against;
- placement agreement and containment are `GRD-T01`, which PO-07 assigns to
  `APP3-B04` with *"no backend checkpoint may implement a reduced publish
  guard"*. That cuts both ways: implementing part of it here would be a second,
  weaker definition of publishable.

**So a draft may be saved out of bounds.** That is what a draft is for, and
`APP3-B04` refuses to publish it. The gate asserts `@embroidery/design-engine`
is not imported by either file.

## H. The repository CAS seam

`saveDraftVersion` is a new port method rather than a widened `publishVersion`:
that method writes a version **and publishes it**, setting the header to
`PUBLISHED`, and making it sometimes not do that would make one method mean two
things.

```ts
UPDATE design_templates
   SET current_version = :next
 WHERE id = :id AND status = 'DRAFT' AND current_version = :expected
RETURNING id
```

The expected value is **in the predicate**, not read first. Both racing saves
reach the `UPDATE`; Postgres serialises them on the row lock and exactly one
matches. The counter moves *before* the version row is inserted, so the loser is
rejected without either statement having written a version — and the unique
`(design_template_id, version)` stays a second, independent guard rather than the
primary one, because relying on it would mean discovering the conflict as a
constraint violation after doing the work.

A zero-row update raises `STALE_WRITE`, which the use case translates to the
published `409`. Untranslated it would surface as a **500 against a published
409** — the exact `APP3-B06B-C1` defect, wired correctly from the start here and
covered by its own test.

## I. Immutable version behaviour

`version = expectedCurrentVersion + 1`, `published_at = null`, prior versions
never touched. Proved live: 1 → 2 → 3 with version 1 still holding what version 1
was saved with.

## J. Template Asset associations

`design_template_assets` is `(id, design_template_id, asset_id)` with a unique on
the pair and **no active/retired flag**, so "changed to another Asset" is add +
remove and the rule reduces to **one event per newly inserted row**.

Associations are **additive and provenance-preserving**: a later save that drops
an image does not remove the association, because an older immutable version may
still reference that Asset and removing it would break that version's provenance.
Proved live.

`created` comes from `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`, never a
prior existence read — two saves naming the same new Asset would both see it
absent and both insert, and exactly one row must exist with exactly one event
behind it.

## K. G06 normalization production

```text
eventType                  asset.normalization.requested
aggregateKind / aggregateId  ASSET / assetId
schemaVersion              1
normalizationPolicyVersion 1
associationRef             { kind: 'DESIGN_TEMPLATE_ASSET', designTemplateAssetId }
```

Ordering is association insert → append → commit, all inside one transaction:
`APP3-G06` recorded that an event appended before the association that defines its
work cannot carry its context. The payload is built by the shared
`buildAssetNormalizationRequestedPayload`, so a producer cannot announce a schema
it is not compiled against.

`check-app3-g06.mjs`'s code-level allowlist gained the three B03A files **by
name**, gated on `APP3-B03A = COMPLETE`. Its event invariants are untouched.

## L. CAS race evidence

Ten iterations in one invocation, two writers per iteration with the same
`expectedCurrentVersion` and different documents. Every iteration asserted:
statuses `[200, 409]`; `current_version` advanced exactly once; exactly one row at
the new version; the persisted document equal to the **winner's** whole document.
After ten iterations: ten version rows and ten audit rows — the loser never added
either.

## M. PostgreSQL integration evidence

14 tests on a disposable database, whole HTTP stack, no MinIO (B03A performs no
object-storage I/O): first save, canonical persistence proved by a value
quantization moves, audit row, sequential 1→2→3 with earlier immutability, stale
`409` writing nothing, non-`DRAFT` refusal, unknown template, malformed document,
association + exactly one event, no second event on re-save, association survives
an image being dropped, a `CUSTOMER_UPLOAD` asset refused with nothing written,
the race, and authorization/privacy.

## N. OpenAPI / client surface

```text
25 / 30 / 72   →   26 paths / 31 operations / 73 schemas

OpenAPI SHA-256          42caeba94149a51b2cb437670093a8435d263e0bf0bbfa35c514229fdaef3bf1
generated client tree    f5097275272ada16c47d99ef8fa6be113170b4464d305cdc44d70c737867956e
```

Generation succeeded on the **first** post-repair attempt; the fresh slot allowed
three. The request body publishes `document` as
`allOf: [$ref: '#/components/schemas/DesignDocument']` through the `APP3-B08-C1`
marker, so there is still exactly one structural definition of a Design Document.
`AdminDesignTemplateSaveDocument200` generates as
`ApiSuccessResponse & { data: AdminDesignTemplateDetailResponse }` — not `void`,
not an open map — and the save reuses B03's detail projection rather than
introducing a competing snapshot shape.

## O. Checker and gate reconciliation

New gate `tools/check-app3-b03a.mjs` (421 lines) with 39 checker tests.

`APP3-B03`'s gate and spec carried three proxies this checkpoint legitimately
invalidates — the Admin Template operation count, `…/document` as a forbidden
route, and "exactly one guarded write". All three are now **mode-aware** on
`isB03ADelivered`, and both directions are asserted: the delivered world by the
suite's accept-the-real-artifact case, the undelivered world by a case that
rebuilds a phase where B03A is unstarted and proves the save is still refused
there. A gate made mode-aware that only proves one direction has been loosened,
not corrected.

The accepted-surface authority gained a B03A world (26/31/73) above B03's, and
`check-app3-b01n-artifacts.mjs` a B03A digest world. **B03's 25/30/72 world and
its digests are unchanged** — every historical world still proves its own
artifact.

Two of my own gate rules were too broad on first run and were narrowed rather
than accommodated: `publishVersion was widened to a nullable publishedAt` matched
the *read model*, where `publishedAt` is legitimately optional because a draft
version genuinely has none; and the provider check matched the module's import
line rather than its `providers` array, so it would have passed for a class Nest
never instantiates. Both now scope to the construct they rule.

## P. TEMPLATE_SOURCE follow-up

```text
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED
```

`INTAKE_ASSET_KIND` is `CATALOG_MEDIA`, and the only other reference to
`TEMPLATE_SOURCE` is the worker's profile map. **No accepted API or workflow
creates a `TEMPLATE_SOURCE` Asset.**

- Text-only Template authoring is **production-reachable** today.
- Template image save semantics are **implemented**, and proved against canonical
  seeded `TEMPLATE_SOURCE` fixtures in the live suite.
- **Production creation of a `TEMPLATE_SOURCE` Asset remains an explicit
  downstream gap.** Production Template *image* authoring is blocked by it.

B03A invented no upload endpoint, asset-kind registration, storage lane, picker
UI or worker behaviour. The gap is **not closed** by a fixture being able to seed
the row, and its owner must be assigned by roadmap review before any checkpoint
that promises production Template image authoring.

## Q. Command ledger

| Command | Runs | Terminal result |
|---|---|---|
| preflight / authority audit | 1 | entry state matched |
| `nest --version` health proof | 1 | `11.0.24`, exit 0 |
| API typecheck | 4 | clean |
| `CMD-TEST-APP3-B03A-API` | 3 | 22 / 22 |
| `CMD-TEST-APP3-B03A-INTEGRATION` | 1 | **14 / 14**, incl. the race |
| `CMD-TEST-APP3-B03-API` (regressions) | 3 | 31 / 31 |
| `CMD-CHECK-APP3-B03A` | 3 | exit 0 |
| `CMD-TEST-APP3-B03A` | 2 | 39 / 39 |
| `CMD-CHECK-APP3-B03` / `CMD-TEST-APP3-B03` | 3 / 2 | exit 0 · 33 / 33 |
| gates `g06 g02 p01 db01 p03 b01n b08 b07` | 1 each | exit 0 |
| OpenAPI generate / check | 1 / 1 | 26/31/73 · current |
| client generate / check / typecheck / test | 1 / 1 / 1 / 1 | current · clean · 44 / 44 |
| `pnpm lint` | 3 | clean |
| `pnpm format:check` | 3 | clean |
| `git diff --check` | 1 | clean |

Nothing forbidden by §15 was run after the repair: no further install, no
`pnpm quality`, no full API suite, no repository integration sweep, no worker,
frontend or E2E suite.

## R. Budget deviations

```text
BUDGET_DEVIATION = API typecheck        planned 3   actual 4
  reason: one extra after the toolchain repair, to confirm the environment
          rather than the code, before spending the generation slot.

BUDGET_DEVIATION = repair installs      planned 1   actual 4 (this ruling)
  reason: the escalation ladder R1 -> R2 -> R2b -> R2c, each a no-op or a
          partial, ending in the two that worked. No third *ruling* was
          requested, which is what decisive mode asked for.

BUDGET_DEVIATION = B03 checker + tests  planned 0   actual 3 + 2
  reason: B03's own gate and spec had to become mode-aware once B03A delivered
          the fourth operation. §12 authorizes this explicitly.
```

## S. Changed files

Commit A: 29 paths. New — `template-document.authority.ts`,
`template-document-media.authority.ts`, `save-template-document.use-case.ts`,
`design-template-save.spec.ts`, `design-template-save.integration.spec.ts`,
`check-app3-b03a.mjs`, `check-app3-b03a.test.mjs`. Modified — the Template
repository port and Drizzle adapter, the error contract, the audit recorder, the
request schema, the controller, the Admin module, `app3-accepted-surface.mjs`,
`check-app3-b01n-artifacts.mjs`, `check-app3-g06.mjs`, `check-app3-b03.mjs` and
its test, `design-template-admin.spec.ts`, the four canonical docs, the command
index, and the two generated artifacts.

## Disclosed pre-existing failure

`check-app3-g06.test.mjs` — 45 / 46. The case *"rejects closing the platform
Zod/OpenAPI follow-up here"* mutates
`FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_…`, a string the phase
has not contained since `APP3-P03` closed that follow-up. Proved pre-existing:
`git show 2ec2008:…` contains zero occurrences of the needle, so the mutation was
already a no-op at the entry commit. Not fixed — it belongs to `APP3-G06`'s gate
tests and is unrelated to this checkpoint. Recorded as `PREEXISTING`, alongside
the four suites baselined at `APP3-B03` (`b01` 37/40, `g08` 51/56, `w01b` 37/39,
`b01n` 33/34).

## T. Forward state

```text
APP3-B03  = COMPLETE — REVIEW_ACCEPTED
APP3-B03A = COMPLETE — REVIEW_DELIVERED
APP3-B04  = READY — NOT STARTED
APP3-B05  = BLOCKED_BY_APP3-B04
APP3-B05A = BLOCKED_BY_APP3-B04_AND_APP3-B05
APP3-D01  = READY — NOT STARTED
APP3-B06C = READY — NOT STARTED
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED

NEXT_ELIGIBLE_IMPLEMENTATION_CHECKPOINTS = APP3-B04 APP3-D01 APP3-B06C
NEXT_RECOMMENDED_IMPLEMENTATION_CHECKPOINT = APP3-B04
NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS = NONE
```

`APP3-B04` is derived from the reconciled roadmap, not chosen: `IMP-D042` PO-07
requires at least one immutable version before a publish, `APP3-B03A` has now
provided it, and B04 is the only remaining checkpoint on the longest chain
(`B04 → B05 → B05A → S01`). It is not started here.

`APP3-A02` and `APP3-A03` remain blocked by `APP3-D01` even though their backend
dependencies are delivered.

## U. Tree

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed.
