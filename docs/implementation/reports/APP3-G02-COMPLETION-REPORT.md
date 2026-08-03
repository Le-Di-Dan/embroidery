# APP3-G02 — Completion report

**Checkpoint:** `APP3-G02` — Design Template lifecycle and Product archive authority
**Verdict:** `COMPLETE — REVIEW_DELIVERED` · **Date:** 2026-08-03
**Branch:** `production` · **Entry HEAD:** `74b40f732446a1374a816701708c6b2382d94250`

---

## A. Verdict

Eight Product Owner rulings are locked as **IMP-D042**. The Design Template
lifecycle is formalised as **LC-24** with six stable transitions, and Product
LC-04 gains exactly one transition, `TR-LC04-06`, closing the inherited archive
follow-up.

**No application source, schema, migration, OpenAPI operation, generated client,
Figma node or UI was changed.** The gate asserts that absence rather than
assuming it.

## B. Entry state

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `74b40f732446a1374a816701708c6b2382d94250` — `docs(app3): record APP3-G01 evidence` |
| `origin/production` | `8b5f3b0279b1920babd05b52014af3b853f526c0` (unchanged, nothing pushed) |
| Tracked/staged tree at entry | clean |

Accepted entry authority: `APP3-G01 = COMPLETE — REVIEW_ACCEPTED`,
`APP3-G02 = READY — NOT STARTED`, `APP3 = IN PROGRESS — FIRST GATE
REVIEW_ACCEPTED`, and `G01_DB_DISPOSITION = REQUIRES_APP3_DB01` preserved.

Preflight: `check:app3-g01` PASS with 25/25 tests, `check:app2-closure` PASS,
`check:lifecycle` PASS, `pnpm quality` `EXIT 0`.

## C. The lifecycle contradiction, from repository evidence

| Evidence | Path / symbol | Finding |
|---|---|---|
| Template states | `packages/database/src/schema/design/design-templates.ts` | `DESIGN_TEMPLATE_STATES = ['DRAFT','PUBLISHED','ARCHIVED']`, CHECK-enforced |
| Template header | same | `status`, `current_version`, `archived_at`, nullable scope FKs |
| Template versions | `design-template-versions.ts` | `version` + **nullable** `published_at` |
| Publication fused | `apps/api/src/modules/design/infrastructure/persistence/drizzle-design-template.repository.ts` | `publishVersion` inserts a version **and** sets `status='PUBLISHED'` |
| Unpublish | same | **absent** |
| Restore / unarchive | same | **absent** |
| Archive guard | same | unconditional update from any source state |
| Transition ids | `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` | Design Template had **states but no `TR-` ids** (informal "Additional lifecycles" paragraph) |
| Product archive code | `apps/api/src/modules/catalog/domain/product-draft.policy.ts` | `PRODUCT_ARCHIVABLE_STATES = [PRODUCT_DRAFT_STATE]` |
| Product LC-04 | `DB3_LIFECYCLE_SPECIFICATIONS.md` | `TR-LC04-01..05`; archive authorised **only** from `PUBLISHED` |
| Template scope | `design_templates` | nullable `product_id` / `product_side_id` / `embroidery_area_id`; **no** M:N relation |
| OpenAPI | `packages/contracts/openapi/openapi.generated.json` | 16 paths, **zero** Template operations |

A state being storable is not a transition being authorised — the same finding
that produced `APP2-B03-G01`, now closed for both lifecycles.

## D. Allocated identifiers

| Identifier | Value | How chosen |
|---|---|---|
| Template lifecycle | **`LC-24`** | next free after `LC-01…LC-23`, verified across DB0/DB3 |
| Template transitions | **`TR-LC24-01…06`** | new, stable |
| Product archive-from-draft | **`TR-LC04-06`** | next free after `TR-LC04-01…05`; **no existing id renumbered** |
| Decision | **`IMP-D042`** | verified free before editing (highest was `IMP-D041`) |

## E. Template state and transition matrix (LC-24)

