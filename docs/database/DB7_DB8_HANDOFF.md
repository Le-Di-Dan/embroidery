# DB7 → DB8 Handoff

**Compiled:** DB7-CP7. Everything DB7 proved only for a single caller, plus
everything DB7 named but did not build, so DB8 (and whichever phase owns the
application/use-case layer) starts from an explicit list rather than
rediscovering these by reading every guard row again.

DB7's own scope (DEC-DB7-001) is repository-layer persistence, integration
and negative validation — proving a guard holds for **one** transaction.
Proving it holds under **concurrent** transactions is DB8's mandate by the
same decision. Nothing below is a DB7 defect; each row is a guard DB7
implemented and tested single-run, with its race condition identified but
deliberately not resolved here.

## 1. Concurrency races (guard implemented, race unproven)

| CC | Guard | What DB7 proved (single-run) | What DB8 must prove | Tables/arbiter |
|---|---|---|---|---|
| CC-01 | G-DB7-19 — session autosave revision | A stale `autosaveRevision` is rejected as `STALE_WRITE` when read-then-write happens sequentially. | Two concurrent autosaves against the same session don't both read revision N and both "succeed" against a lock-free predicate update. | `design_sessions.autosave_revision` |
| CC-03 | G-DB7-15 — one active design review per case | A second `sendForReview` against the same case hits the partial unique index and maps to `REVIEW_ALREADY_ACTIVE`. | Two concurrent `sendForReview` calls racing the same partial unique — DB7 only proves the second sequential call is rejected, not that a true race can't both pass a pre-check. | `uq_design_versions__case__sent_for_review` |
| CC-05/06 | G-DB7-20 — quotation acceptance binds current/SENT/unexpired version | Re-reads `current_version_id` inside the acceptance transaction; state and expiry checked in-tx. | Concurrent acceptance attempts against the same quotation, and acceptance racing a version being superseded. | `quotation_acceptances`, `quotations.current_version_id` |
| CC-07/08 | G-DB7-32 — provider event idempotent ingestion | A duplicate `(provider, provider_event_ref)` replays via the unique arbiter rather than double-satisfying. | Two concurrent provider callbacks for the same event racing the unique insert — DB7 proves the *second sequential* callback replays correctly, not concurrent-insert behavior under load. | `uq_payment_provider_events__provider__ref` |
| CC-11 | G-DB7-21 — order creation gate | `uq_orders__request` rejects a second sequential order for the same request. | Two concurrent order-creation attempts for the same request racing the unique constraint and the chain-guard read together. | `uq_orders__request` |
| CC-14 | G-DB7-37 — final payment before dispatch | The REMAINING obligation's SATISFIED state is read inside the dispatch transaction. | Dispatch racing a payment settlement that satisfies the obligation mid-check. | `payment_obligations`, `OrderRepository.dispatch` |
| CC-15 | G-DB7-24 — shipping frozen at dispatch | Detail completeness checked, then frozen and snapshotted in one transaction. | Dispatch racing a concurrent shipping-detail edit. | `shipping_details`, `shipping_snapshots` (S24) |
| CC-16 | G-DB7-40 — grant purpose/scope/active/unexpired | Checked inside the operation's own transaction. | An operation racing a grant revocation — "revoke-vs-use". | `secure_access_grants` |
| CC-17 | G-DB7-41 / G-DB7-45 — verification challenge ownership + attempt/rate limits | Challenge ownership and OPEN state checked in-tx; attempt count persisted and read correctly single-run. | Concurrent verification attempts against the same challenge; the *rate policy decision* itself is application-service work layered on this persistence, not built by DB7 at all (see §3). | `contact_verification_challenges` |
| CC-20 | G-DB7-26 — sufficient stock under the row lock | `SELECT … FOR UPDATE` + availability arithmetic correct for one caller. | Oversubscription under genuinely concurrent holds/reservations against the same SKU — the lock-anchor pattern (`sku_stocks` row lock) is designed for this, but DB7 does not run concurrent load against it. | `sku_stocks` (lock anchor) |
| CC-21 | G-DB7-28 — hold → reservation conversion | Conversion and its two ledger entries commit in one transaction, single-run. | Concurrent conversion attempts against the same hold. | `inventory_soft_holds`, `inventory_reservations` |
| CC-22 | G-DB7-27 — official reservation eligibility (deposit SATISFIED) | `ReservationEligibilityGuard` checked in-tx before both `createReservation` and `convertHold` (DB7-CP5). | A reservation attempt racing the deposit obligation being satisfied or cancelled concurrently. | `payment_obligations`, `ReservationEligibilityGuard` |
| CC-25 | G-DB7-55 — outbox exclusive claim | `FOR UPDATE SKIP LOCKED` claim path correct for one worker. | Multiple workers claiming concurrently — the access pattern (ADR-DB5-003) is designed for this; DB7 runs it single-worker only. | `outbox_events` |
| (unlabeled) | G-DB7-52 — idempotency claim per (namespace, scope key) | Claim-or-read inside the caller's transaction; `23505` maps to replay. | Two concurrent callers claiming the same key. | `idempotency_records` |
| (unlabeled) | G-DB7-58 — notification intent claim + attempt append | Claim, attempt-append, settle proven single-run; explicitly "no exactly-once claim is made". | Multiple notification workers claiming concurrently. | `notification_intents` |

