# APP3-B04A — Design Template Restore · Completion Report

`TR-LC24-06`, one HTTP operation, JIT backend immediately before `APP3-A04`.

**Status:** `COMPLETE — REVIEW_DELIVERED`. Commit A `1575dcc`. Nothing pushed.

---

## A · Entry state

`APP3-A03` and `APP3-A03-C1` were recorded `COMPLETE — REVIEW_ACCEPTED` at
entry: the ordinary Admin journey — create an unscoped DRAFT in A02, assign its
initial scope in A03, author, save v1 — now works end to end, so A03 was not
reopened.

Measured, not transcribed: 33 paths / 38 operations / 82 schemas, 34 migrations,
30 root scripts. `APP3-B04A` was `READY — NOT STARTED` with its route and
operation id already locked by `B04_LIFECYCLE_ROUTING_RULING`.

## B · The exact contract

```
POST /api/admin/design-templates/{templateId}/restore
     adminDesignTemplate_restore
     { expectedCurrentVersion, reason }  → AdminDesignTemplateDetailResponse
```

One verb on the path. `expectedCurrentVersion` is `APP3-B04`'s token, not a
second one; `reason` is trimmed, non-empty and bounded by the same 500-character
constant archive uses, because `IMP-D042` PO-03 requires one for archive and
restore and for neither of the other two. The schema is `.strict()` and accepts
nothing the server owns — in particular **no target status**, because a body
that could name one could ask for the `ARCHIVED → PUBLISHED` that LC-24 refuses
outright.

The restore body is its own schema rather than archive's under a second name:
the two are separate published contracts and one changing must not silently
change the other. They share the bound, so they cannot drift apart either.

## C · `ARCHIVED → DRAFT`

`ARCHIVED` is the sole admissible source, expressed in the compare-and-set
predicate rather than checked and then written, so `ARCHIVED → PUBLISHED` is
**unrepresentable** here rather than merely unimplemented. A `DRAFT` or
`PUBLISHED` template is refused with a conflict and nothing written.

Republication after restore stays `TR-LC24-02` and re-runs the whole GRD-T01
guard. Proved live: restore, then publish, then the public read answers 200.

## D · `archived_at`

Cleared. DB3 `LC-24` defines `TR-LC24-06` as *"header, clears `archived_at`"*,
and `ADR-DB1-006` classes the column as the soft-delete/archive **marker** — a
current-state fact, not a historical record. A restored `DRAFT` still carrying it
would read as archived to every query that asks the column rather than the
status. No canonical source requires retaining it, so no authority conflict
arose. The archive/restore history lives in Audit, with the reason PO-03 requires
for both.

## E · Concurrency

The shared lifecycle `transition` puts the source state **and** the expected
counter in the `UPDATE … WHERE`, so two concurrent restores serialise on the row
and exactly one matches. The loser raises `STALE_WRITE`, which the use case
translates to `DESIGN_TEMPLATE_VERSION_CONFLICT` → 409 — never an untranslated
`PersistenceError` answering 500 against a published 409 (the `APP3-B06B-C1`
defect, wired correctly from the start here).

Proved live over 5 iterations: `[200, 409]` every time, final state `DRAFT`,
`archived_at` null, exactly one `design_template.restored` row.

## F · What is preserved

`current_version` is never in the `SET`. Version rows and their `published_at`
stamps are compared byte for byte across the transition and are equal. The scope
triple and every `design_template_assets` row are unchanged. A previously
published version keeps the exact timestamp it was stamped with — set once,
never cleared or rewritten.

## G · Zero-version restore

An `ARCHIVED` header with no version restores to a `DRAFT` with no version:
counter `0`, zero version rows, audit summary `version: 0`. Restore creates
nothing, so the rule that publication needs a version does not reach it.

## H · Audit

One `design_template.restored` row per success — a **fourth distinct** action,
never folded into unpublish, because both land in `DRAFT` and an operator must be
able to tell a template that came back from retirement from one merely taken off
the storefront. The archive it reverses keeps its own row: restore is a new fact,
not a retraction.

Summary is the bounded `{from: 'ARCHIVED', to: 'DRAFT', version}` plus the
reason, attributed to the acting Admin. No document, asset id, storage fact or
outbox payload. Written inside the same transaction as the transition; a failing
audit write rolls the transition back, proved by a double that only marks the
transaction committed when the whole body resolves.