| TR | From→To | Reason required | Audit | Concurrency |
|---|---|---|---|---|
| `TR-LC24-01` | (nonexistent)→`DRAFT` | no | yes | — |
| `TR-LC24-02` | `DRAFT`→`PUBLISHED` | no | yes | token |
| `TR-LC24-03` | `PUBLISHED`→`DRAFT` | no | yes | token |
| `TR-LC24-04` | `DRAFT`→`ARCHIVED` | **yes** | yes R | token |
| `TR-LC24-05` | `PUBLISHED`→`ARCHIVED` | **yes** | yes R | token |
| `TR-LC24-06` | `ARCHIVED`→`DRAFT` | **yes** | yes R | token |

`DRAFT` is the only editable state. There is **no** direct
`ARCHIVED → PUBLISHED` — restore lands in `DRAFT` and republication is the
separate guarded `TR-LC24-02`. There is **no hard delete in APP3**. Archive and
unpublish are distinct and must never be one command. An invalid source state
fails **without mutation**; status mutation, Audit evidence and any future
Outbox consequence are atomic. This gate implements no Audit or Outbox source.

## F. Version, publication and clone semantics

Versions are **immutable from creation**. While the header is `DRAFT`, every
successful save creates a new version with the next monotonic number; the
*current draft version* is the highest version belonging to the Template.
Publish selects it, validates it, sets `published_at` **once** if still null, and
flips the header atomically. Once set, `published_at` is **never cleared or
rewritten** — unpublish changes the header only and preserves every version.
Editing after unpublish creates a new immutable version. Public read while
`PUBLISHED` selects the **highest version whose `published_at` is not null**.

Clone copies a published version into a deep independent working Design Session
document, persisting source Template and source Template Version **only** as
lineage/audit. Later unpublish, archive, restore or new versions never mutate an
existing clone. No customer export or download is created.

Publish and republish require the full **GRD-T01** set: header `DRAFT`; ≥1
immutable version; current highest version valid under `design-document`;
complete and active scope chain; document in bounds for the exact Embroidery Area
under `design-engine`; all Template assets eligible under `APP3-G04`;
authenticated Admin; matching concurrency token. **No backend checkpoint may
implement a reduced publish guard.**

## G. APP3 compatibility scope

APP3 publishes **area-scoped Templates only**. A publishable header carries
`product_id`, a `product_side_id` belonging to it and an `embroidery_area_id`
belonging to that side, all three active under IMP-D041. Drafts may hold an
incomplete scope while being authored but cannot publish until the chain is
complete. Public compatibility is **exact triple equality**.

Global, product-wide, side-wide, wildcard, tag-based and many-to-many
compatibility are **not** APP3 scope. The nullable single-scope columns stay
future-ready and unchanged.

```text
G02_DB_CONTRIBUTION = NONE
```

The delivered schema already carries every column these rulings need, including
the **nullable `published_at`** that `TR-LC24-02` sets once and `TR-LC24-03` must
never clear. `APP3-DB01` still runs, but **only** because `APP3-G01` requires it
(`G01_DB_DISPOSITION = REQUIRES_APP3_DB01`).

## H. Product archive reconciliation (PO-08)

LC-04 gains exactly one transition:

```text
TR-LC04-06   DRAFT → ARCHIVED
```

`TR-LC04-01/02/03/04/05` are unchanged and **not renumbered**; LC-04 moves from
5 to 6 transitions and the completeness matrix moves with it. Archive is durable
catalog retirement and stays **distinct from unpublish** (`TR-LC04-05`); an
archived Product is never public; archive hard-deletes nothing — Product, Product
Media, Assets, derivatives, placement, Templates, Design Sessions and historical
records all persist, and `TR-LC04-03` remains the only delete path. A published
Template scoped to an archived Product becomes **derived-ineligible without any
cascading Template status mutation**; relist re-evaluates Product publication
readiness. Product archive UI stays outside this gate and no Product application
code was modified.

```text
FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 = COMPLETE — CLOSED_BY_APP3-G02
FU-APP2-PRODUCT-ARCHIVE-UI-01        = DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION
```

This authorises delivered behaviour rather than changing it — and the data shows
real rows already depended on it (§I).

## I. Existing-data measurement

