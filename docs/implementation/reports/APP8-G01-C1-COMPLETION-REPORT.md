# APP8-G01-C1 — Correction Report

- Phase: `APP8 — Inventory Reservation and Production Operations`
- Parent checkpoint: `APP8-G01`
- Correction: `APP8-G01-C1` — `NARROW AUTHORITY DOCUMENTATION CORRECTION`
- Branch: `production`
- HEAD at entry: `a3c964637be4a883c9df0fa87629902314a6bf9b` (`a3c9646`, the `APP8-G01` commit)
- Working tree at entry: clean
- Date: 2026-08-24
- Verdict: **`APP8-G01-C1 = COMPLETE`**

---

## 1. Verdict

```text
APP8-G01-C1 = COMPLETE
APP8-G01    = COMPLETE_CORRECTED
BROAD_REGRESSION = NOT_RUN_BY_DESIGN
RUNTIME = 0 · SCHEMA = 0 · TESTS = 0 · FIGMA = 0 · OPENAPI = 0 · CLIENT = 0
NEXT_CHECKPOINT = APP8-B01
NOT_PUSHED = true
```

`APP8-B01` is not started. No other `APP8-G01` ruling was reopened.

---

## 2. The exact defect corrected

The first `APP8-G01` delivery wrote, under `PO-APP8-005`:

> `... delivery, cancellation execution, refund or final settlement.`

**Why it is a defect.** "Cancellation execution" in an exclusion list reads as
*all* cancellation behaviour leaving APP8. That collides with the already
accepted APP8 production state machine. `APP8_PHASE_ENTRY_AUDIT.md` §12.1 — the
audit's own **APP8-owned transitions** table — lists two rows that are
unambiguously APP8 work:

| From | To | Trigger | Actor | Guard | TX owner | Concurrency | Audit |
|---|---|---|---|---|---|---|---|
| `PLANNED` / `STARTED` | `CANCELLED` | Admin, reason mandatory | ADMIN | legality + reason | production service | job row lock | transition row |
| reservation `RESERVED` | `RELEASED` | job cancelled / admin, reason mandatory (`TR-LC17-06`, `GRD-020`) | ADMIN | reservation active | reservation service | reservation row lock (Gap B) | ledger `RESERVATION_RELEASED` |

