# ADR-DB3-003 — Post-Approval Revision: Production, Deposit and Quotation Handling

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `0563866e0c1a53472a07e892e6cc1ecabe086b5a`
- Decision IDs: DEC-23 (+deposit-reuse portion of O-009)
- Requirement IDs: REQ-APPR-003, REQ-PROD-001/002, REQ-DVER-004
- Invariant IDs: INV-01, INV-03, INV-06, INV-17
- Gap IDs: — (completes the J10/`06 §10` open mechanics)

## Context

`06 §10`/J10 lock the skeleton: existing approval stays valid historically,
a new version is created, the order may pause, a new quotation may be
required, production must reference the latest valid approval. Open: does
production auto-pause; new job vs amended job; deposit reuse; reservation
handling. DB2 locked Production Specification as an immutable snapshot per
job.

## Decision Drivers

- INV-03: production references exactly one approved snapshot — any ambiguity
  between "old spec" and "new design" is a production-integrity defect.
- Immutable spec (DB2) → a changed design can never be an *edit* of a job.
- Deposit money already taken must stay accounted to the case without
  double-charging or silent forfeiture.

## Options Considered

- Amend existing production job/spec in place — violates spec immutability.
- Always cancel order and restart from scratch — loses deposit continuity
  and case history ergonomics.
- **Hold-and-supersede: order holds; new approval spawns a new job; deposit
  carries over with recalculation** (chosen).

## Decision

### Order/production behavior (locked)

1. **Accepting a reopen holds the order automatically:** when Admin accepts
   a post-approval change request, the Order transitions to `ON_HOLD`
   (audited, reason = revision) in the same use case that opens the new
   design version. Customer reopen requests arrive via secure flow
   (re-verified action, ADR-DB3-004) and require admin acceptance.
2. **Production not started (PLANNED):** the planned job is `CANCELLED`
   (reason: superseded-by-revision). A **new Production Job** with a fresh
   immutable Specification is created after the new approval. Planned jobs
   are never updated to a new design.
3. **Production started:** Admin decides — complete as approved (reopen
   denied for the in-flight goods) **or** cancel the job (reason: rework)
   and treat material/labor impact via the quotation revision (rule 6).
   **Rework is always cancel-old-job + new-job-after-new-approval**; a job's
   spec is never rewritten (INV-03).
4. **Approval history:** the existing Approval Snapshot is never modified or
   deleted; the order's *current approval reference* is repointed to the new
   snapshot upon new approval (audited pointer move). Operational
   supersession, historical preservation (REQ-APPR-003).
5. **Resume gates:** order leaves `ON_HOLD` only when (a) a new Approval
   Snapshot exists, and (b) the then-current quotation version is accepted
   (ADR-DB3-001 rule 4). Resume returns the order to the correct stage
   (AWAITING_DEPOSIT-equivalent recalculation or DEPOSIT_PAID path per
   rule 7).

### Money (locked direction; amounts via reconciliation)

6. **Quotation revision required iff pricing inputs changed** (new version →
   re-acceptance). Unchanged price → no new quotation needed.
7. **Deposit carries over by default:** a verified deposit remains credited
   to the order. If the newly accepted total changes, obligations are
   **recalculated**: prior obligations `SUPERSEDED`, new deposit/remaining
   obligations computed from the new total, and the already-paid amount is
   applied via a **manual reconciliation record** (shortfall → small
   additional deposit obligation; surplus → credit toward remaining, or
   refund per ADR-DB3-002 mechanics). No silent forfeiture; no automated
   money movement.

### Inventory (locked direction)

8. **Reservation kept during hold by default** (goods committed to this
   customer); a hold-release TTL is policy config (deferred value). If the
   revision changes SKU/quantity, the reservation is recalculated on resume:
   release deltas / reserve additions under the standard gates (deposit
   already verified satisfies INV-05 for the recalculated reservation).

### Evidence

9. All steps audited (reopen accepted, hold, job cancel, new approval,
   pointer move, obligation recalculation, reservation recalculation);
   customer notified at hold and at resume.

## Consequences

## Positive Consequences

- Production can never run against a stale design (fresh job+spec per
  approval); deposits survive revisions without double-charging.

## Negative Consequences

- Post-approval revisions always cost a new job record and possibly a
  re-acceptance round trip — deliberate friction on an exceptional path.

## Risks and Mitigations

- **Risk:** revision accepted while production start is in flight.
  **Mitigation:** hold transition and production start contend on the order
  row (DB8 race CC-12); start guard re-checks order state in-transaction.
- **Risk:** obligation recalculation errors. **Mitigation:** recalculation
  is reconciliation-record-based, admin-reviewed, DB8-tested.

## Rejected Alternatives

In-place job/spec amendment (breaks immutability + INV-03); mandatory
cancel-and-new-order (destroys deposit/case continuity for a supported
journey J10).

## Deferred Details

- Hold-release TTL, shortfall/surplus rounding rules = policy config
  (CON-144; business sign-off). Reservation-recalc edge policy for
  insufficient stock on resume follows the standard insufficient-stock rule
  (`DB3_LIFECYCLE_SPECIFICATIONS.md` LC-17).

## Implementation Checkpoint

DB4 (pointer/obligation-supersession shapes), backend ordering/production CPs.

## Verification Checkpoint

DB7 (spec immutability), DB8 (revision-vs-start race, recalculation
idempotency).

## Reversal / Migration Cost

Low: behavior is guard/orchestration wiring over already-locked structures.

## References

- `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §10; `docs/03-USER-JOURNEYS.md` J10;
  `docs/07-ADMIN-OPERATIONS.md` §9
- ADR-DB3-001, ADR-DB3-002; DB2 AGG-17 (immutable spec)