Read-only against the migrated development database
(`embroidery-dev-postgres-1`, PostgreSQL 16.14, 33 migrations). **No insert,
update, delete or backfill.**

```sql
select
  (select count(*) from design_templates where status='DRAFT')            as tpl_draft,
  (select count(*) from design_templates where status='PUBLISHED')        as tpl_published,
  (select count(*) from design_templates where status='ARCHIVED')         as tpl_archived,
  (select count(*) from design_template_versions)                         as versions_total,
  (select count(*) from design_templates t
     where not exists (select 1 from design_template_versions v
                        where v.design_template_id=t.id))                 as tpl_no_versions,
  (select count(*) from design_templates t where t.status='DRAFT'
     and exists (select 1 from design_template_versions v
                  where v.design_template_id=t.id and v.version=t.current_version
                    and v.published_at is not null))                      as draft_with_published_latest,
  (select count(*) from design_templates t where t.status='PUBLISHED'
     and not exists (select 1 from design_template_versions v
                      where v.design_template_id=t.id
                        and v.published_at is not null))                  as published_no_published_version,
  (select count(*) from design_templates t where t.status='PUBLISHED'
     and (t.product_id is null or t.product_side_id is null
          or t.embroidery_area_id is null))                               as published_incomplete_scope,
  (select count(*) from (select design_template_id, version
                           from design_template_versions
                          group by 1,2 having count(*)>1) d)              as dup_version_numbers,
  (select count(*) from products where status='DRAFT')                    as prod_draft,
  (select count(*) from products where status='PUBLISHED')                as prod_published,
  (select count(*) from products where status='ARCHIVED')                 as prod_archived;
```

| Metric | Value |
|---|---|
| Templates `DRAFT` / `PUBLISHED` / `ARCHIVED` | 0 / 0 / 0 |
| Template versions | 0 |
| Templates with no versions | 0 |
| `DRAFT` templates whose latest version is already published | 0 |
| `PUBLISHED` templates with no published version | 0 |
| `PUBLISHED` templates with incomplete scope | 0 |
| Duplicate version numbers per template | 0 |
| Products `DRAFT` / `PUBLISHED` / `ARCHIVED` | 26 / **0** / **3** |

**The three archived Products are the evidence for PO-08.** No Product has ever
been published in this database, and the only implemented archive path is
`PRODUCT_ARCHIVABLE_STATES = [PRODUCT_DRAFT_STATE]` — so all three were archived
from `DRAFT`, the transition LC-04 did not authorise until `TR-LC04-06`. Real
rows already depended on it.

Zero Template rows means every LC-24 ruling is being locked before any data
exists to migrate — no backfill and no grandfathering are implied. This is a
development database and not a production catalog; `APP3-B04` will re-measure
against whatever environment is authoritative at implementation time.

## J. Dependency reconciliation

| Checkpoint | Status |
|---|---|
| `APP3-G01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-G03` | `READY — NOT STARTED` |
| `APP3-G04` | `NOT STARTED` |
| `APP3-P01` | `READY — NOT STARTED` |
| `APP3-P02` | `READY — NOT STARTED` |
| `APP3-DB01` | `REQUIRED — AWAITING_G04_CONTRIBUTION` |
| `APP3-B03` | `BLOCKED_BY_APP3_P01_AND_DB_DISPOSITION` |
| `APP3-B04` | `BLOCKED_BY_APP3_P01_APP3_P02_APP3_G04_AND_DB_DISPOSITION` |
| `APP3-B05` | `BLOCKED_BY_APP3_B04` |
| `APP3-D01` template lifecycle portion | `UNBLOCKED_BY_G02`, checkpoint not started |

`G01_DB_DISPOSITION = REQUIRES_APP3_DB01` and `G02_DB_CONTRIBUTION = NONE`. No
implementation checkpoint is marked complete.

## K. Changed files

Commit A — `227c87c8913f86d8c915f1c2f7f9eea71765436c`, 22 files:

