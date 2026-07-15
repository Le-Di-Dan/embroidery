# DB0 — Conflicts and Gaps

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Purpose:** Surface document conflicts and gaps that affect database design. DB0 proposes decision questions but does **not** answer them.

---

## 1. Columns

Each entry: `GAP-<nn>`, related sources, description, database impact, whether a
user decision is required, resolution owner (checkpoint), and a proposed
decision question (unanswered).

## 2. Conflicts

### GAP-01 — Provisional lifecycle state names vs "final names in technical design"

- **Sources:** `06 §3/§5/§6/§7` (provisional state lists) vs `06 §3` note
  "Final names will be decided in technical design".
- **Description:** Request/version/quotation/payment/order states are given as
  *suggested conceptual* names, explicitly not final.
- **DB impact:** Enum/status modeling (DEC-05) and every lifecycle table depend
  on final names.
- **User decision required:** Yes (naming + any state additions/removals).
- **Owner:** DB3 (with enum strategy locked at DB1).
- **Proposed question:** *"Are the provisional state names in doc 06 accepted
  as-is, and are any missing states (e.g. paused, on-hold, rework) required?"*

### GAP-02 — PostgreSQL version: Compose pin vs Decision Log

- **Sources:** `docker-compose.dev.yml` (`postgres:16.6-alpine`) vs
  `12 D-025` (locks "PostgreSQL" with no version).
- **Description:** The engine version is de-facto set in Compose but not
  documented as a locked decision; multi-machine parity needs one version.
- **DB impact:** Feature availability (e.g. version-specific SQL), reproducible
  environments across machines (DEC-03).
- **User decision required:** Yes (confirm/lock a version).
- **Owner:** DB1.
- **Proposed question:** *"Which PostgreSQL major/minor version is locked for
  all environments — is `16.x` (currently `16.6`) confirmed?"*

### GAP-03 — Design approval vs quotation acceptance ordering

- **Sources:** `03 J4` (customer reviews quotation early) vs
  `03 J6` + `04 BR-005` (deposit only after **design** approval); `06 §5/§8`.
- **Description:** The relative order of quotation acceptance and design
  approval — and which one gates digitizing/production — is not unambiguous.
- **DB impact:** Request/order/quotation/payment state machines and their
  preconditions (LC-11, LC-12, LC-14, LC-15).
- **User decision required:** Yes.
- **Owner:** DB3 (DEC-16).
- **Proposed question:** *"Must a quotation be accepted before digitizing
  starts, and is design approval always the gate for the 40% deposit
  regardless of quotation acceptance timing?"*

### GAP-04 — Cancellation/refund policy incomplete

- **Sources:** `06 §11` ("Cancellation policy details remain a business decision
  to refine") + `07 §8`; open item `12 O-009`; `03 J10` deposit handling
  "follows business policy configured for the case".
- **Description:** What happens to deposit, inventory, and in-progress
  production on cancellation at each stage is undefined; deposit reuse on
  re-approval undefined.
- **DB impact:** Cancellation/refund transitions (LC-20, LC-21), money handling,
  inventory release.
- **User decision required:** Yes.
- **Owner:** DB3 (DEC-22).
- **Proposed question:** *"For cancellations before deposit / after deposit /
  during production, what is the deposit, refund, and inventory outcome — and is
  a prior deposit reusable when a post-approval revision creates a new version?"*

## 3. Gaps (under-specified for database design)

### GAP-05 — Shipping address / history model under-specified

- **Sources:** `01 §10`, `07 §11`, `11` (no shipping-address term).
- **Description:** Recipient details and carrier/tracking are entered by Admin,
  but the address model (single vs history, per-order vs per-customer) is not
  defined.
- **DB impact:** Order/shipping table shape; retention of PII addresses.
- **User decision required:** Partial (default single per-order is reasonable).
- **Owner:** DB2 (DEC-24).
- **Proposed question:** *"Is a single shipping address per order sufficient, or
  is a reusable per-customer address book / address history required?"*

### GAP-06 — Notification persistence depth unspecified

- **Sources:** `SYSTEM_ARCHITECTURE §5.4,§8` (Notification module/worker) — no
  product doc defines whether notifications are persisted.
- **Description:** Whether a notification log/table exists (and its retention)
  is not stated.
- **DB impact:** Presence and shape of a Notification aggregate; retention.
- **User decision required:** Partial.
- **Owner:** DB2 (DEC-25).
- **Proposed question:** *"Should notification deliveries be persisted (auditable
  log) or treated as transient side effects?"*

