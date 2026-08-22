# APP6-X01 — Phase Closure Completion Report

**Phase:** APP6 — Design Review, Approval and Quotation
**Checkpoint:** `APP6-X01`
**Mode:** `PHASE_CLOSURE / RECONCILIATION_ONLY`

---

## 1. Verdict

```text
APP6-X01              = COMPLETE
APP6                  = PASS_WITH_FOLLOW_UPS
BLOCKING FOLLOW-UPS   = 0
PHASE                 = CLOSED
NEXT PHASE            = APP7 — Deposit Payment and Order Creation (NOT STARTED)
```

No production runtime change. No database or schema change. No OpenAPI or
client regeneration. No Figma mutation. No implementation suite rerun. Nothing
pushed.

---

## 2. Preflight

| Item | Repository truth |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `46d3bff` — *docs(app6): record the APP6-E01 commit hash in its completion report* |
| Working tree at entry | 3 modified files, **all** of them the accepted `E01-C1` correction — no unrelated user changes |
| `33f8747` reachable from `HEAD` | **YES** (`git merge-base --is-ancestor` → 0) |
| `7573ccd` reachable from `HEAD` | **YES** |
| `APP6-E01-C1` state at entry | **uncommitted** — docs + one harness comment |
| `git diff --check` | clean |
| Push | none — local commits only |

`E01-C1` was uncommitted at entry and the working tree contained **only** the
accepted C1 changes, so a narrow C1 evidence commit was created before closure,
exactly as §2 of the closure instruction directs:

```text
fdb0e9a  docs(app6): correct the APP6-E01 design-case origin evidence (E01-C1)
         apps/api/test/acceptance/app6-e01/app6-e01-world.ts        (comment only)
         docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md
         docs/implementation/reports/APP6-E01-COMPLETION-REPORT.md
```

Nothing was reset, stashed, discarded or amended. No unrelated change was mixed
in — the tree was clean immediately after the commit.

---

## 3. Phase scope delivered

APP6 delivered the commercial middle of the custom-request lifecycle:

```text
versioned quotation workflow            (draft → version history → send → supersede)
secure quotation acceptance / rejection (grant-scoped, step-up guarded)
digitizing gate                          (GRD-005, the only ADMIN-commanded APP6 move)
versioned design review                  (author → send for review → revision loop)
secure exact-version approval / revision (grant-scoped, agreement-bound)
immutable agreement-bound Approval Snapshot
Catalog + Customer-Owned Product support on both branches
Admin quotation and design-case workbenches
customer secure quotation and design-review screens
```

The delivered status ledger, proved end to end by `E01` on both branches:

```text
UNDER_REVIEW → QUOTED → QUOTE_ACCEPTED → DIGITIZING → DESIGN_REVIEW → APPROVED
   four SYSTEM projections · exactly one ADMIN-commanded move (DIGITIZING)
```

**APP7 order and deposit creation is not implemented by APP6.** APP6 ends at
`APPROVED`; it creates no order, no deposit obligation and no deposit attempt.
`E01-06` proves that boundary both statically over the committed OpenAPI
artifact and again at runtime.

---

## 4. Final OpenAPI baseline

Read from the committed artifact. **Not regenerated.**

```text
artifact   packages/contracts/openapi/openapi.generated.json
blob hash  80ad1b256f23f84300a5ac08b00474e74ca11119   (git hash-object)

paths       72
operations  79
schemas    167
```

### 4.1 Delta against the APP5 frozen baseline

Baseline taken at `6b09c04` (`APP5-B06`, the last APP5 commit touching the
artifact) and recomputed, not inferred by subtraction:

| | APP5 frozen | APP6 final | Delta |
|---|---:|---:|---:|
| paths | 58 | 72 | **+14** |
| operations | 63 | 79 | **+16** |
| schemas | 132 | 167 | **+35** |
| migrations | 35 | 36 | **+1** |

**Operations removed since the baseline: 0.** The +16 is a pure addition, so
ownership is established by set difference on `operationId`, not by arithmetic.

### 4.2 APP6 operation ownership, by checkpoint