## 2. Deferred outbox call sites (from DB7-CP6)

`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` names 20 side effects. DB7 wired exactly
one (SE-006, `order.created`, DEC-DB7-031) to prove the pattern; every other
row is unbuilt application-feature work, not a persistence gap — the
`OutboxEventStore` primitive these would call is fully implemented and
tested (§CP3/CP6), only the calling code does not exist yet.

| SE | Event(s) | Owner context |
|---|---|---|
| SE-001 | `verification.requested` | CUS→NTF |
| SE-002 | `grant.issued` | CUS→NTF |
| SE-003 | `request.submitted` | ORD→NTF/admin |
| SE-004 | `quotation.sent` / `design.review-ready` / `design.revision-requested` | QUO/DSN→NTF |
| SE-005 | `design.approved` | DSN→ORD/NTF |
| SE-007 | `payment.verified` / `payment.failed` | PAY→ORD/NTF |
| SE-008 | `inventory.reserved` / `released` / `expired` | INV→ORD/ops |
| SE-009 | `production.started` / `completed` | PRD→ORD/NTF |
| SE-010 | `payment.final-requested` | ORD→NTF |
| SE-011 | `order.dispatched` | ORD→NTF |
| SE-012 | `order.cancelled` / `request.rejected` | ORD→NTF |
| SE-013/014 | asset inspection/derivative/deletion worker jobs | AST→worker |
| SE-015 | scheduled sweeps (session cleanup, quote/reservation/grant expiry, idempotency/outbox cleanup) | worker |
| SE-016 | `admin.security-alert` | IDN→NTF |
| SE-018 | analytics emission | PLT |
| SE-020 | `order.on-hold` / `order.resumed` | ORD→NTF |

SE-017 (the outbox relay mechanism) and SE-019 (audit, in-tx by design) are
not call sites — DB7 already proves both (`OutboxEventStore.claimBatch` and
`AuditEventRepository.append` respectively).

## 3. Application-layer work DB7 does not build

- **No use-case/application-service layer exists.** DB7 is the repository
  layer only; every guard above that reads "the rate *policy decision* is an
  application-service concern" (G-DB7-45) or depends on an event actually
  being published (§2) needs that layer built first.
- **`apps/worker` is a bootstrap shell.** It shares the persistence runtime
  with the API (proven in CP1/CP6) but has no job consumer, no outbox
  claim/dispatch loop, and no notification-sending logic. Wiring it to
  actually drain `OutboxEventStore.claimBatch` / `NotificationIntentRepository.claimBatch`
  is unbuilt, not broken.
- **No queue/broker is chosen** (`CLAUDE.md` §8, open decision). The outbox
  and idempotency tables are provider-agnostic by design so this choice can
  be made later without a schema change.

## 4. Non-blocking documentation discrepancies carried forward (DEC-DB7-002)

`DB_ROADMAP.md` labels DB9 "Seed & Fixture Design" and DB10 "Database
Acceptance Audit"; `DB6_DB7_DB10_HANDOFF.md` §3/§4 assign DB9 = measured
performance and DB10 = backup/retention/durability. DB7 did not start DB8,
DB9 or DB10 work either way, so this is flagged for whichever phase owns
that renumbering, not resolved here.