### GAP-07 — Backup/restore runbooks are reserved stubs while backup is mandated

- **Sources:** `10 §9`, `09 §11`, `13 §4` (backup/off-site/restore-test
  mandatory) vs `infrastructure/backup/README.md` = "Reserved".
- **Description:** Backup/restore are hard requirements but no procedure, tool,
  or runbook exists yet.
- **DB impact:** Recovery guarantees, restore compatibility, multi-machine data
  recovery.
- **User decision required:** Yes (tool/format, off-site target).
- **Owner:** DB1 (strategy: DEC-11/DEC-12), DB10 (runbooks RB-04/RB-05).
- **Proposed question:** *"What backup tool/format and off-site destination are
  chosen, and what is the restore-test cadence?"*

### GAP-08 — Design template ownership & structure undefined

- **Sources:** `01 §2.2` ("gợi ý mẫu thiết kế"); `11` has no template term.
- **Description:** Template suggestions exist but ownership (catalog vs design),
  structure, and whether they reuse the design-document schema are undefined.
- **DB impact:** Which module/aggregate owns templates; asset privacy.
- **User decision required:** Partial.
- **Owner:** DB2.
- **Proposed question:** *"Are design templates store-authored design documents
  owned by the Design module, and are they per-product or global?"*

### GAP-09 — Terms/agreement versioning source undefined

- **Sources:** `06 §9` approval snapshot includes "Terms version accepted"; no
  document defines where terms versions live.
- **Description:** Approval snapshot references an accepted terms version, but
  the terms/agreement entity is not described anywhere.
- **DB impact:** A Terms/Agreement version entity is implied but unspecified.
- **User decision required:** Yes.
- **Owner:** DB2/DB3.
- **Proposed question:** *"Where do legal/terms versions live, and how is the
  accepted terms version referenced by an approval snapshot?"*

### GAP-10 — Stitch count as pricing input has no captured source

- **Sources:** `01 §6`, `04 BR-004` (stitch count is a pricing input) vs `00 §8`
  / `02 §2` (no automatic digitizing / stitch simulation in scope).
- **Description:** Stitch count is a manual quotation input; since digitizing is
  manual and there is no stitch engine, the value is admin-entered. Not a hard
  conflict, but the data source (manual entry) should be explicit to avoid
  implying a computed field.
- **DB impact:** Stitch count stored as a manual quotation input, not derived.
- **User decision required:** No (clarification only).
- **Owner:** DB4 (model as manual input on quotation).
- **Proposed question:** *"Confirm stitch count is an admin-entered quotation
  input, not a system-computed value."*

### GAP-11 — Analytics event storage vs "tool deferred"

- **Sources:** `08 §8` (analytics readiness: product view, submit, approval,
  deposit, completed) vs `08 §8` "Tool selection is deferred".
- **Description:** Analytics readiness is required but whether events are
  persisted in PostgreSQL or emitted to an external tool is undefined.
- **DB impact:** Possible event table(s) vs no persistence.
- **User decision required:** Partial.
- **Owner:** DB2 (likely out of DB scope → external tool).
- **Proposed question:** *"Are analytics events persisted in the application
  database, or emitted only to an external analytics tool?"*

### GAP-12 — Re-verification triggers unspecified

