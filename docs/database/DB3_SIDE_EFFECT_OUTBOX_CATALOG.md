# DB3 — Side Effect & Outbox Catalog

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Rules:** external effects never inside a DB transaction (INV-23); every
after-commit effect rides an outbox event; consumers idempotent
(at-least-once). Types: `in-tx` · `after-commit` (outbox) · `external`
(provider call from worker) · `scheduled` (worker sweep). Retry direction:
bounded + backoff + dead-letter (counts = config, deferred values). No
queue/provider chosen. Redaction per ADR-DB2-003/`§13/§18` — no OTP, tokens,
provider payload bodies in outbox payloads or notification params.

| SE | Trigger (TR) | Type | Owner | Outbox intent / job | Idem key scope | Failure/compensation | Audit/observability | Sensitive/redaction | Notification relation |
|---|---|---|---|---|---|---|---|---|---|
| SE-001 | TR-LC02-01 challenge issued | after-commit → external | CUS→NTF | `verification.requested` | `notification.intent` per (challenge) | retry; expiry bounds usefulness | issue audited | **secret chỉ ở challenge store**, message tham chiếu ChallengeId | intent per ADR-DB2-003 |
| SE-002 | TR-LC03-01 grant issued (submission/reissue) | after-commit → external | CUS→NTF | `grant.issued` (secure link) | per (grant) | retry; reissue = new intent | audited | link token never persisted in intent | yes |
| SE-003 | TR-LC11-01 request submitted | after-commit | ORD→NTF/admin | `request.submitted` (admin alert + customer confirm) | per (request) | retry | audited | contact masked in ops views | yes |
| SE-004 | TR-LC12-02 quotation sent / TR-LC08-02 version sent / TR-LC08-03 revision requested | after-commit | QUO/DSN→NTF | `quotation.sent` / `design.review-ready` / `design.revision-requested` | per (version) | retry | audited | amounts OK; no doc content | yes |
| SE-005 | TR-LC08-04 approved | after-commit | DSN→ORD/NTF | `design.approved` (→ order creation trigger + confirmation) | per (approval snapshot) | order-creation failure → admin alert (approval stands; order retried idempotently) | critical audit | — | yes |
| SE-006 | TR-LC14-01 order created | after-commit | ORD→NTF | `order.created` + payment instructions | per (order, deposit) | retry | audited | no provider secrets | yes |
| SE-007 | TR-LC16-03/04 payment result | after-commit | PAY→ORD/NTF | `payment.verified` / `payment.failed` | per (provider event) | contradiction → REQUIRES_REVIEW path | critical audit | provider refs redacted in messages | yes |
| SE-008 | TR-LC17-04/06/07 reservation events | after-commit | INV→ORD/ops | `inventory.reserved/released/expired` | per (reservation, action) | insufficient-stock alert path (LC-17) | audited | — | admin alert only |
| SE-009 | TR-LC18-02/03 production start/complete | after-commit | PRD→ORD/NTF | `production.started/completed` | per (job, action) | retry | audited | — | yes |
| SE-010 | TR-LC14-05 final payment requested | after-commit | ORD→NTF | `payment.final-requested` | per (order) | retry | audited | — | yes |
| SE-011 | TR-LC14-07 dispatched/delivered | after-commit | ORD→NTF | `order.dispatched` | per (order) | retry | audited | address not in payload (refs only) | yes |
| SE-012 | cancellation saga steps / TR-LC11-10 | after-commit | ORD→NTF | `order.cancelled` / `request.rejected` (+customer-visible reason) | per (case, saga) | saga resumable | audited R | reason text reviewed | yes |
| SE-013 | TR-LC06-01/03 asset uploaded/accepted | after-commit → external | AST→worker | inspection job / derivative jobs (mockup, watermark, normalize) | per (asset, job kind, attempt) | bounded retries → dead-letter | inspection audited | binaries via storage port only | no |
| SE-014 | TR-LC06-05 deletion decided | after-commit → external | AST→worker | binary-delete job (two-phase tombstone) | per (asset) | retry until confirmed; tombstone only after confirm | audited | — | no |
| SE-015 | scheduled sweeps | scheduled | worker | session cleanup (TR-LC07-04/05), quote expiry (TR-LC12-05), reservation/hold expiry (TR-LC17-03/07), grant expiry (TR-LC03-03), idempotency/outbox cleanup | batch keys per sweep window | idempotent re-run | cleanup counts audited (operational) | — | quote-expiry notice optional |
| SE-016 | TR-LC01-01 admin security events | after-commit | IDN→NTF | `admin.security-alert` | per (event) | retry | audited | no credential material | yes |
| SE-017 | TR-LC22-02 outbox relay | external (the mechanism) | PLT | dispatch to consumers | GRD-029 claim | bounded retry → DEAD_LETTER | dead-letter alert | payload minimization rule | feeds NTF |
| SE-018 | TR-LC14-08 completed / key funnel events | after-commit → external | PLT | analytics emission (submit/approve/deposit/complete) | per (event) | **fire-and-forget: failure never blocks/compensates business** (GAP-11 decision) | none required | pseudonymous only, no PII | no |
| SE-019 | audit append | **in-tx** | AUD | (not outbox — audit row written in the owning use-case tx) | n/a | tx failure = whole use case fails | is the audit | redaction per `§18` | no |
| SE-020 | TR-LC14-09/10 hold/resume | after-commit | ORD→NTF | `order.on-hold` / `order.resumed` | per (order, action) | retry | audited R | — | yes |

**In-tx vs after-commit rule (locked):** duy nhất audit rows (SE-019) và
outbox enqueue là side effect in-transaction; mọi effect còn lại
after-commit qua outbox. Notification Intents được tạo bởi NTF consumer từ
outbox events (intent-key dedup) — outbox không bao giờ là notification
history (ADR-DB2-003).
