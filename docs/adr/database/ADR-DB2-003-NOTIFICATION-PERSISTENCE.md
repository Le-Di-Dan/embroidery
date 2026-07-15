# ADR-DB2-003 — Notification Persistence Depth

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `f90f78c0cb6891f46874723ae50c3b73de405675`
- Decision IDs: DEC-25
- Requirement IDs: REQ-NOTIF-001/002, REQ-OUTBOX-001/002, REQ-IDEM-001
- Invariant IDs: INV-23, INV-24, INV-14 (evidence linkage)
- Gap IDs: GAP-06

## Context

The architecture mandates a Notification module + worker delivery
(`SYSTEM_ARCHITECTURE §5.4/§8`) for verification, secure-link, review and
payment messages, but no product document defines whether notifications are
persisted (GAP-06/REQ-NOTIF-002 MISSING_REQUIREMENT). Providers/channels are
open (O-005). Payment and secure-link messages are operationally critical —
"did the customer ever get the link?" must be answerable.

## Decision Drivers

- Operational debugging + evidence for critical messages (secure links,
  payment) without persisting secrets.
- Idempotent delivery where duplicates matter (REQ-NOTIF-001).
- Retry/dead-letter visibility (REQ-OUTBOX-002).
- PII/secret minimization (`10 §12`, OTP/token safety).
- Outbox must remain a transport trigger, not a message archive.

## Options Considered

### Option A — Transient only; outbox row is the only trace

### Option B — Persist Notification Intent + Delivery Attempts (no full body)

### Option C — Persist full rendered message history

## Decision

**Option B.** The Notification context persists a **Notification Intent**
(AGG-22) per logical message and an append-only **Delivery Attempt** per
channel try. Message bodies are **not** stored rendered; an intent stores a
template reference + a redacted parameter snapshot.

## Detailed Rules

1. **Concept separation (locked):**
   - **Outbox Event (CON-140, PLT):** transactional trigger from a business
     commit; deleted after processing (transient class).
   - **Notification Intent (CON-130, NTF):** the domain record "system
     decided to notify X about Y via channel Z", with status.
   - **Delivery Attempt (CON-131):** append-only channel/provider result per
     try (bounded retries, dead-letter linkage to CON-143).
   - **Audit Event (CON-150):** separate business evidence; sensitive flows
     may additionally audit "notification requested/delivered" by reference.
2. **Content policy:** intent stores Template Reference (id + template
   version, CON-132) + **Redacted Parameter Snapshot** (CON-133). Secrets are
   structurally excluded: **no OTP codes, no secure-link tokens, no payment
   payloads** are ever persisted in notification records — only opaque
   references (e.g. ChallengeId, GrantId). Recipient = ContactPointId
   reference plus a minimal masked display copy.
3. **Idempotency:** each intent carries a deterministic intent key
   (source event + recipient + template) → duplicate outbox deliveries
   collapse onto one intent (CON-141 namespace `notification.intent`);
   channel sends are idempotent per attempt.
4. **Channel/provider abstraction:** channel is a value (email/SMS/…);
   provider adapters sit behind the notification port; **no provider is
   chosen** (O-005 untouched).
5. **Delivery result:** attempt records outcome, provider message reference
   (opaque), error class; terminal failure → dead-letter visibility.
6. **Retention:** intents + attempts = **operational** class (ADR-DB1-011);
   configurable duration (deferred parameter); nothing here is a commercial
   record — commercial evidence lives in domain records (approval, payment)
   and audit.
7. **Read surface:** admin/ops views only; customers never browse
   notification history.

## Consequences

## Positive Consequences

- "Was the secure link sent? did SMS fail?" answerable without logging
  secrets or bodies.
- Retry/dead-letter behavior becomes observable data, testable at DB8.
- Template-version reference reconstructs *what kind* of message went out
  without storing rendered content.

## Negative Consequences

- Cannot reproduce the exact rendered body of a past message (accepted:
  template version + redacted params is sufficient evidence; full bodies
  would create a PII/secret archive).

## Risks and Mitigations

- **Risk:** parameter snapshots accidentally capture secrets.
  **Mitigation:** structural exclusion (rule 2) — parameters are typed
  references, not free maps; reviewed at DB4; DB7 test asserts no
  secret-shaped fields.
- **Risk:** intent volume growth. **Mitigation:** operational retention class
  with scheduled cleanup (worker), volumes trivial at current scale.

## Rejected Alternatives

- **Option A:** outbox is deleted after processing and carries business
  payloads, not delivery outcomes — no evidence, no retry visibility;
  fails operational debugging for payment/secure-link messages.
- **Option C:** rendered-body archive = maximal PII/secret surface for zero
  additional operational value; contradicts data minimization.

## Deferred Details

- Concrete channels/providers (O-005/DEC-29), template management mechanics,
  operational retention duration, per-namespace idempotency TTL class →
  DB3/DB4 + provider ADR. Safe because the record shapes above are
  provider-agnostic.

## Implementation Checkpoint

DB4 (shapes), DB6 (tables via migrations), notification checkpoint (adapters).

## Verification Checkpoint

DB7 (no-secret assertions), DB8 (duplicate outbox → single intent; retry
races), DB10 (retention cleanup audit).

## Reversal / Migration Cost

Low: dropping to Option A = stop writing records; upgrading to fuller history
= additive columns/records.

## References

- `docs/architecture/SYSTEM_ARCHITECTURE.md` §5.4, §8, §11;
  `docs/development/BACKEND_CONVENTIONS.md` §12, §15, §18
- ADR-DB1-011, ADR-DB1-017; `DB0_CONFLICTS_AND_GAPS.md` GAP-06