Computed per-commit from the committed artifact at each checkpoint's delivery
commit:

| Checkpoint | New ops | Operation id | Route |
|---|---:|---|---|
| `APP6-B01` | 2 | `adminQuotation_create` | `POST /api/admin/quotations` |
| | | `adminQuotation_addVersion` | `POST /api/admin/quotations/{quotationId}/versions` |
| `APP6-B02` | 2 | `adminQuotation_versionHistory` | `GET /api/admin/quotations/{quotationId}/versions` |
| | | `adminQuotation_versionDetail` | `GET /api/admin/quotations/{quotationId}/versions/{versionId}` |
| `APP6-B03` | 1 | `adminQuotation_sendVersion` | `POST /api/admin/quotations/{quotationId}/versions/{versionId}/send` |
| `APP6-B04` | 1 | `publicQuotation_current` | `POST /api/public/quotations/current` |
| `APP6-B05` | 2 | `publicQuotation_accept` | `POST /api/public/quotations/accept` |
| | | `publicQuotation_reject` | `POST /api/public/quotations/reject` |
| `APP6-B06` | **0** | — | reuses `adminCustomRequest_transition` **unchanged and not reissued**; `operationId` delta `[]` |
| `APP6-B07` | 1 | `adminCustomRequestSubmittedDesign_get` | `GET /api/admin/custom-requests/{requestId}/submitted-design` |
| `APP6-B08` | 2 | `adminCustomRequestDesignVersion_list` | `GET /api/admin/custom-requests/{requestId}/design-versions` |
| | | `adminCustomRequestDesignVersion_create` | `POST /api/admin/custom-requests/{requestId}/design-versions` |
| `APP6-B09` | 1 | `adminCustomRequestDesignVersion_send` | `POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send` |
| `APP6-B10` | 1 | `publicDesignReview_current` | `POST /api/public/design-reviews/current` |
| `APP6-B11` | 2 | `publicDesignReview_approve` | `POST /api/public/design-reviews/approve` |
| | | `publicDesignReview_requestRevision` | `POST /api/public/design-reviews/request-revision` |
| `APP6-A01` | **0** | — | consumes B01–B05; the §4 narrow read-contract unblock added no operation |
| `APP6-A02` | 1 | `adminCustomRequestDesignVersion_detail` | `GET /api/admin/custom-requests/{requestId}/design-versions/{versionId}` |
| `APP6-S01` | 0 | — | consumes B04/B05 |
| `APP6-S02` | 0 | — | consumes B10/B11 |
| `APP6-E01` | 0 | — | acceptance only |
| **Total** | **16** | | |

```text
APP6 OPERATION TOTAL = 16   (verified — matches the roadmap expectation exactly)
```

Every id was read from the committed artifact. The roadmap's expected per-
checkpoint distribution (2/2/1/1/2/0/1/2/1/1/2/1) is confirmed line for line,
including both zero-operation checkpoints.

---

## 5. Final database baseline

```text
migration count            36
APP6-owned migration       0036_add_app6_cop_design_context.sql
migrations added by X01     0
migrations executed by X01  0
```

Directory read: `packages/database/migrations/*.sql` = 36 files, highest
`0036_add_app6_cop_design_context.sql`.

APP6 schema delta, all in `0036` (`ADR-APP6-001` §4, eight operations):

```text
design_versions
  nullable Catalog quartet (was NOT NULL)
  + customer_owned_product_id
  + placement_side_label
  + placement_area_label
  Catalog / COP XOR constraint
  COP label completeness constraint

approval_snapshots
  nullable Catalog quartet
  + customer_owned_product_id
  Catalog / COP XOR constraint
```

No DB global regression, migration run or manifest check was executed — inputs
are unchanged since `APP6-DB01`.

---

## 6. Final Figma baseline

Recomputed from `docs/design/FIGMA_DESIGN_INDEX.md` §4.12:

```text
APP_06 registry rows            56
APPROVED_FOR_IMPLEMENTATION     56
not approved                     0
approval evidence               FIG-APPROVAL-APP6-D01-PO-001  (2026-08-20)
file key                        BQwqV8GdfUIELvsQDB1UQE
page                            APP_06  (678:3, pre-existing and empty, reused)
```