```text
docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md   LC-24 (states, 6 transitions, guards, version/
                                                public-read/clone implications, DB4/DB7/DB8
                                                handoff, Mermaid); TR-LC04-06 + rationale;
                                                informal Template paragraph marked superseded
docs/database/DB3_COMPLETENESS_MATRIX.md        LC-04 5 TR → 6 TR; new LC-24 row
docs/database/DB0_LIFECYCLE_INVENTORY.md        LC-24 registered
docs/database/DB2_DESIGN_TEMPLATE_DECISION.md   deferred items closed (forward note)
docs/database/DB2_AGGREGATE_CATALOG.md          AGG-12 → LC-24 pointer
docs/database/DB3_STATE_DIAGRAMS.md             LC-24 diagram; LC-04 new edge
docs/database/DB3_DB4_HANDOFF.md                G02_DB_CONTRIBUTION = NONE evidence
docs/database/DB3_TEST_HANDOFF.md               LC-24 + TR-LC04-06 test obligations
docs/database/DB4_SNAPSHOT_AND_VERSIONING_MODEL.md   immutable-from-creation supersession
docs/database/DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md retention: no Template hard delete
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md  IMP-D042
docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md  §6.5 + status; §6.4.4 pointer
docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md     §G3 ruled; §N follow-up closed
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md            APP3 row
docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md        APP3-G02 pointer
docs/implementation/13-PHASE-SOURCE-MAP.md                      IMP-D042 as an APP3 source
tools/check-app3-g02.mjs                        NEW — 361 lines
tools/check-app3-g02-lifecycle.mjs              NEW — 58 lines
tools/check-app3-g02.test.mjs                   NEW — 302 lines
tools/check-lifecycle-consistency.mjs           asserts exactly one DRAFT → ARCHIVED
tools/check-lifecycle-consistency.test.mjs      count 5 → 6; two new regressions
package.json                                    check:app3-g02 registration + quality chain
```

No `apps/`, `packages/`, `spikes/`, `infrastructure/`, `docs/design/`, schema,
migration, OpenAPI artifact, generated client, lockfile or dependency change.
Repository source under `apps/**` and `packages/**` was read-only evidence.

No historical completion evidence was rewritten; supersession is recorded as
forward notes, and phase §6.4.4 keeps its frozen post-`APP3-G01` values (which
`check:app3-g01` asserts) with a pointer to §6.5.4.

## L. Gate behaviour

