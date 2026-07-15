# DB2 — Data Classification Map

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Nature:** Conceptual authorization/retention classification. No
authorization code, roles, or column design (DB4+ / security checkpoints).

Classes: `public` · `internal` · `customer-private` (cpriv) ·
`security-sensitive` (sec) · `financial` (fin) · `production-sensitive`
(prod) · `mixed`. "Read/mutate" = via owning module contracts (ADR-DB1-009);
Admin = the single admin through authorized admin surfaces; Customer =
grant-scoped secure flow only (INV-08). Export = customer-facing
download/export surface. Audit column = actions on it must be audited
(INV-14). Backup sensitivity: everything is inside the encrypted/
access-controlled backup (ADR-DB1-014); `high` marks concepts whose leakage
is most damaging. Redaction = fields needing structural redaction in
logs/records.

| Concept group | Class | Read | Mutate | Snapshot receivers | Export? | Public URL? | Audit? | Retention | Backup sens. | Redaction concerns |
|---|---|---|---|---|---|---|---|---|---|---|
| Admin account/credential/session (CON-001..003) | sec | Admin | IDN | — | no | no | yes | comm/oper | high | credential material never logged |
| Customer + contacts (CON-010/011) | cpriv | Admin; Customer (own, via grant); modules via contracts | CUS | approval/order contact snapshots | no | no | yes (merge/link/anonymize) | comm + anonymize | high | contact values masked in logs; masked id in watermark only |
| Business Profile (CON-012) | cpriv | Admin | CUS | — | no | no | yes | comm | med | tax/business ids |
| Verification challenge/attempts (CON-013/014) | sec | CUS internal | CUS | — | no | no | yes (result) | transient | high | OTP/secret never persisted outside challenge store; never in notifications |
| Secure grant + token (CON-015/016) | sec | validation service | CUS | — | no | no | yes (issue/revoke) | oper | high | token secret hashed/opaque; never logged |
| Catalog (CON-020..029) | public (base price fin-adjacent) | everyone | CAT (Admin) | quotation/order display snapshots | n/a (public) | yes (public derivatives) | yes (changes) | comm/archive | low | — |
| SKU stock/ledger/holds/reservations (CON-030..036) | internal | Admin; availability projection public | INV | — | no | no | yes (stock changes, overrides) | comm (ledger) / oper (holds) | med | — |
| Asset — customer uploads | cpriv | owner customer (grant), Admin | AST | — | no (originals never) | no; short-lived signed URLs only | yes (access-relevant) | per category + tombstone | high | storage keys never exposed |
| Asset — store templates/originals | prod | Admin/internal | AST | — | **never** (BR-011) | no | yes | comm | high | |
| Asset — public product/gallery derivatives | public | everyone | AST | — | n/a | yes (derivatives only) | no | comm | low | |
| Design session + document (CON-050..052) | cpriv | session holder; Admin (submitted context) | DSN | — | no | no | cleanup tracked | transient | med | document content is customer IP |
| Design case/versions/reviews (CON-053..055) | cpriv | Admin; Customer via grant | DSN | — | **no export ever** (INV-21) | no; watermarked previews via signed access | yes (create/send/decision) | comm | high | |
| Approval snapshot (CON-056) | cpriv+fin | Admin; Customer (own); ORD/PAY/PRD contracts | nobody (immutable) | ORD, PRD | no | no | yes (creation) | comm | high | contact snapshot inside |
| Design template (CON-057) | internal source / public listing | listing public; source Admin | DSN | clone copies to sessions | no | listing images yes (derivatives) | yes | archive | med | |
| Custom request + COP + moderation (CON-070..074) | cpriv | Admin; Customer via grant | ORD | — | no | no | yes (moderation, transitions) | comm + anonymize | med | notes may contain PII |
| Order + items + transitions (CON-076/077/081/082) | fin | Admin; Customer via grant (own) | ORD | — | no | no | yes (transitions) | comm | high | |
| Shipping detail (CON-078..080) | cpriv+fin | Admin; Customer (own view) | ORD (until dispatch) | frozen at dispatch | no | no | yes | comm + anonymize | high | address PII |
| Quotation + versions (CON-090..096) | fin | Admin; Customer via grant | QUO | ORD (accepted) | no (view only) | no | yes (send/accept) | comm | high | |
| Payment obligations/attempts (CON-100/101/106) | fin | Admin; Customer (own status) | PAY | — | no | no | yes (state changes) | comm | high | amounts fine; provider payloads redacted |
| Callback/reconciliation/refund records (CON-102/104/105) | fin+sec | Admin (safe view `07 §8`) | PAY (append) | — | no | no | yes | comm | high | provider payloads stored redacted (REQ-PAY-007) |
| Production job/spec/notes/artifacts (CON-110..113) | prod | Admin/internal | PRD | — | **never** | no | yes (start/complete) | comm | high | production files strictly internal |
| Gallery (CON-120/121) | public | everyone | GAL | — | n/a | yes | yes (publish) | archive | low | location context legitimacy (`08 §6`) |
| Content pages/redirects (CON-125/126) | public | everyone | CNT | — | n/a | yes | yes | archive | low | — |
| Agreements + versions (CON-127..129) | public (versions evidentiary) | everyone | CNT (versions immutable) | approval refs | n/a | yes | yes (publish) | comm | med | — |
| Notification intents/attempts (CON-130..133) | cpriv (minimal) | Admin/ops | NTF | — | no | no | evidence link | oper | med | **no OTP/tokens/bodies**; params redacted by construction |
| Audit events (CON-150) | internal | Admin | append only | — | no | no | is the audit | audit class | high | before/after metadata redaction rules (BACKEND_CONVENTIONS §18) |
| Outbox/idempotency/job records (CON-140..143) | internal | ops | PLT | — | no | no | no (operational) | transient/oper | med | payload minimization; no secrets in outbox payloads |
| Policy configuration (CON-144) | internal | all modules read | PLT (admin, audited) | — | no | no | yes | comm | med | — |
| Read models (CON-170..176) | internal (admin) / public (sitemap) | per model | none | — | no | sitemap yes | no | n-a | low | derived only |

## Cross-cutting rules

1. **No customer export surface exists** for any design/production/original
   asset class (BR-011, INV-21, E2E-09).
2. **No permanent public URL** is ever stored as authority (INV-10); public
   access = public derivatives; private access = short-lived signed URLs.
3. **Customer reads are always grant-scoped** (INV-08); the classification
   "Customer (own)" never means account-wide browsing (no portal exists).
4. Log/audit redaction: provider payloads, tokens, OTP, storage keys, full
   contact values — structurally redacted (BACKEND_CONVENTIONS §17/§18).
5. Retention classes bind per ADR-DB1-011; durations deferred (O-008/O-012).