By surface: **Admin 25** (`/requests/{requestId}/design` 13,
`/requests/{requestId}/quotation` 12), **Storefront 23** (`/truy-cap/bao-gia` 11,
`/truy-cap/duyet-thiet-ke` 12), **Shared 8** (phase overview 1, shared
specification 6, handoff & dependency 1).

Every APP6 implementation checkpoint consumed approved rows under
`FIG-APPROVAL-APP6-D01-PO-001`. **All 56 APP6 rows are approved; none is
`REVIEW_REQUIRED`, missing, stale or superseded.**

No Figma node was created, modified or deleted by `X01`. See §9 for the one
registry **prose** annotation and why the gate was run.

---

## 7. Final acceptance evidence

Summarised from the accepted reports. **Nothing was rerun.**

### 7.1 By layer

| Layer | Checkpoints | Accepted evidence |
|---|---|---|
| Authority | `R00`, `G01` + `G01-C1` | Phase-entry audit; `IMP-D051`, `ADR-APP6-001`; agreement authority aligned to `[PAYMENT_POLICY, RETURN_POLICY]` |
| Database | `DB01` | Migration `0036`, COP design context physically representable, Catalog/COP XOR |
| Design | `D01` | 56 approved Figma rows |
| Backend | `B01`–`B11` | 16 operations delivered with per-checkpoint contract, integration and race evidence |
| Admin | `A01` + `A01-C1`, `A02` | Two workbenches; browser acceptance at 1440 and 1280 |
| Customer | `S01`, `S02` | Two secure screens; browser acceptance at 1440 and 390 |
| Cross-layer | `E01` + `E01-C1` | See §7.2 |

### 7.2 `APP6-E01` — the phase acceptance run

```text
6 serial acceptance cases
54 API acceptance tests
4 watermark authority tests
Catalog happy path        → APPROVED
COP happy path            → APPROVED
quotation stale / expiry / immutability
design-review race / revision / first-decision-wins / immutability
REQUEST_ACCESS + STEP_UP + non-enumeration
customer-safe contract + APP7 boundary
blocking defects          = 0
```

Run in one composed injector carrying every delivered APP6 module at once, over
real HTTP through real guards, against a disposable PostgreSQL with every
migration applied. Policy values are the delivered ones — the `staff-bootstrap`
publishers run against the committed seed datasets. `GRD-003` executes for real
throughout: the fixture commits a `VERIFIED` `STEP_UP` challenge row rather than
bypassing a guard, and no plaintext verification code exists in the process.

**`S01` and `S02` browser acceptance was accepted at its own checkpoint and
reused by `E01`; it was not rerun here.** `E01` deliberately ran no browser
leg.

### 7.3 No aggregate test count is claimed

The per-checkpoint counts in the completion reports (199 at `A02`, 89 + 137 at
`S01`, 150 + 44 at `S02`, 54 + 4 at `E01`, and the B-series suites) overlap —
compatibility suites are re-executed by more than one checkpoint. They are
**checkpoint evidence**, and this report deliberately does not sum them into a
"global regression count" that was never run.

---

## 8. Follow-up closure

Canonical matrix: [`APP6-CLOSURE-MATRIX.md`](./APP6-CLOSURE-MATRIX.md).

Every follow-up id appearing in any APP6 phase document, audit or completion
report was enumerated from repository truth by grep — **22 APP6-owned**, plus 2
inherited ids that APP6 documents carried. The closure instruction named 17; the
sweep found **7 more** APP6-owned ids it did not list:

```text
FU-APP6-A01-BROWSER-REVIEW-01                  (closed at A01-C1)
FU-APP6-B01-CURRENT-QUOTATION-POINTER-01       (closed at B03)
FU-APP6-B05-AGG14-LOCK-ORDER-01                (routed here, §11)
FU-APP6-B05-B04-FROZEN-SURFACE-DRIFT-01        (closed on arrival at B05)
FU-APP6-B06-POLICY-FILE-REVIEW-THRESHOLD-01    (deferred, under hard limits)
FU-APP6-B09-CASE-REPO-SIZE-01                  (closed at B10, kept closed at A02)
FU-ADMIN-SHARED-DIALOG-01                      (inherited; re-routed, §8.2)
```