`pnpm check:app3-g02` recomputes rather than reads, split by responsibility into
`check-app3-g02.mjs` (invariants) and `check-app3-g02-lifecycle.mjs` (bounded
transition-table parsing, scoped to a single `## LC-nn` section so another
lifecycle's rows can never be counted). Read-only, no network, no database.

It validates: `IMP-D042` present exactly once, `LOCKED`, carrying all eight
rulings; the 30-row fact table exact; the 12-row dependency table exact; LC-24
declaring exactly the six ruled transitions with no direct
`ARCHIVED → PUBLISHED` and no delete transition; LC-04 keeping exactly one
archive-from-draft, one archive-from-published and one unpublish, all distinct,
totalling 6; **the code/authority contradiction directly** — if
`PRODUCT_ARCHIVABLE_STATES` still contains `DRAFT` while LC-04 authorises no
`DRAFT → ARCHIVED`, it names `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`; the schema
still carrying `status`, `DESIGN_TEMPLATE_STATES`, `current_version`,
`archived_at`, `version` and a **nullable** `published_at`; **no Template
operation in the committed OpenAPI**; and `APP3-G01` still passing, so a G01
regression propagates.

`check:lifecycle` gains one assertion — exactly one `DRAFT → ARCHIVED` — without
weakening its existing unpublish and archive checks.

**One checker defect its own tests caught before delivery:** the schema check
looked for a literal `'status'` column, but `design-templates.ts` declares it
through the shared `stateColumn()` primitive, so the check would have failed
against a perfectly correct repository. It now matches the declaration and the
`DESIGN_TEMPLATE_STATES` set.

## M. Test matrix

`node --test tools/check-app3-g02.test.mjs` — **26/26 pass**, 302 lines (one
file; the pre-authorized second test file was not needed).

| Group | Cases |
|---|---|
| Baseline | repository passes; every fact and dependency row parses |
| Template lifecycle weakened | missing transition; direct `ARCHIVED → PUBLISHED`; `DRAFT` not the only editable state; hard-delete transition; hard delete declared in facts; publish fused with version creation; mutable versions; unpublish clearing `published_at`; public read choosing an unpublished version; clone left a live reference; wildcard compatibility; many-to-many authorised; G02 claiming a migration |
| Product archive undone | `DRAFT → ARCHIVED` removed (and the follow-up named); archive conflated with unpublish; `PUBLISHED → ARCHIVED` removed; transition-count drift; follow-up left open; archive-UI follow-up falsely closed |
| Authority / repository moves | decision missing; duplicated; missing a ruling; **Template operation appearing in OpenAPI**; `published_at` becoming `NOT NULL`; APP3-G01 regression propagating |

`node --test tools/check-lifecycle-consistency.test.mjs` — **11/11 pass** (was
9): three count-bound cases moved 5 → 6, plus `LC-04 must keep exactly one
DRAFT → ARCHIVED` and `archive from DRAFT does not count as an unpublish`. No
existing assertion was weakened.

## N. Validation

Every command run on `production`.

| Command | Result |
|---|---|
| `pnpm check:app3-g01` | PASS |
| `node --test tools/check-app3-g01.test.mjs` | 25/25 pass |
| `pnpm check:app3-g02` | **PASS** — `LC-24 with 6 transitions, no direct ARCHIVED → PUBLISHED, no hard delete; LC-04 = 6 with archive distinct from unpublish; G02_DB_CONTRIBUTION = NONE; no Template operation exists` |
| `node --test tools/check-app3-g02.test.mjs` | **26/26 pass** |
| `pnpm check:lifecycle` | **PASS** — `LC-04: 6 transitions, exactly one PUBLISHED → DRAFT unpublish, archive distinct from both DRAFT and PUBLISHED` |
| `node --test tools/check-lifecycle-consistency.test.mjs` | **11/11 pass** |
| `pnpm check:app2-closure` | PASS |
| `node --test tools/check-app2-closure.test.mjs` | 40/40 pass |
| `node --test tools/check-app2-closure-chronology.test.mjs` | 12/12 pass |
| `pnpm check:secrets` | PASS — 373 documents, 1827 tracked files |
| `pnpm check:openapi` | PASS — artifact up to date |
| `pnpm check:api-client` | PASS — tree hash `7524fc91…8ecf5a2` |
| `pnpm check:figma-design-index` | PASS — 96 / 96 / 13 |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 pass |
| `pnpm db:check:manifest` | PASS — 78 tables / 833 columns / 211 indexes |
| `pnpm check:spike-boundaries` | PASS |
| `pnpm spike:editor:check` | PASS |
| `node tools/check-file-size.mjs` | PASS — 0 hard-limit violations (361 / 58 / 302 / 212 / 141) |
| `pnpm quality` | **`EXIT 0`** |
| `git diff --check` | clean |

## O. Commits

```text
Commit A: 227c87c8913f86d8c915f1c2f7f9eea71765436c
          docs(app3): lock template lifecycle authority

Commit B: docs(app3): record APP3-G02 evidence
```

Commit B's own hash is not recorded here — this report ships inside it. Resolve
it with `git log -1 --format=%H`. No prior commit was amended, squashed, rebased
or rewritten.

## P. Final statuses

```text
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_DELIVERED
APP3     = IN PROGRESS — SECOND GATE DELIVERED_FOR_REVIEW
APP3-G03 = READY — NOT STARTED
```

Human review owns `APP3-G02 = REVIEW_ACCEPTED`.

## Q. Scope confirmation

Working tree clean after Commit B. `evidences/` is git-ignored and untouched.
**Nothing was pushed** — `origin/production` remains at `8b5f3b0…`.

**No Template API, Product archive code, database migration, generated contract,
Figma node, Admin UI, Storefront UI, worker job or package foundation was
implemented.** `APP3-G03`, `APP3-P01`, `APP3-P02`, `APP3-DB01`, `APP3-B03`,
`APP3-B04` and `APP3-D01` were **not** started, and no execution prompt was
written for any of them.
