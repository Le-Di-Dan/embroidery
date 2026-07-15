# ADR-DB1-018 — Inventory Reservation Expiry Direction

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-14
- Requirement IDs: REQ-INV-003, REQ-INV-004, REQ-INV-005, REQ-INV-007
- Invariant IDs: INV-05, INV-18, INV-19 (idempotent actions)
- Gap IDs: —

## Context

BR-015/D-016 lock the reservation model's gates (no official reservation at
draft/request; optional soft hold at quotation; official reservation only
after approval + successful deposit) but the expiration periods are open
(DEC-14). DB3 owns the full reservation lifecycle (LC-17); DB1 locks the
architecture so DB2/DB3 can model it without rework.

## Decision Drivers

- Stock accuracy under concurrency (LC-17 flagged critical).
- Expiry must be deterministic, auditable, and configurable — not a magic
  constant in code.
- Idempotent transitions: expiry/release/consume may be retried by workers.

## Options Considered

- Hard-code TTLs now — prohibited (business parameter not locked by any
  source; DB1 must not invent it).
- Implicit expiry (computed on read, no explicit timestamp) — untestable,
  unauditable; rejected.
- **Explicit expiry timestamp + configurable policy + worker sweep**
  (chosen direction).

## Decision

### Locked architecture direction

1. **Soft hold and official reservation are distinct concepts** with
   distinct lifecycles and rules; they are never merged into one row-state
   shortcut. (Soft hold: optional, at quotation. Official: post approval +
   verified deposit — INV-05.)
2. **The official-reservation creation gate is locked** as approval +
   successful (verified) deposit — nothing in DB1–DB10 may weaken it.
3. **Expiry is based on an explicit timestamp/event:** every hold/
   reservation carries an `expires_at` (or an explicit no-expiry marker
   where the business rules say so), set at creation from policy
   configuration — never computed implicitly at read time.
4. **Expiration policy is configuration:** TTLs per reservation kind live in
   versioned, auditable business configuration (same framework as
   ADR-DB1-011/017); changes are audited. **Exact durations are deferred**
   to DB3/business (recorded in the Decision Log when locked).
5. **Release / consume / expire are idempotent actions** — applying one
   twice has no further effect (ledger-append + guarded state transition;
   DB8-tested).
6. **Expiry must not permit negative stock:** expiry releases held quantity
   back; all balance mutations remain subject to the non-negative-stock
   constraint (INV-18) inside explicit transactions with row locking
   (ADR-DB1-009 rule 11).
7. **Manual override requires reason + audit** (`07 §10`): early release,
   extension, or negative-stock override are admin actions with recorded
   actor/reason (INV-14).
8. **Expiry execution:** scheduled worker sweep over explicitly-expired rows
   (Q-25/Q-32 pattern), idempotent, audited — consistent with the cleanup
   ownership model (ADR-DB1-011 rule 6).
9. **Insufficient-stock behavior at approval/deposit time** (what happens
   when stock ran out before the official reservation) is a **DB3 lifecycle
   concern** — explicitly not decided here.

## Consequences

## Positive Consequences

- DB2 can model holds/reservations/ledger without waiting on business TTLs.
- Expiry is testable (set `expires_at`, run sweep, assert) and auditable.

## Negative Consequences

- Reservation rows carry policy-derived state (expires_at) that must be
  kept consistent with configuration changes — rule: config changes affect
  **new** reservations only, existing rows keep their stamped expiry
  (documented for DB3).

## Risks and Mitigations

- **Risk:** TTLs never locked → holds pile up.
  **Mitigation:** deferred-parameter register with DB3 owner + acceptance
  condition; default-safe behavior = soft holds cannot be created without a
  configured TTL (official reservations may be long-lived by design pending
  business rules).

## Rejected Alternatives

- Inventing TTL numbers in DB1; implicit computed expiry; queue-delayed
  expiry messages as the only mechanism (broker still open, DEC-28 — the DB
  timestamp remains the source of truth regardless of future broker use).

## Deferred Details

- **Deferred:** soft-hold TTL, official-reservation expiry/no-expiry rules,
  insufficient-stock lifecycle behavior. **Owner:** DB3 (+ business decision
  for durations). **Why DB2 is safe:** concepts/gates/idempotency semantics
  are locked; only numbers and lifecycle edges remain, both DB3-scoped.

## Implementation Checkpoint

DB4 (shapes), DB6 (constraints), DB9 (sweep job fixtures).

## Verification Checkpoint

DB8 (concurrency: reserve/release/expire races, negative-stock defense).

## Reversal / Migration Cost

Low — direction aligns with the locked business rules; parameters are
config.

## References

- `docs/04-BUSINESS-RULES.md` BR-015; `docs/12-DECISION-LOG.md` D-016
- `docs/07-ADMIN-OPERATIONS.md` §10 (stock override audit)
- `DB0_LIFECYCLE_INVENTORY.md` LC-17; ADR-DB1-009, ADR-DB1-011, ADR-DB1-017