### 8.1 Counts by final disposition

| Final disposition | Count |
|---|---:|
| `CLOSED` | 7 |
| `CLOSED_BY_AUTHORITY_ROUTING` | 2 |
| `CLOSED_FALSE_POSITIVE` | 1 |
| `DEFERRED_NONBLOCKING` | 8 |
| `HISTORICAL_SCOPED` | 4 |
| `ACTIVE_SCOPED` | 0 |
| **APP6-owned total** | **22** |
| Inherited (`ENVIRONMENT_NONBLOCKING` 1, `DEFERRED_NONBLOCKING` 1) | 2 |

```text
BLOCKING FOLLOW-UPS = 0
```

10 of the 22 were resolved (7 during execution, 1 as a false positive at
`E01-C1`, 2 by authority routing here). The 12 that remain open are deferred
future capability, historical debt predating or outside APP6, or a deliberate
architectural choice.

**Exactly one APP6 follow-up was ever genuinely blocking:**
`FU-APP6-A01-BROWSER-REVIEW-01`, recorded *open, blocking acceptance* when A01
could not obtain a credential for the browser pass. `APP6-A01-C1` (`19f17e3`)
ran the pass and closed it before the phase closed.

### 8.2 One honest re-routing

`FU-ADMIN-SHARED-DIALOG-01` was routed to APP6 by `APP4-X01` on the description
"APP6 — Admin Operations (earliest phase owning shared Admin UI)". **APP6 is not
that phase** — its canonical title is *Design Review, Approval and Quotation*,
and the routing rested on a phase-title assumption. `APP6-A01` and `APP6-A02`
each shipped their own hand-rolled dialog and carried the item unchanged, so it
is now the seventh. Recorded plainly rather than quietly closed: **APP6 was the
routed owner and did not consolidate it.** Consolidation means editing accepted
APP2/APP3 components and their tests — a shared-Admin-UI refactor, forbidden by
this checkpoint's `RECONCILIATION_ONLY` mode. Re-routed to the next phase that
owns shared Admin UI. Not blocking: every delivered Admin dialog works and is
proved by its own checkpoint's browser acceptance.

### 8.3 Why none of the remaining items is a blocker

A follow-up is blocking only if a delivered APP6 journey cannot work according
to accepted authority. Each open item fails that test for a stated reason:

- **`FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01`** — the missing browser
  observation is caused by deliberate OTP secrecy: APP4's dev notification
  channel is memory-only by design, so no plaintext code exists to read. The
  guarded journey itself is proved by `E01` through the real production guard.
  The verification architecture was **not weakened to obtain browser proof**,
  and no fake dev channel was added.
- **`FU-APP4-DEV-ENVELOPE-KEY-UNSET-01`** — environment provisioning, not APP6
  product work.
- **`FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01`** — a design-documentation
  numeric discrepancy whose runtime authority is now resolved (§9). Runtime was
  always correct.
- **`FU-APP6-S01-STEPUP-CONTACT-PREFILL-01`** — future UX convenience; current
  behavior is truthful (customer names the contact, server validates ownership
  and eligibility).
- **`FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01`**, **`FU-APP6-B08-P01-GATE-01`**,
  **`FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01`**,
  **`FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01`** — historical aggregate and
  tooling debt, all proved pre-existing or inherited, none caused by APP6.
- **`FU-APP6-B01-CODE-GENERATOR-PROMOTION-01`** — a future generator promotion
  with no third consumer.
- **`FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01`** — an **absent future
  capability**, explicitly routed to a later lifecycle-authority decision. LC-11
  has no `QUOTE_ACCEPTED → QUOTED` edge, acceptance reopens nothing, and A01
  correctly offers no re-quote control. Nothing delivered is broken.
