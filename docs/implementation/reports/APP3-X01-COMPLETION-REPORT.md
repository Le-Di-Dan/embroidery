# APP3-X01 — phase closure: completion report

## A. Preflight and the accepted entry

Human review accepted the upload-revision correction, which is what unblocked
this checkpoint.

```text
APP3-E01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-E01    = COMPLETE — REVIEW_ACCEPTED
FU-APP3-UPLOAD-REVISION-SEAM-01 = COMPLETE — CLOSED_BY_APP3-E01-C1
APP3-X01    = READY — NOT STARTED
```

Measured at entry, not assumed:

```text
branch        production
HEAD          6ea9714  docs(app3): record APP3-E01-C1 evidence   ← E01-C1 Commit B
working tree  clean
APP4          not started — zero APP4 reports on disk
```

`APP3-E01-C1`'s implementation anchor `daa353f` is the parent of HEAD, so the
accepted correction is exactly what this closure closes over. Nothing was
amended, rebased or pushed.

## B. Scope and validation policy

`APP3-X01` implements no product behaviour. It reconciles the accepted
checkpoint chain, the corrections, the follow-ups, the artifact baseline and the
next-phase handoff into one auditable record, and it builds the gate that keeps
that record honest.

`VALIDATION_MODE = IMPACT_BASED_CLOSURE`. `APP3-E01` already consumed the
cross-layer, browser and benchmark evidence and `APP3-E01-C1` re-proved the one
blocking defect with a focused browser journey. Closure changed only
documentation and closure tooling, so no runtime test was rerun. §Q lists what
ran; §R lists what did not, and why.

## C. Canonical checkpoint matrix

[`APP3-CLOSURE-MATRIX.md`](./APP3-CLOSURE-MATRIX.md) — 68 executed checkpoints,
each with a final status, an acceptance, and both commits.

It is **derived, not transcribed**. The evidence commit for a checkpoint is the
commit that first added its completion report; the implementation commit is the
one immediately before it on this branch. The two-commit protocol makes that
exact rather than approximate, and it means the matrix cannot quietly disagree
with the graph. The set of checkpoints comes from the report directory, so a row
cannot be lost by being left out of a table somebody typed.

```text
68  executed with a completion report
 2  replanned before execution — APP3-B06, APP3-W01
 1  docs-only governance         — APP3-ROADMAP-RECONCILIATION
 1  correction with no separate report — APP3-PRE-AUDIT-C1 (1216e98)
 1  this closure                 — APP3-X01
```

## D. Git and evidence chain

146 commits between the accepted APP2 closure `8b5f3b0` and this closure. Every
one that belongs to no APP3 checkpoint is listed in matrix §4 rather than
silently counted — the APP2-X01-C1/C2 corrections delivered inside the APP3
window, the `GOV-Q01` governance pair, two replanning commits, three
follow-through fixes, and three commits unrelated to APP3 (a BRD0 registration,
a Flutter book, a branch merge).

## E. Correction and intervention reconciliation

Seventeen corrections across sixty-eight executed checkpoints, and no checkpoint
was corrected twice.

```text
executed + accepted (correction)   17  P01-C1 G05-C1 P02-C1 B01-C1 W01B-C1
                                       B06B-C1 B08-C1 D01-C1 A01-C1 A03-C1
                                       S01-C1 S03-C1 S05-C1 S06-C1 S08-C1
                                       E01-C1 PRE-AUDIT-C1
manual / final intervention             S05-MI01 (a final verification, not a
                                       second correction) · G04 · B08-C1
                                       (accepted AFTER manual intervention)
executed + superseded               0  APP3-S08 was corrected and stays accepted
replanned before execution          2  B06 → B06A+B06B · W01 → W01A+W01B
cancelled / not required            1  B06C-C1 — its work was absorbed by S06,
                                       which closed both B06C follow-ups
never created                       3  E01-C2 · X01-PRE · X01-G01
```

`APP3-PRE-AUDIT-C1` is disclosed rather than hidden: it was executed and
accepted, and its outcome lives in the audit's own
`REVIEW_ACCEPTED_AFTER_CORRECTION` status with no separate report file. A
correction without its own report is exactly the kind of record a closure matrix
exists to surface.