## I · Races and serializability

Restore vs restore is a **true** conflict and is the mandatory proof. Restore
then archive is *not* a race: `DRAFT → ARCHIVED` is `TR-LC24-04` and legitimately
succeeds afterwards — asserted as two legal transitions reaching a valid LC-24
state, never as a fixed response pair.

## J · No publication guard

GRD-T01 belongs to publish. A restore that had to be publishable could never
rescue the template that most needs restoring: one archived precisely because its
Side was retired or its document went stale. Proved both ways — a unit double
throws if the guard is consulted, and live, a template whose Side is retired
mid-test restores successfully with its scope preserved exactly as it stood.
Nothing is repaired on the way back.

## K · No cascade, delete or outbox

No delete anywhere on the adapter — `ARCHIVED` is retention. Template count,
side count and asset-association count are unchanged across a restore. No Design
Session, clone, lineage or approval snapshot is touched. No outbox event: no
accepted consumer requires one, and an event nobody reads is an endpoint
announcing work nobody does.

## L · Runtime file-size debt — closed

`FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01 = COMPLETE — CLOSED_BY_APP3-B04A`.

Entry: controller 523 lines, adapter 563, against the CLAUDE.md §6 maximum of
400. Split by responsibility:

| File | Lines |
|---|---|
| `admin-design-template-authoring.controller.ts` (B03/B03A/B03B) | 317 |
| `admin-design-template-lifecycle.controller.ts` (B04/B04A) | 278 |
| `design-template-http-errors.ts` (the shared translation seam) | 41 |
| `drizzle-design-template.repository.ts` (reads + composition) | 230 |
| `design-template-authoring.writes.ts` | 338 |
| `design-template-lifecycle.writes.ts` | 166 |

One port, one implementation class, no second repository authority and no DI
change: the write collaborators are constructed by the adapter and share its
`DatabaseExecutor`, so a transaction opened around a use case is the same
ambient transaction all three see. Both controllers keep the same route prefix,
guards and error translation. Zero behaviour change outside B04A.

**The hazard this exposed.** Operation ids derive from the controller class name,
so the split silently reissued **all eight** accepted Admin Template ids —
`adminDesignTemplate_list` became `adminDesignTemplateAuthoring_list`, and so on
— a breaking change to every generated client for a refactor that altered no
behaviour. Caught by diffing the regenerated artifact. Closed by declaring the
publication domain explicitly (`CONTROLLER_DOMAIN_KEYS`), so splitting a
controller is now safe and the only way to rename an operation is to say so.
Verified: the delivered diff adds exactly one `operationId` line and removes
none.

## M · PostgreSQL evidence

`CMD-TEST-APP3-B04A-INTEGRATION` — **19/19** on a disposable PostgreSQL through
the real HTTP stack, no MinIO. All three seeded shapes archive and restore:
DRAFT zero-version, DRAFT versioned, PUBLISHED. Also proved: `archived_at`
cleared with every other column equal; versions and stamps byte-identical;
editable again (the next save creates v2); invisible to the public read,
including one published an instant earlier; publishable again afterwards;
refusals from DRAFT, PUBLISHED, a stale token, a missing/blank/oversized reason
and an unknown id all leave the row untouched and write zero audit rows; one
bounded reason-bearing row with `actor_kind = ADMIN`; no outbox delta; no
cascade; a retired Side preserved unrepaired; the race; and 401/403 for an
anonymous or foreign-origin caller.

Also re-run to prove the split inert: lifecycle 21/21, admin 19/19, save 14/14,
scope-assign 16/16. No persistent dev-data mutation.

## N · OpenAPI / client delta

| | Before | After |
|---|---|---|
| paths | 33 | **34** |
| operations | 38 | **39** |
| schemas | 82 | **83** (`RestoreDesignTemplateBody`) |

- OpenAPI sha256 `f736306045faa1c7a638bf7749b27051e351b967d29d574c20c6dce1fb581908`
- generated-client tree hash `f47c774ad5a6b3e1f40ad1d1413e6693e3a7ba5a1088f7cadd716a17519f62d9`

