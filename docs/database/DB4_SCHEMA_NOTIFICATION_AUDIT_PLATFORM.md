# DB4 — Context Schema: Notification, Audit & Platform (CTX-NTF / CTX-AUD / CTX-PLT)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-070..077.

## 1. Structures

| Table | Role |
|---|---|
| `notification_intents` (TBL-070) | one logical message: unique intent key, template ref (id + version), channel, recipient ref + masked copy, redacted jsonb params, intent lifecycle |
| `notification_delivery_attempts` (TBL-071) | append-only per-try outcomes (DELIVERED/FAILED_RETRYABLE/FAILED_TERMINAL) |
| `audit_events` (TBL-072) | append-only business-action evidence: actor kind + typed refs, action, justified polymorphic target, reason [R]-classed, jsonb summary, mandatory correlation id, failure_code for attempted-invalid audits |
| `outbox_events` (TBL-073) | transactional outbox: immutable jsonb payload + schema version + justified polymorphic aggregate ref; **column-scoped mutable dispatch metadata** (status/attempts/claim/dispatch columns) |
| `idempotency_records` (TBL-074) | (namespace, scope_key) unique claim + fingerprint + IN_PROGRESS/COMPLETED + minimal jsonb result + expiry |
| `background_job_attempts` (TBL-075) | append-only worker attempt outcomes; FAILED_TERMINAL rows are the dead-letter representation (manual requeue = new job) |
| `policy_configurations` + `policy_configuration_versions` (TBL-076/077) | versioned, audited business configuration (CON-144): TTLs, retention durations, retry budgets, deposit percent, refund stage defaults, agreement type set, code formats — **values remain deferred business decisions; the storage home is now fixed** |

## 2. Modeling assertions (task §15.7)

1. **Notification ≠ Outbox:** intents are NTF domain records created by the
   outbox consumer with intent-key dedup (CST-047, GRD-012); outbox rows
   are transport triggers cleaned after processing; the intent's
   `source_outbox_event_id` is nullable by design (REL-101).
2. **No secrets:** no OTP/token/secure-link URL/full body anywhere —
   `params` are typed references + masked recipient (ADR-DB2-003; D7-12
   asserts no secret-shaped fields); delivery attempts store opaque
   provider message refs + error classes only.
3. **Attempts append-only** (CST-098): retry = new attempt; one active
   attempt per channel per intent is the worker claim rule (CC-26, D8-16);
   manual resend = new intent.
4. **Audit append-only and not business history:** CST-098 trigger; Tier
   A/B structures carry domain history (ADR-DB4-002); audit stores refs +
   summaries only, written in the owning use-case transaction (SE-019).
   The polymorphic (target_kind, target_id) is the explicitly justified
   audit-target exception (REL-103); reason-required classes per the DB3
   audit spec are App-enforced with D7-10 tests.
5. **Outbox payload immutable; bounded mutable metadata:** CST-099
   column-list trigger; exclusive claim uses the skip-locked direction
   (GRD-029 → DB6 spike; D8-17); bounded retries → DEAD_LETTER with admin
   visibility; processed rows hard-deleted per transient retention.
6. **Idempotency representable end-to-end:** unique scope (CST-048),
   fingerprint conflict (GRD-030/CST-125), deterministic in-progress
   behavior via `status` + `claimed_at` (stuck-IN_PROGRESS timeout =
   config), result replay from minimal jsonb, `expires_at` per TTL class;
   cleanup sweep audited.
7. **Config versioned/audited:** every value change = new immutable
   version row with reason + admin actor (CST-098-family immutability via
   CST-090-style version freeze — versions are immutable rows);
   consumers read the effective version via the current pointer; secrets
   never live in config values.

## 3. State & history

Intent lifecycle + LC-22/23 states = text + CHECK (CST-060); history =
Tier B (attempts, job attempts) / operational status columns. Retention:
intents/attempts/job-attempts operational; outbox/idempotency transient
(hard-TTL after processed/expired); audit = audit class; config = commercial.
