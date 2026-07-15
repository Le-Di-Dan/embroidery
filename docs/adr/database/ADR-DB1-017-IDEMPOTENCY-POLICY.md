# ADR-DB1-017 — Idempotency Policy Direction

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-15
- Requirement IDs: REQ-IDEM-001, REQ-IDEM-002, REQ-PAY-005, REQ-REQ-004,
  REQ-OUTBOX-002
- Invariant IDs: INV-07, INV-19, INV-24
- Gap IDs: —

## Context

Idempotency is mandatory for payment callbacks, reconciliation, retried
jobs, customer submissions, asset callbacks and duplicate-sensitive
notifications (`BACKEND_CONVENTIONS §12`). Keys and results must be scoped
and expired intentionally (INV-24). Operation-specific TTLs are open.

## Decision Drivers

- Duplicate/out-of-order payment callbacks must never double-apply (INV-07).
- Different operations need different windows — one global TTL is wrong.
- Concurrency: two identical requests racing must resolve to one execution.

## Options Considered

- Per-module ad hoc unique constraints only — covers uniqueness but not
  in-progress semantics or stored-result replay; insufficient alone.
- External cache (Redis) keyed idempotency — adds an unchosen infrastructure
  dependency (queue/broker still open, DEC-28); rejected for the record of
  truth.
- **PostgreSQL-backed idempotency records + DB uniqueness** (chosen) — the
  DB is the arbiter, consistent with the outbox decision.

## Decision

### Model (locked)

1. **Idempotency record** concept keyed by a composite scope:
   `(operation_namespace, scope_key)` with a **unique constraint** — the
   database is the arbiter of "first request wins" (INV-19).
   - `operation_namespace`: stable operation identifier (e.g.
     `payment.callback`, `request.submit`) — constants, not free strings
     (ADR-DB1-008 rule 4 spirit).
   - `scope_key`: the operation's natural key (provider event ID, submission
     key, job ID).
2. **Request fingerprint:** a hash of the canonicalized business-relevant
   payload is stored with the record. Same key + same fingerprint ⇒ replay
   stored result; **same key + different fingerprint ⇒ conflict error**
   (never silent overwrite, never second execution).
3. **Lifecycle states:** `IN_PROGRESS` → `COMPLETED` (result persisted) →
   expired/cleaned. Duplicates arriving while `IN_PROGRESS` receive a
   deterministic "in progress" outcome (retryable signal), not a second
   execution. Crash recovery for stuck `IN_PROGRESS` rows follows the worker
   retry rules (bounded, DB8-tested).
4. **Result persistence:** the stored result is the minimal replayable
   outcome (status + reference IDs / response essence), not full payload
   dumps; sensitive payloads follow redaction rules (`§13/§18`).
5. **Key ownership by operation class:**
   - **Provider callbacks (payments, asset processing):** the key derives
     from **server-side provider references** (event/transaction ID) —
     **never client-supplied-only** input.
   - **Customer submissions:** server-issued or deterministic
     submission key, validated server-side.
   - **Worker jobs:** job ID from the async-job port; handlers are also
     written to be naturally idempotent (re-load state — §15).
6. **TTL classes, not per-key improvisation:** each `operation_namespace`
   maps to a named TTL class in business configuration (ADR-DB1-011
   framework; e.g. payment-callback records live at least as long as the
   order's commercial dispute window — parameter deferred). **Exact TTLs are
   deferred** to DB3/DB4 configuration with business sign-off.
7. **Cleanup:** expired records removed by the scheduled worker cleanup
   pipeline, audited (ADR-DB1-011 rule 6); `transient` class.
8. **Test expectation (DB8):** true-race tests — two concurrent identical
   callbacks, duplicate and out-of-order provider events, replay-after-
   complete, conflict-on-different-fingerprint — all against real
   PostgreSQL (ADR-DB1-016).

## Consequences

## Positive Consequences

- One uniform, DB-arbitrated model for every duplicate-sensitive operation;
  no per-feature reinvention.
- Provider-callback safety does not depend on client behavior.

## Negative Consequences

- An extra write on every idempotent operation (negligible at scale).

## Risks and Mitigations

- **Risk:** fingerprint canonicalization drift.
  **Mitigation:** reuse the canonical-JSON facility direction from
  ADR-DB1-012 for fingerprint input; covered by DB8 fixtures.

## Rejected Alternatives

- Cache-based idempotency as record of truth; client-only idempotency for
  callbacks (explicitly prohibited); global single TTL.

## Deferred Details

- **Deferred:** per-operation TTL values, exact stored-result shapes,
  stuck-`IN_PROGRESS` timeout values. **Owners:** DB3 (policy binding),
  DB4 (record shape), DB8 (verification).
- **Why DB2 is safe:** DB2 places the idempotency record as a cross-cutting
  concept with a designated owner module (ADR-DB1-005 rule 5); numbers are
  not needed. Acceptance: every namespace has a TTL class configured before
  the operation ships.

## Implementation Checkpoint

DB4 (shape), DB6 (table + constraints).

## Verification Checkpoint

DB8 (race/duplicate/out-of-order proofs).

## Reversal / Migration Cost

Low — additive table + conventions.

## References

- `docs/development/BACKEND_CONVENTIONS.md` §12, §13, §15, §18
- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §8; ADR-DB1-011, ADR-DB1-012,
  ADR-DB1-016