- **`FU-APP6-B10-AGREEMENT-ACTOR-01`**, **`FU-APP6-DB01-01`** — both require a
  schema change or migration generation, forbidden here. Publication itself
  works and is proved by B10, S02 and E01.
- **`FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01`** — the state is proved
  to exist by component evidence; only holding the frame open failed, a
  tool/environment limitation, not a known runtime defect.
- **`FU-APP6-B06-POLICY-FILE-REVIEW-THRESHOLD-01`** — both files are under their
  hard limits and single-responsibility; `CLAUDE.md` §6 requires splitting by
  responsibility, so there is no violation to fix.

No follow-up with an actual delivered-journey failure is recorded as
nonblocking.

---

## 9. Watermark disposition

```text
APP6_WATERMARK_RUNTIME_AUTHORITY = DELIVERED_APP3_S09
RUNTIME_CANONICAL                = APP3-S09  (−30°, 5 × 7 percentage grid)
D01 / Figma numeric treatment    = design-reference discrepancy,
                                   NON-RUNTIME AUTHORITY  (18°, 160 × 130)

FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01 = CLOSED_BY_AUTHORITY_ROUTING

NO RUNTIME CHANGE · NO FIGMA MUTATION
```

Verified by targeted source read at `HEAD` — the two models are identical in
geometry, so `APP6-S02` demonstrably followed the delivered runtime:

```text
design-studio/model/studio-watermark.ts
  WATERMARK_ANGLE_DEG = -30 · WATERMARK_ROWS = 7 · WATERMARK_COLUMNS = 5
secure-design-review/model/review-watermark.ts
  REVIEW_WATERMARK_ANGLE_DEG = -30 · _ROWS = 7 · _COLUMNS = 5
```

The ambiguity was **in documentation**, at the two places that presented the
drawn measurement as the *exact delivered treatment*. Both were annotated; the
historical measurement was preserved, not rewritten as though it never existed:

