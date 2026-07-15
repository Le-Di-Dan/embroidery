# DB2 Decision Record — Analytics Event Storage (GAP-11)

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c` · **Status:** Accepted
**Gap:** GAP-11 · **REQ:** `08 §8` analytics readiness (Q-33) · Related: REQ-OUTBOX-001, REQ-AUDIT-001

## Options considered

- **Option A — No application-DB analytics storage; external emission only.**
- **Option B — Durable minimal product-analytics event table in PostgreSQL.**
- **Option C — Outbox as emission source; external analytics system authoritative.**

## Decision

**Option C (with Option A's storage stance).** The application database is
**not** a system of record for product analytics.

## Rules

1. **No analytics event table** in the application PostgreSQL (CON-180 is an
   emission boundary, not a stored concept).
2. **Emission path:** analytics-relevant domain events (product view is
   client-side; submit/approval/deposit/completed etc. are server-side
   domain events) may be emitted through the existing outbox → worker →
   external analytics adapter once a tool is selected (**tool deferred**,
   `08 §8`; no vendor chosen here). Client-side events (page/product views,
   Zalo/Messenger clicks) go directly to the future tool, never through the
   application database.
3. **Failure behavior:** analytics delivery is fire-and-forget at the
   business level — a failed/absent analytics emission never blocks, retries
   into, or rolls back a business transaction; if no external tool is
   configured, server-side emissions are simply skipped (no buffering
   obligation, no dead-letter requirement for analytics).
4. **Audit Events are NOT analytics** and are not reused as an analytics
   source of record: audit exists for business traceability with its own
   retention (INV-14/REQ-AUDIT-003); analytics aggregation reading audit data
   is prohibited as a pattern (different purpose, PII exposure risk).
5. **PII:** emitted analytics events carry pseudonymous/aggregate identifiers
   only — no contact data, no customer PII, no design content (`10 §12`).
6. **MVP need check:** `08 §8` requires *readiness to measure*, not durable
   in-app event history; counts surfaced on the admin dashboard (Q-22) come
   from domain state (requests/orders by status), not from an event store.
7. **Future readiness / reversal trigger:** if the business later requires
   in-app durable metrics (e.g. conversion history independent of the
   external tool), Option B becomes a new decision record + DB4 addition —
   additive, nothing here precludes it.

## Rationale

At <100 orders/month, a durable event stream in the transactional database is
pure liability (PII surface, retention burden, growth) with zero current
consumer. The outbox already provides a reliable post-commit emission point
for the server-side events; the external tool (deferred) is the correct
system of record for behavioral analytics.

## Rejected

- **Option B:** storage/retention/PII cost without a consumer; dashboard
  needs are met by domain-state queries.
- **Pure Option A (no server emission path):** would force the future tool to
  reconstruct business events from client-side signals only — the outbox
  emission path costs nothing now and keeps server-truth events available.

## Handoff

- Analytics tool selection + adapter → future ADR (outside DB phase).
- DB4/DB5: **no** analytics tables/queries to design.
- DB3: none (no lifecycle).