## F. Decisions and architecture

APP3 locked seven implementation decisions, all still `LOCKED`: `IMP-D041`
placement, `IMP-D042` Template lifecycle LC-24, `IMP-D043` anonymous Session,
`IMP-D044` editor media, `IMP-D045` geometry, `IMP-D046` normalization dispatch,
`IMP-D047` SVG sanitizer, `IMP-D048` Session upload architecture. No decision
status changed at closure, so the decision register is untouched.

One rendering architecture throughout: native SVG rendered by React behind the
engine-neutral document + renderer adapter (`IMP-D026`,
`ADR-APP0-001`). No second renderer, no canvas fallback, no rendering-engine
dependency was introduced by any of the eleven Studio checkpoints.

## G. Design authority

`REUSE_FIGMA_ACCEPTANCE`. `FIGMA_DESIGN_INDEX.md` has not changed since
`9433693` (`APP3-S11`) — before `APP3-E01`, before `APP3-E01-C1` and before this
closure. No Figma node was read, created or modified by `APP3-X01`, and no OAuth
or live connector call was made.

The registry gate was run because it is cheap and the closure states a registry
number: `node tools/check-figma-design-index.mjs` → **165 registry IDs, 165 node
rows, 15 tables**, passed.

## H. Primary capability baseline

Matrix §6 maps all seventeen cumulative capabilities to the accepted
checkpoints that delivered them, from placement through mobile touch. Matrix
§6.1 records what APP3 did **not** deliver, in one block the gate reads.

Two of those absences are worth stating plainly, because both are easy to
believe were delivered:

- **Group creation is not delivered.** `APP3-S04` delivered layers with group
  deferred by authority, `APP3-S08` records that no group action kind exists
  because no group capability does, and the follow-up is open pending a Product
  Owner ruling.
- **Production Template artwork intake is not delivered.** Admin can create,
  version, scope, publish, unpublish, archive and restore a Template, and the
  worker normalizes `TEMPLATE_SOURCE` artwork once it is associated — but
  nothing in the product uploads that artwork. Every Template with real artwork
  in this repository was seeded by a fixture, and `APP3-E01` deliberately did
  not let that fixture stand in for the feature.

No production-readiness claim is made anywhere; `IMP-D015` reserves it for
APP12, and the gate fails on the phrase.

## I. OpenAPI and client baseline

```text
paths 37 · operations 42 · schemas 84
sha256 f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817
generated client tree c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6
```

Both verified by their own generators rather than by inspection:
`openapi:check` reports the artifact up to date, `check:generated` reports the
client up to date. Nothing was regenerated.

## J. Database baseline

```text
34 migrations · 78 tables · 843 columns · fingerprint 7abf3708…
```

`node tools/db-manifest-check.mjs` passed all checks. APP3 changed the database
exactly once, at `APP3-DB01`: migration 34, columns 833 → 843, fingerprint
`82864268…` → `7abf3708…`. Closure changed nothing.

## K. APP3-E01 evidence reused

Reused, not rerun — `REUSED_RESULT_FROM = APP3-E01` (`9452826`): the
cross-layer journey and its 52 held facts, the `X-Forwarded-For` trusted-hop
security fix and its 68/68 auth tests, fixture idempotency, the `S10` retry
`EXPECTED_BY_STATE_MACHINE` finding, the `S11` mobile benchmark, the
Chromium/WebKit transform measurements, `B05`/`B05A`/`B06B`/`B06C` and worker
evidence, and the responsive and touch evidence.

`REUSED_RESULT_FROM = APP3-E01-C1` (`6ea9714`): the focused revision-seam suite
10/10, the Studio dependency suites 758/758, the one browser proof 6/6, the E01
checker 32/32, and the storefront typecheck.

## L. The blocker, closed

```text
FU-APP3-UPLOAD-REVISION-SEAM-01 = COMPLETE — CLOSED_BY_APP3-E01-C1
```

Verified mechanically at closure, from the register the gate reads:

```text
B06B upload returns revision R
  → the shared Session revision authority adopts R
  → the next S10 autosave presents expectedRevision = R
  → 200
  → reload restores the image through the private B06C route
```

The browser proof was **not** rerun. `APP3-E01-C1` measured it once —
upload `1`, presented `1`, `PUT /document 200`, revision `2`, chip `Đã lưu`,
image restored — and closure changes none of the source that produced it.

The gate refuses a register that puts the finding back to `BLOCKS_X01`, and a
mutation test proves that refusal.

## M. Performance debt, recorded honestly

`FU-APP3-TRANSFORM-BUDGET-01` stays `OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT`,
owned by **APP12**.

```text
Chromium L=100  move 16.7/33.4  resize 16.7/33.3  rotate 16.7/33.4
WebKit   L=100  move 47/48      resize 39/48      rotate 46/48
reference       ADR-APP0-001    20 ms p95 desktop
```

The budget is **not** claimed met. The debt is measured, attributed
(`PER_ELEMENT_REACT_SUBTREE_AT_L100_PLUS_WEBKIT_WHOLE_SVG_RERASTER`,
not a regression from any single checkpoint), non-security and non-correctness,
the product is functionally usable, and no unresolved APP3 correction depends on
it. Nothing was benchmarked again — the values are `APP3-E01`'s. The gate
requires the matrix to keep naming these figures: debt that stops stating its own
numbers has become a shrug, and a mutation test enforces that.

## N. Follow-up inventory and owners

Eleven open, zero blocking, each with a description, an origin, a class, a
concrete owner and an activation condition (matrix §5).

```text
APP4   SESSION-CREDENTIAL-ACCUMULATION-01 · PLACEMENT-NULLABLE-CONTRACT-01
       CONFLICT-CODE-CONTRACT-01 · DESIGN-SESSION-PEPPER-TEST-01
APP12  WORKER-BOOT-ORDER-01 · TRANSFORM-BUDGET-01
APP3-S12 (LATER_APP3)  STUDIO-TOOL-RAIL-01
Product Owner ruling   S04-GROUP-AUTHORITY-01
Regression activity    G03-QUALITY-AGGREGATE-01
FROZEN_APP3_LIMITATION TEMPLATE-SOURCE-ASSET-INTAKE-01 · A02-D01-CONTRACT-DRIFT-01
```

Four of these carried `OWNER_NOT_YET_ASSIGNED` into closure and now name a
phase. Two are frozen instead: the prompt forbids `later APP3` as an owner for
Template intake, and no delivered or planned phase owns either it or the
Template-list drift — so they are named as limitations in the handoff rather
than given an owner that would not have been true. The gate rejects
`OWNER_NOT_YET_ASSIGNED`, `TBD`, `later APP3` and their relatives outright.

`FU-APP3-A02-D01-CONTRACT-DRIFT-01` needed reconstruction: it was recorded by
`APP3-A03` (`d81aec7`) as already "carried", with a status and no description in
any accepted report. Its substance was recovered from `APP3-A02`'s own
disclosure — the approved `APP3-D01` Template-list frames draw text search, a
sort control, page numbers and a total, and the `APP3-B03` keyset list contract
supports none of them, so `APP3-A02` chose the contract over the frame and said
so. That is now the description in the matrix. It is a reconstruction from
`APP3-A02` evidence, not a record that existed.

## O. Closure checker

```text
node tools/check-app3-closure.mjs            PASS
node --test tools/check-app3-closure.test.mjs  24/24
```

`tools/check-app3-closure.mjs` (377) + `.sources.mjs` (155) +
`-artifacts.mjs` (65) + `.test.mjs` (329). Indexed as
`CMD-CHECK-APP3-CLOSURE` and `CMD-TEST-APP3-CLOSURE`.

What it enforces: one current word per closure-critical key; every executed
checkpoint recorded and accepted with two real commits; no ruled-out checkpoint
on disk and no cancelled correction counted as delivered; every open follow-up
nonblocking and concretely owned; accepted debt still naming its numbers; the
capability baseline evidenced and the absences recorded; the frozen artifacts
recomputed; and APP4 not started.