Added as a **new tier** in `check-app3-b01n-artifacts.mjs`; no historical hash
rewritten. The diff is purely additive apart from one archive description that
stopped naming a checkpoint which has now delivered.
`AdminDesignTemplateRestore200` generates concrete, not `void`. The curated
Admin client is unchanged — `APP3-A04` owns lifecycle there.

## O · Checker and gate evolution

New: `tools/check-app3-b04a.mjs` (458 lines) with two companions by
responsibility — `-contract.mjs` (published request/response, 78) and
`-split.mjs` (operation-id stability + surface file sizes, 94) — and
`check-app3-b04a.test.mjs`, **35/35**.

Predecessor gates made world-aware rather than patched:

- **B04** — the restore ban now rules in *both* directions (absent before B04A,
  present and B04A-owned after), and the successor-status rule accepts any
  legitimate B04A state. Its archive-reason rule was scoped **per transition**:
  a single `reason: command.reason` anywhere stopped proving archive carries one
  the moment restore added a second.
- **B03** — the Admin-guard rule now runs **per controller file**; a single match
  across the joined surface would have passed with the guard stripped from the
  half carrying the transitions. The `@Put` rule was re-anchored to the document
  route, since B03B had already added a second `@Put`.
- **B03/B03A/B03B/B04** — every controller and adapter path literal replaced by a
  shared source authority (`tools/app3-template-sources.mjs`). Without it the
  split would have left `not.toMatch` rules scanning files the code had left —
  passing for the wrong reason.
- **B03B / B05** — pinned surface counts (`33`, `31`, `81`) routed through the
  shared authority.
- Four regression harnesses now copy the surface files and the three authority
  modules into their throwaway repos, via one published list.

`APP3-B04`'s exact three-operation ownership is unchanged; restore is asserted as
B04A's, by operation id.

## P · Changed files

41 files, +4228 / −852. Backend: request DTO, port, adapter (split three ways),
lifecycle use case, audit recorder, two controllers, the error-translation seam,
module wiring, operation-id policy. Tests: two new suites, four repointed, one
shared source helper. Tools: new gate + two companions + regressions, four
predecessor gates, five harnesses, three authority modules. Docs: phase status,
scoped command index. Generated: OpenAPI + client.

## Q · Commit A

`1575dcc` — `feat(api): restore Design Templates`.

## R · Forward state

```
APP3-A03  = COMPLETE — REVIEW_ACCEPTED
APP3-B04A = COMPLETE — REVIEW_DELIVERED
APP3-A04  = READY_AFTER_B04A_REVIEW_ACCEPTANCE
```

`APP3-A04` was **not** implemented. On acceptance it becomes
`READY — NOT STARTED` and is the recommended next checkpoint: all four
lifecycle operations now exist in the contract, and A04 activates them
together on the curated client.

## S · Validation and disclosures

Run: B04A gate + 35 regressions · focused 25/25 · integration 19/19 · B04 gate +
45 regressions · B03/B03A/B03B/B05/G01/G02/A02/A03/B01N/B02/B06A/B06B/B07/B08/
G07/G08/P03/W01A/W01B/W01C/A01/B01/B02A gates all pass · 34/40/29/45/61/22/53
predecessor regressions · API typecheck, lint, build · `openapi:check` and
`check:generated` both current · api-client typecheck + 44 tests + 7 script
tests · `pnpm lint` 24/24 · `format:check` clean · `git diff --check` clean.
Not run, deliberately: frontend suites, worker, full repository integration, E2E,
Figma.

**Disclosures.**

1. **9 pre-existing failures.** `design-template.integration.spec.ts` fails at
   `DesignModule` init on unset `DESIGN_SESSION_SECRET_PEPPER`. Proven
   pre-existing by stashing this work and re-running at HEAD. Tracked as
   `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01`; a different module and a real
   decision about how Session auth config reaches a shared harness, so not
   repaired here. The rest of the Design Template group is 290/290.
2. **Checker 458 lines vs the 450 soft cap.** Already split three ways by
   responsibility; further cutting would be the arbitrary line-slicing §17
   forbids.
3. **Two test files remain over the 600-line maximum** —
   `design-template-lifecycle.spec.ts` (691, was 692) and its integration suite
   (667, unchanged). Both breached at entry. Restore got its own two suites
   rather than growing either, and neither is worse than it was.

Working tree clean after Commit B. Nothing pushed.