`APP8-INVENTORY-AND-PRODUCTION.md` §11 likewise scopes `APP8-B04` as *"Admin
production transitions: start, complete, **cancel** — with the order move and
reservation consume/**release** in the same transaction"*.

So R00 both **kept** production-job cancellation in APP8 and, in its §10.3
out-of-scope prose, used the same loose phrase. `APP8-G01` propagated the loose
phrase into the canonical authority instead of drawing the distinction. The
Product Owner is correct: this is an **authority-document defect, not a runtime
defect** — no code, schema or test ever encoded the wrong boundary, because none
of `APP8-B04` exists yet.

**Scope note, reported rather than silently widened.** Two of the four remaining
occurrences are **R00-authored**, not `APP8-G01`-authored: the phase plan's §10.3
out-of-scope list and its §15 handoff sentence (*"executes no cancellation or
refund"*). Deleting them would rewrite R00. Leaving them would leave the canonical
phase document contradicting itself. Both sentences are therefore **preserved
verbatim** with a short, explicitly labelled `APP8-G01-C1` clarification note
attached, pointing at §10.5 as the binding reading. No R00 sentence was altered
or removed, and `APP8_PHASE_ENTRY_AUDIT.md` and `APP8-R00-COMPLETION-REPORT.md`
remain **byte-identical to entry**.

---

## 3. The corrected `PO-APP8-005` wording

Now canonical in
[`../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md`](../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md)
§5:

> APP8's successful production handoff ends at production job `COMPLETED` and
> order `PRODUCTION_COMPLETED`. APP8 does not execute
> `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT`, remaining-payment collection,
> shipping, delivery, refund, or final settlement. This boundary does **not**
> exclude APP8-owned production-job cancellation: `PLANNED`/`STARTED` →
> `CANCELLED` with mandatory reason remains in `APP8-B04`, including release of
> any still-active Catalog reservation required by the accepted reservation
> lifecycle. Full order cancellation/refund saga execution remains outside APP8.

---

## 4. Production-job cancellation remains APP8-owned in `APP8-B04`

```text
APP8_OWNED_CANCELLATION = production job PLANNED -> CANCELLED
                          production job STARTED -> CANCELLED
OWNER                   = APP8-B04   (scope unchanged; wording clarified only)
```

Confirmed and recorded in authority §5.2, phase §10.5 and `IMP-D056`:

- **Admin-initiated.**
- **Cancellation reason is mandatory** — a cancellation without a recorded reason
  is not a valid APP8 cancellation.
- The existing **production-job row lock** and LC-18 transition legality remain
  authoritative; APP8 adds no new lock anchor and no new legality table.
- The accepted **`production_job_transitions`** audit record is appended.
- If the order holds an active Catalog reservation still `RESERVED`, the owning
  APP8 flow **releases** it (`RESERVED → RELEASED`, `TR-LC17-06`) with the
  mandatory reason and the accepted ledger append.
- **COP-only orders have no reservation to release**, and none is fabricated —
  consistent with `PO-APP8-001`; the absence is not an error.
- **Mixed orders release only the applicable Catalog reservation(s)**; COP
  portions are untouched.
- **No customer-facing cancellation flow is invented**;
  `CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8` is unchanged.

`APP8-B04`'s scope is otherwise **unchanged**: 2 HTTP operations, no schema, no
worker, no design. No checkpoint was added, removed or reordered.

---

## 5. Full later order cancellation/refund execution remains outside APP8

Recorded in authority §5.1:

| Outside APP8 | Owner |
|---|---|
| `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` (`TR-LC14-05`) | APP9 |
| remaining-payment collection and settlement (`GRD-016`) | APP9 |
| shipping freeze and dispatch (`GRD-017`, `TR-LC14-07`) | APP9 |
| delivery and order completion (`GRD-018`, `TR-LC14-08`) | APP9 |
| refund calculation and refund payment (`GRD-021`, `TR-LC20-02`) | APP9 |
| **full order cancellation/refund saga execution** — the commercial workflow, its stage matrix and compensations (`GRD-020`, `ADR-DB3-002`) | later authority; **`IMP-O008` stays outside APP8** |
| shipping/delivery reversal, final financial settlement | APP9 |

The APP8 terminal happy-path boundary is **unchanged**:

```text
job   = COMPLETED
order = PRODUCTION_COMPLETED
```

APP7's unsatisfied `REMAINING` obligation is still preserved for APP9.

---

## 6. Exact files changed

| File | Change |
|---|---|
| `docs/implementation/audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md` | header correction line; **§5 rewritten** — mandated wording, new §5.1 (outside APP8) and §5.2 (APP8-owned production-job cancellation); §9 row for `PO-APP8-005` names the cancellation path |
| `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | §10.5 `PO-APP8-005` block corrected; labelled `APP8-G01-C1` clarifications attached to the **preserved** R00 §10.3 and §15 sentences |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-D056` `PO-APP8-005` clause corrected; provenance now "Set by `APP8-G01`, corrected by `APP8-G01-C1`" |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP8 row states the successful-handoff boundary and the production-job-cancellation carve-out explicitly |
| `docs/implementation/reports/APP8-G01-COMPLETION-REPORT.md` | verdict → `COMPLETE_CORRECTED`; visible correction notice added at the top; **original body left unedited** |
| `docs/implementation/reports/APP8-G01-C1-COMPLETION-REPORT.md` | **new** — this file |

Untouched: `APP8_PHASE_ENTRY_AUDIT.md`, `APP8-R00-COMPLETION-REPORT.md`, and
every file outside `docs/implementation/`. No runtime source, test, schema,
migration, generated artifact, OpenAPI document, generated client or Figma node.

---

## 7. Validation ledger

Change-impact only. The changed inputs are six Markdown files under
`docs/implementation/`; `docs/` is `.prettierignore`d as a locked baseline, so no
formatter governs them.

| Command/check | Exact changed question/input | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `git diff --check` | the six doc edits | **PASS** — exit 0, no output | 0 | The only mechanical defect a Markdown diff can carry |
| `grep -rn "cancellation execution" docs/implementation/` | does any canonical G01 authority still exclude all cancellation? | **PASS** — 7 hits, none of them a live canonical exclusion: R00's preserved §10.3 sentence (line 193) plus the labelled clarification quoting it (196); the superseded original G01 report body (128), which now carries a correction notice; authority §5's own correction notice (260); the `IMP-D056` sentence *describing* the corrected defect; and two quotations in this report | 0 | Directly answers acceptance criterion 1 — the phrase survives only as history or as the text of the correction itself |
| `grep -c "CANCELLED"` over the four canonical documents | is `PLANNED`/`STARTED` → `CANCELLED` recorded as APP8-owned everywhere? | **PASS** — authority 5, phase 3, register 1, roadmap 2 | 0 | Answers criteria 3–4 |
| `grep -n "APP8-B04" docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | does `B04` still own production cancellation? | **PASS** — §11 row 7 unchanged and verbatim: *"Admin production transitions: start, complete, **cancel** — with the order move and reservation consume/**release** in the same transaction … 2 HTTP ops, no schema, no worker, no design"*; authority §5.2 and §9 name `APP8-B04` as owner | 0 | Answers criterion 10 |
| `grep -n "Next" docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | the §12 status table after this correction | **PASS** — one status row carries `Next`, and it is `B01` | 0 | Answers criterion 13 |
| `git status --porcelain` | which paths this correction touched | **PASS** — 5 modified + 1 new, all under `docs/implementation/` | 0 | Proves no runtime/schema/test/Figma change exists |
| `node tools/check-report-secrets.mjs` (`CMD-CHECK-REPORT-SECRETS`) | the new `APP8-G01-C1-COMPLETION-REPORT.md` and the edited G01 report | **PASS for every APP8 file**; exit 1 on the one known pre-existing finding — §7.1 | 0 | Required for a newly created completion report; run once, after staging, because the gate reads `git ls-files` |

### 7.1 Report-secret gate — the same known pre-existing finding

```text
Secret-disclosure check failed:
  docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93: "token" is followed by
  what looks like a plaintext value. ...
exit 1
```

That is the entire output. It is `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` —
pre-existing, APP6-owned, present at entry HEAD `a3c9646` and already carried as
`CARRY_NONBLOCKING`. **Zero findings** against any `APP8-G01-C1` file. Recorded
once, as instructed; **not rerun and not absorbed**, and no APP6 report was
edited to green the gate.

---

## 8. Deliberately not run

```text
BROAD_REGRESSION = NOT_RUN_BY_DESIGN
```

Nothing below has a changed input — this correction changed six Markdown files
and nothing else:

- Jest, and every backend / API / worker / Admin / Storefront suite;
- inventory integration and race suites;
- production suites; worker suites;
- Playwright, all projects;
- OpenAPI generation and API-client generation (no contract changed);
- migrations and any database lifecycle command;
- Docker; repository-wide build or typecheck; SonarQube;
- `node tools/check-figma-design-index.mjs` — not a design or frontend UI
  checkpoint, and Figma changes are zero;
- Prettier / `format:check` — `docs/` is `.prettierignore`d.

---

## 9. Roadmap state

`APP8-G01-C1` is **correction evidence attached to `APP8-G01`**, not a roadmap
checkpoint. No permanent checkpoint was created, and the canonical order is
unchanged:

```text
R00 -> G01 -> B01 -> B02 -> W01 -> B03 -> B04 -> D01 -> A01 -> A02 -> A03 -> E01 -> X01
```

Canonical table —
[`../phases/APP8-INVENTORY-AND-PRODUCTION.md`](../phases/APP8-INVENTORY-AND-PRODUCTION.md)
§12, the only APP8 status table:

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1)
B01   INCOMPLETE — Next
B02 W01 B03 B04 D01 A01 A02 A03 E01 X01   INCOMPLETE
```

Exactly one `Next`, and it is `APP8-B01`. The table keeps the phase's existing
`COMPLETE` / `INCOMPLETE` vocabulary — §13.1 states that a correction report is
not a roadmap checkpoint, so the correction is recorded as a parenthetical rather
than as a new status word that no other row uses.

---

## 10. Acceptance criteria

| Criterion | Met |
|---|---|
| No canonical G01 authority says or implies APP8 excludes all cancellation execution | yes — authority §5, phase §10.5, `IMP-D056`, roadmap row; R00's two preserved sentences each carry an adjacent binding clarification |
| `PO-APP8-005` distinguishes production-job cancellation from later commercial cancellation/refund | yes — authority §5.1 vs §5.2 |
| `PLANNED → CANCELLED` remains APP8-owned | yes — authority §5.2 |
| `STARTED → CANCELLED` remains APP8-owned | yes — authority §5.2 |
| Cancellation reason remains mandatory | yes — stated in all three canonical documents |
| Active Catalog reservation release remains in the APP8 cancellation path | yes — `RESERVED → RELEASED`, `TR-LC17-06` |
| COP cancellation fabricates no reservation | yes — authority §5.2, consistent with `PO-APP8-001` |
| Mixed-order cancellation affects only actual Catalog reservations | yes — authority §5.2 |
| Full later order cancellation/refund saga outside APP8 | yes — authority §5.1, `IMP-O008` unchanged |
| `B04` scope unchanged except clarified wording | yes — §11 row untouched; still 2 HTTP ops, no schema, no worker |
| All other G01 rulings unchanged | yes — `PO-APP8-001`…`004`, `006` and every inherited lock untouched; §5 was the only section rewritten |
| No runtime/schema/test/Figma change | yes — `git status` shows only `docs/implementation/` |
| Exactly one `NEXT`, `APP8-B01` | yes — verified by grep |
| Correction report exists | yes — this file |
| Nothing pushed | yes |

---

## 11. Git evidence

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `a3c964637be4a883c9df0fa87629902314a6bf9b` |
| Correction commit | the single `APP8-G01-C1` commit created from this report — reported in the final response as post-commit external evidence (`git log -1`) |
| Pushed | **no** |

No second commit was manufactured to record a hash inside a commit that cannot
contain it.

---

## 12. Stop

```text
APP8-G01-C1 = COMPLETE
APP8-G01 = COMPLETE_CORRECTED
NEXT_CHECKPOINT = APP8-B01
NOT_PUSHED = true
```