**A mutation found a real hole while the gate was being written.** The
"not delivered" rule searched the whole document, so moving group creation into
the delivered column stayed green — a follow-up row elsewhere still contained
the words. It now reads the §6.1 block alone. This is the second time in two
checkpoints that a mutation caught a rule reading something other than what it
names, which is the entire argument for writing them.

## P. Impact map

```text
CHANGED_FILES                6 documents reconciled, 1 closure matrix (new),
                             4 closure-tool files (new)
DIRECT_DEPENDENTS            none — no runtime source, no contract, no schema
CLOSURE_INVARIANTS_TOUCHED   the phase status register (§10.1, new), the APP3
                             roadmap status row, the follow-up ownership set
REQUIRED_VALIDATION          the closure checker and its tests, the three cheap
                             artifact checks, the Figma registry gate,
                             changed-file formatting, git diff --check
REUSED_ACCEPTED_EVIDENCE     §K
EXPLICITLY_SKIPPED           §R
```

## Q. Validation actually run

```text
node tools/check-app3-closure.mjs                       PASS
node --test tools/check-app3-closure.test.mjs           24/24
pnpm --filter @embroidery/api openapi:check             up to date
pnpm --filter @embroidery/api-client check:generated    up to date (c2fb229f…)
node tools/db-manifest-check.mjs                        all checks passed
node tools/check-figma-design-index.mjs                 PASS (165/165/15)
npx prettier --check <changed files>                    PASS after --write
git diff --check                                        clean
```

`db:check:manifest` is no longer a root script — `GOV-Q01` moved it to
`CMD-DB-MANIFEST-CHECK`, run directly as `node tools/db-manifest-check.mjs`.

ESLint was **not** run and does not apply: there is no root ESLint
configuration, `pnpm lint` is `turbo run lint` across workspaces, and `tools/`
is not a workspace. Prettier is the formatting control that governs these files
and it passes.

## R. Expensive validation explicitly reused or skipped

Not run, and not needed — closure modifies none of the source that produced
their evidence:

```text
the full APP3-E01 journey (either run) · the APP3-E01-C1 browser proof
the S11 S/M/L benchmark · the Chromium and WebKit transform benchmarks
the Admin publication, Template publication, image pipeline, two-tab conflict,
resume/expiry and mobile touch journeys
the full Storefront, Admin, API and worker suites · database integration suites
every APP3 and APP2 predecessor gate
OpenAPI generation · api-client generation · pnpm install · any Figma mutation
```

No command taking more than ten minutes was run, because no dependency of one
changed.

## S. Changed files

```text
M docs/implementation/10-MASTER-APPLICATION-ROADMAP.md      APP3 status + closure evidence
M docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md  §3 current-values pointer
M docs/implementation/13-PHASE-SOURCE-MAP.md                APP3 closed + what it did not deliver
M docs/implementation/README.md                             the one stale forward pointer
M docs/implementation/SCOPED_COMMAND_INDEX.md               2 closure command rows
M docs/implementation/phases/APP3-…-STUDIO.md               §10.1 register; 2 stale lines removed
A docs/implementation/reports/APP3-CLOSURE-MATRIX.md
A tools/check-app3-closure.mjs
A tools/check-app3-closure.sources.mjs
A tools/check-app3-closure-artifacts.mjs
A tools/check-app3-closure.test.mjs
```

`README.md` (root) was deliberately **not** changed: it states in §3.2 that
phase status must never be copied into it and lives only in the canonical
roadmaps. Following that is the correct reconciliation.

## T. Commit A

```text
979c173f4fc4df23d51c565797304addd48df0a3
docs(app3): close design templates and Studio
```

Eleven files, exactly those in §S. No product source, no completion report.

**Commit B is not report-only, and that is disclosed rather than worked
around.** Adding this report put an `APP3-X01-COMPLETION-REPORT.md` into the
directory the gate derives executed checkpoints from, so the gate demanded a
matrix row for the checkpoint currently running. The right answer is the rule
that says a closure cannot accept itself: `APP3-X01` is excluded from the
accepted table by name and must instead be recorded as
`COMPLETE — DELIVERED_FOR_REVIEW`. That rule, its mutation case (the 24th) and
the two count updates could only land with the report that provokes them.
Commit A's message therefore says "twenty-three mutation cases"; there are
twenty-four, and nothing was amended to hide the difference.