| File | Change |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` §4.12 prose | The 18° / 160 × 130 figures are now explicitly labelled *as measured on the Figma reproduction*, and runtime authority is routed to `APP3-S09` with the delivered numbers stated. **No registry row, node id, deep link, status or approval evidence was touched.** |
| `docs/implementation/reports/APP6-D01-COMPLETION-REPORT.md` §5 | A superseding note added **beneath** the original paragraph, preserving it verbatim. The non-geometric properties it records (Inter Medium 13, `Color/Text/Primary` at 13 % node opacity, always on, no toggle, no export control) remain accurate and are unchanged. |

The registry was chosen deliberately: `CLAUDE.md` sends every frontend UI
checkpoint to `FIGMA_DESIGN_INDEX.md` first, so leaving the false *exact
delivered treatment* claim there would have left the ambiguity precisely where
governance directs future readers. Because that edit changed the gate's input,
`node tools/check-figma-design-index.mjs` was run — the one Figma command
justified by a changed input, and the reason §12's "unchanged registry"
exclusion does not apply. `APP6-S02`'s report already stated the discrepancy
correctly and needed no correction. No Figma redraw is required to close APP6.

---

## 10. Design Case origin disposition

```text
FU-APP6-E01-DESIGN-CASE-ORIGIN-01 = CLOSED_FALSE_POSITIVE
OWNER                             = APP5-B01 / TR-LC11-01 request.submit
```

`E01` inferred from its own fixture that no delivered operation creates a
`design_cases` row. A phase-scoped fixture seeding a row proves only that the
seeding phase does not produce it inside its own execution window. The delivered
creator is `SubmitCustomRequestUseCase` → `DesignCaseRepository.createForRequest`
inside the idempotent W1 submission transaction, proved by `APP5-B01` against
real PostgreSQL. `E01` seeds it because it starts at the APP6 prerequisite
boundary with the request already `UNDER_REVIEW`.

**No design-case creation work is routed to APP6 or APP7. `APP6-B08`'s
existing-case semantics and the `E01` PASS verdict are unchanged. Not routed
again.**

---

## 11. AGG-14 lock-order property carried forward

`FU-APP6-B05-AGG14-LOCK-ORDER-01` = `CLOSED_BY_AUTHORITY_ROUTING`. The property
existed only in the B05 report and a race-suite header; it is now stated in the
closure matrix §5, which is what a later AGG-14 writer will read:

```text
update quotations key-share-locks the parent custom_requests row.
=> Every AGG-14 write path must reach the custom_requests row, and FIRST.
```

Both delivered writers do. Promoting it into `BACKEND_CONVENTIONS.md` or DB7 is
a conventions edit outside this checkpoint's scope.

---

## 12. Validation ledger

Closure-only. Every command below was run because its **input changed** or
because it reads repository truth; none re-executes a passing command on
unchanged inputs.

```text
git rev-parse --abbrev-ref HEAD / HEAD          branch and entry HEAD
git status --porcelain                          working tree, before and after
git merge-base --is-ancestor 33f8747 HEAD       E01 reachability     → YES
git merge-base --is-ancestor 7573ccd HEAD       S02 reachability     → YES
git diff / git diff --stat                      C1 content inspection
git diff --check                                clean
git log --oneline (scoped)                      checkpoint commit ledger
git show <rev>:openapi.generated.json           per-checkpoint operation ownership
git hash-object openapi.generated.json          artifact hash
node (read-only) over the committed artifact    72 paths / 79 ops / 167 schemas
ls packages/database/migrations/*.sql | wc -l   36
grep / sed over docs/                           follow-up sweep, Figma row counts
targeted source read                            studio-watermark.ts, review-watermark.ts
node tools/check-figma-design-index.mjs         registry gate — run because §9 changed its input
```

```text
No implementation or broad regression tests were rerun in X01.
```

Explicitly **not** run: the six `E01` cases, the `E01` aggregate, `S01`/`S02`
browser, `A01`/`A02` browser, the `B01`–`B11` suites, `DB01` tests, full
API/Admin/Storefront/worker suites, Playwright, any OpenAPI or client
generation/check chain, DB migration or global manifest regression, SonarQube,
and any APP3 historical sweep. No repository-wide aggregate command exists or
was invented (`VALIDATION_GOVERNANCE.md` §1.1, §5).

---

## 13. Files changed

```text
docs/implementation/reports/APP6-X01-COMPLETION-REPORT.md   NEW — this document
docs/implementation/reports/APP6-CLOSURE-MATRIX.md          NEW — canonical matrix
docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md
                                                            X01 row → COMPLETE; closure block
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md        APP6 phase status → CLOSED
docs/design/FIGMA_DESIGN_INDEX.md                           §4.12 watermark prose (§9)
docs/implementation/reports/APP6-D01-COMPLETION-REPORT.md   §5 superseding note (§9)
```

**No production source file was changed.** No test, fixture, schema, migration,
OpenAPI artifact, generated client or Figma node was touched.

The `E01-C1` files (`app6-e01-world.ts` comment, the E01 report, the phase-doc
E01 row) were committed separately at `fdb0e9a` before closure and are not part
of the closure commit.

---

## 14. Commits

```text
fdb0e9a  docs(app6): correct the APP6-E01 design-case origin evidence (E01-C1)
<X01>    docs(app6): close APP6 at X01
```

Local commits only. **Nothing pushed.**

---

## 15. Next-phase handoff

Read from the canonical implementation plan
(`docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §3, row 18):

```text
NEXT PHASE = APP7 — Deposit Payment and Order Creation
STATUS     = NOT_STARTED
SCOPE      = "Verified deposit converts approved quote into an order safely."
```

APP6 hands APP7 a request at `APPROVED` with an accepted quotation version and
an immutable, agreement-bound Approval Snapshot. APP7 creates the deposit
obligation and attempt and the order conversion **only** from an eligible
accepted quotation and approved design.

**APP7 was not executed by this checkpoint.**

---

## 16. Closure statement

```text
APP6-X01              = COMPLETE
APP6                  = PASS_WITH_FOLLOW_UPS
BLOCKING FOLLOW-UPS   = 0
PHASE                 = CLOSED
```

Returned for Product Owner final review with
[`APP6-CLOSURE-MATRIX.md`](./APP6-CLOSURE-MATRIX.md).