- **Sources:** `09 §2` ("Sensitive actions may require re-verification") — which
  actions is not listed.
- **Description:** Approval/payment may need re-verification, but the trigger
  set is undefined.
- **DB impact:** Verification records tied to specific actions; grant lifecycle.
- **User decision required:** Yes.
- **Owner:** DB3 (DEC-26).
- **Proposed question:** *"Which customer actions (approve, pay, change contact)
  require step-up re-verification?"*

## 4. Deprecated / stale-source watch

No deprecated documents were found; all product docs are marked *Approved
baseline* and architecture/backend docs are v0.2.0 baselines. The only stale
risk is the **design/UI docs** (`docs/design/*`) being mistaken for
business/data sources — explicitly ruled non-authoritative in
[`DB0_SOURCE_INVENTORY.md`](./DB0_SOURCE_INVENTORY.md) §6. No action beyond that
guardrail.

## 5. Roll-up

| Type | IDs | Count |
| ---- | --- | ----- |
| Conflicts | GAP-01, GAP-02, GAP-03, GAP-04 | 4 |
| Gaps | GAP-05 … GAP-12 | 8 |
| **Total conflicts + gaps** | GAP-01 … GAP-12 | **12** |

| Resolution owner | GAP IDs |
| ---------------- | ------- |
| DB1 | GAP-02, GAP-07 |
| DB2 | GAP-05, GAP-06, GAP-08, GAP-09*, GAP-11 |
| DB3 | GAP-01, GAP-03, GAP-04, GAP-09*, GAP-12 |
| DB4 | GAP-10 |

\* GAP-09 spans DB2 (entity) and DB3 (approval linkage).

Every conflict/gap has a database impact, a resolution owner, and a proposed
(unanswered) decision question. Answers are the user's to make at the target
checkpoint.

## 6. Resolution status updates (append-only)

**DB1 (2026-07-15, `a0e29b4`/`f90f78c`):** GAP-02 resolved by
[ADR-DB1-001](../adr/database/ADR-DB1-001-POSTGRESQL-VERSION.md) (major 16 +
governed patch pin); GAP-07 strategy resolved by
[ADR-DB1-014](../adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md) (runbooks
remain DB10).

**DB2 (2026-07-15, HEAD `f90f78c`):**

| GAP | Status | Resolution record |
| --- | ------ | ----------------- |
| GAP-05 shipping address/history | **Resolved (DB2 scope)** | [ADR-DB2-002](../adr/database/ADR-DB2-002-SHIPPING-ADDRESS-MODEL.md) — per-order detail → snapshot at dispatch; no MVP address book |
| GAP-06 notification persistence | **Resolved (DB2 scope)** | [ADR-DB2-003](../adr/database/ADR-DB2-003-NOTIFICATION-PERSISTENCE.md) — intent + attempts, no bodies/secrets |
| GAP-08 design templates | **Resolved (DB2 scope)** | [`DB2_DESIGN_TEMPLATE_DECISION.md`](./DB2_DESIGN_TEMPLATE_DECISION.md) — Design-owned, design-document schema, clone-on-use |
| GAP-09 terms versioning (DB2 portion) | **Resolved (entity/ownership)**; approval guard → DB3 | [`DB2_TERMS_VERSION_DECISION.md`](./DB2_TERMS_VERSION_DECISION.md) — Content-owned Agreement + immutable versions; snapshot stores ref + content hash |
| GAP-11 analytics storage | **Resolved (DB2 scope)** | [`DB2_ANALYTICS_STORAGE_DECISION.md`](./DB2_ANALYTICS_STORAGE_DECISION.md) — no app-DB event store; outbox emission, external tool authoritative (tool still deferred) |
| GAP-01, GAP-03, GAP-04, GAP-12 | Still open → DB3 | confirmed not preclosed by DB2 |
| GAP-10 stitch count | Still open → DB4 | DB2 records it as admin-entered pricing input (CON-093 note) |