## U. Final acceptance matrix

```text
 1 E01-C1 REVIEW_ACCEPTED                       ✓ §A
 2 upload revision blocker CLOSED               ✓ §L
 3 all required checkpoints accepted            ✓ 68/68, matrix §2
 4 no unresolved blocking follow-up             ✓ 0
 5 every remaining follow-up owned              ✓ 11/11, §N
 6 Template + anonymous 2D Studio delivered     ✓ §H
 7 one native SVG architecture preserved        ✓ §F
 8 no export/download                           ✓ matrix §6.1
 9 anonymous Session secret boundary preserved  ✓ unchanged since B06A/B07
10 contextual media delivery preserved          ✓ B05A published · B06C private
11 OpenAPI/client current                       ✓ §I
12 DB manifest current                          ✓ §J
13 no schema/API/dependency closure change      ✓ §S
14 performance debt recorded honestly           ✓ §M
15 group not falsely claimed delivered          ✓ §H, gate-enforced
16 Template intake limitation recorded          ✓ §H, frozen in the handoff
17 no production-readiness claim                ✓ gate-enforced
18 APP4 not started                             ✓ gate-enforced
19 closure checker PASS                         ✓ §O
20 focused closure tests PASS                   ✓ 24/24
21 changed-file formatting clean                ✓ §Q
22 git diff --check clean                       ✓ §Q
23 exactly two X01 commits                      ✓ §T + this report
24 clean tree                                   ✓ §X
25 nothing pushed                               ✓ §X
```

## V. APP3 final baseline

```text
APP3 = COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW
APP3-X01 = COMPLETE — DELIVERED_FOR_REVIEW

68 checkpoints executed and accepted · 17 corrections · 0 blocking follow-ups
11 follow-ups open and owned · 2 limitations frozen and named
OpenAPI 37/42/84 f39e9e8f… · client c2fb229f… · 34 migrations · 78 tables
843 columns · fingerprint 7abf3708… · 30 root scripts · Figma 165 rows
```

## W. APP4 handoff

```text
NEXT_CANONICAL_PHASE = APP4 — Customer Identity, Verification, Secure Access
                       and Notification Core
APP4 = READY_FOR_PRE_IMPLEMENTATION_AUDIT
```

APP4 was not started, audited, prompted or coded here, and the gate fails if an
APP4 report appears. Five APP3 follow-ups are waiting for its pre-implementation
audit (§N) and are the natural first thing that audit should read.

## X. Tree, remote and disclosed observations

Clean tree, two commits, nothing amended, squashed, rebased or pushed. No
credential, cookie, Session secret or storage key appears in any artifact this
checkpoint produced.

Three things found during the closure audit that are **not** APP3 defects and
were deliberately left alone:

- **The APP2 roadmap status cell is stale.** Roadmap §6 still records APP2 as
  `STARTED_WITH_FOUNDATION_ONLY (engineering) — AUDITED — PASS_WITH_REQUIRED_DECISIONS`
  while the same row's evidence describes closure at `APP2-X01` and milestone R1
  achieved, and APP2's own record stops at
  `COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW` with no acceptance
  ever written down. APP3 proceeding is circumstantial evidence that acceptance
  happened, and that is not enough to write it: asserting another phase's
  acceptance would be inventing an event. Reported, not fixed.
- **`check:app2-closure` is not in the scoped command index.** `GOV-Q01` removed
  the root alias and the index claims to be the canonical home of every removed
  alias, but APP2's closure gate has no row. It is still runnable directly.
  Reported; adding a row for another phase's command is not APP3's to do.
- **`tools/check-app3-closure.mjs` is 377 lines**, above the 300 review
  threshold though well under the 400 hard maximum. It was already split by
  responsibility once during this checkpoint — the artifact measurement moved to
  its own module when the single file reached exactly 400 — and splitting the
  remaining record-consistency rules further would separate things that are one
  responsibility.
