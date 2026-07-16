# ADR-DB4-002 — Transition-History Storage

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `a79f5235fd35f76076148cfc53a3eb18f538730b`
- Decision IDs: — (DB4-owned modeling decision)
- Requirement IDs: REQ-ORD-003, REQ-SHIP-004, REQ-AUDIT-001..003,
  REQ-PROD-004
- Invariant IDs: INV-14 (audited transitions), INV-25 (referential
  integrity)
- Gap IDs: —

## Context

DB3 defines 29 lifecycles with ~90 transitions and requires state-change
timestamps "qua transition events" (DB3_DB4_HANDOFF §3). The audit log is
locked as evidence, **never a substitute for domain history** (DB3 audit
rule 4; DB2 §8.6). DB4 must decide where transition history physically
lives: per-context tables, one shared table, or a hybrid.

## Decision Drivers

- Business history must not exist only in Audit (task §8.6).
- FK integrity: a transition row must reference its aggregate with a real
  FK, which a single global weakly-typed table cannot provide.
- Module ownership: a context must own its history rows (ADR-DB1-009).
- Not every lifecycle needs a dedicated table — several DB3 lifecycles are
  *already* historized by their own immutable/append-only structures.
- Queryability: admin views read "what happened to this order" frequently
  (Q-15, Q-21, Q-29 adjacent).

## Options Considered

1. **One transition table per aggregate/lifecycle (29 tables)** — maximal
   uniformity, but duplicates history that version rows / ledger / attempt
   records already carry; table sprawl with no reader.
2. **One shared transition table** (`entity_type`, `entity_id`, from, to) —
   loses FK integrity and module ownership; prohibited weak polymorphism
   for a core concern (task §8.3).
3. **Hybrid (chosen):** dedicated typed transition tables where the
   lifecycle is fulfillment-critical and has no structural history of its
   own; structural history (immutable versions, append-only records)
   recognized as the transition history where it already exists; audit as
   cross-cutting evidence on top.

## Decision

**Hybrid, three tiers.** Every one of the 29 DB3 lifecycles is assigned to
exactly one tier in
[`DB4_STATE_AND_TRANSITION_STORAGE.md`](../../database/DB4_STATE_AND_TRANSITION_STORAGE.md).

### Tier A — Dedicated append-only transition tables (typed, FK-integral)

| Table | Covers |
|---|---|
| `custom_request_transitions` (TBL-042) | LC-11 request states incl. cancellation |
| `order_transitions` (TBL-045) | LC-14 order states, LC-19 delivery/freeze events, LC-21 saga step events, hold/resume (CON-081) |
| `production_job_transitions` (TBL-063) | LC-18 job states incl. rework cancellation |

Rules: `bigint` identity PK (ADR-DB1-007 cat. 2); NOT NULL FK to the owning
aggregate; `from_status`/`to_status` text; actor columns (`actor_kind` +
`admin_id`/`customer_id`+`grant_id`/`system_job_key`); `reason` nullable
with required-with-R app enforcement + DB7 tests; separate
`customer_visible_reason` where DB3 requires; `correlation_id` NOT NULL;
append-only reject-mutation trigger (ADR-DB1-010).

### Tier B — Structural history (existing immutable/append-only rows ARE the history)

| Lifecycle | History structure |
|---|---|
| LC-08/09 Design Version + Review | immutable `design_versions` rows (state timestamps `sent_at`/`approved_at`/`superseded_at`/`voided_at`) + append-only `design_reviews` |
| LC-12/13 Quotation | immutable `quotation_versions` rows + append-only `quotation_acceptances`; header state derivable from version facts |
| LC-15/16/20 Payment | append-only `payment_provider_events` + `payment_reconciliations` + `refunds` rows + obligation/attempt state timestamps |
| LC-17 Inventory holds/reservations | append-only `inventory_ledger_entries` (every state change writes a reasoned ledger entry) + hold/reservation state timestamps |
| LC-02 Verification | append-only `contact_verification_attempts` + challenge state timestamps |
| Customer merge | append-only `customer_merge_events` |
| Notification | append-only `notification_delivery_attempts` + intent state timestamps |
| LC-06 Asset | append-only `asset_inspections` + asset/derivative state timestamps |
| LC-22/23 Outbox / Idempotency | operational status columns + `background_job_attempts`; transient rows, no business history requirement |

Rationale: adding parallel transition tables here would duplicate rows that
are already append-only, immutable and FK-integral.

### Tier C — State + timestamps + audit only (low-criticality administrative lifecycles)

Publication lifecycles (product/category/gallery/content/template,
agreement versions), admin account/session, design session, secure grant,
shipping detail EDITABLE→FROZEN (the freeze itself is recorded as an
`order_transitions` event in the dispatch transaction; shipping edits are
audited with before/after summaries per DB3 audit spec). These carry
explicit state timestamps (`published_at`, `archived_at`, `revoked_at`,
`frozen_at`, …) and audited transitions; a replayable event stream adds no
business value (no requirement reads it).

### Cross-cutting rules (locked)

1. Audit events (SE-019) are still written for every audited transition —
   evidence with refs, never the only history for Tier A/B lifecycles.
2. Tier A tables are written **in the same transaction** as the state
   change (one transition row per state change, including saga steps).
3. No global `transitions` table; no `entity_type/entity_id` transition
   rows anywhere.
4. DB7 verifies append-only behavior; DB8 scenarios assert exactly-one
   transition row per winning state change (no duplicates on replay —
   idempotent transitions replay without new rows).

## Consequences

### Positive

- Fulfillment history (request/order/production) is first-class, typed,
  FK-checked and queryable; no duplication of already-historized records.
- 3 new tables instead of 29.

### Negative

- Two lookup patterns for history readers (dedicated table vs structural
  records) — documented per lifecycle in the state-storage map.

## Rejected Alternatives

Per-lifecycle tables (sprawl/duplication); single shared table (weak
polymorphism, no FK, ownership leak); audit-only (violates locked audit
rule 4).

## Deferred Details

- None structural. Saga-state table remains optional per DB3 (not created;
  saga resume derives from `order_transitions` step events + aggregate
  states).

## Implementation / Verification Checkpoints

DB6 (tables + append-only triggers) · DB7 (append-only, reason-required) ·
DB8 (replay/no-duplicate rows).

## Reversal / Migration Cost

Low — tiers are additive; promoting a Tier C lifecycle to Tier A later is a
new table.

## References

- `docs/database/DB3_AUDIT_SPECIFICATION.md` (rule 4);
  `docs/database/DB3_DB4_HANDOFF.md` §2/§3; ADR-DB1-007, ADR-DB1-010
