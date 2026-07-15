# DB0 — Invariant Inventory

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Purpose:** Inventory and classify invariants locked or directly derivable from the documents. DB0 classifies enforcement level; it does **not** implement enforcement.

---

## 1. Enforcement classes

- **DB** — Database-enforceable (constraint, FK, unique, check, trigger, type).
- **TX** — Transactionally enforceable (needs an explicit transaction boundary).
- **APP** — Application-enforceable (domain/use-case logic).
- **EXT** — Requires external verification (payment provider, off-site backup).
- **OPEN** — Enforcement approach still open (depends on a decision).

Most invariants use a **defense-in-depth** combination; the primary class is
listed first. Final enforcement mapping is designed at **DB3/DB4/DB7/DB8**.

## 2. Business & lifecycle invariants

| ID | Invariant | Source | Class | Verified at | Notes |
| -- | --------- | ------ | ----- | ----------- | ----- |
| INV-01 | An approved design version cannot be edited; any post-approval change creates a new version + new approval. | `04 BR-009`, `01 §7`, `06 §10`, `00 §8` | DB + APP | DB7 | Immutable snapshot; DB rejects updates to approved rows (enforcement approach DEC-09). |
| INV-02 | A sent quotation version is never overwritten; revision creates a new immutable version. | `01 §6`, `06 §5`, `10 §5` | DB + TX | DB7/DB8 | Historical values immutable. |
| INV-03 | Production must reference the exact approved version (or an artifact cryptographically linked to it). | `04 BR-010`, `06 §8`, `00 §8` | APP + DB | DB8 | FK to approved snapshot + hash check. |
| INV-04 | Deposit (40%) and remaining payment (60%) are two independent obligations. | `06 §6`, `01 §8`, `BACKEND_CONVENTIONS §13` | DB + APP | DB4 | Modeled as distinct obligation rows. |
| INV-05 | Official inventory reservation occurs only after approval + successful deposit (not at draft/request). | `04 BR-015`, `06 §8`, `03 J6` | TX + APP | DB8 | Guarded transition. |
| INV-06 | Delivery cannot start without verified remaining payment; production not without approved design + verified deposit + reservation; completion only after delivery. | `06 §8`, `04 BR-005/006` | TX + APP | DB8 | Ordering preconditions. |
| INV-07 | Payment callbacks/webhooks are idempotent; duplicate/out-of-order callbacks do not double-apply. | `01 §8`, `09 §8`, `10 §4`, `BACKEND_CONVENTIONS §12` | TX + DB (unique key) + EXT | DB8 | Idempotency record + signature verify. E2E-10. |
| INV-08 | Secure access reaches only the owning customer/request. | `09 §2`, `SYSTEM_ARCHITECTURE §12` | APP + DB | DB8 | Grant scope; authorization is server-side. |
| INV-09 | Customer uploads and production assets are private by default; no public listing. | `09 §5`, `SYSTEM_ARCHITECTURE §10` | APP + EXT | DB4 | Storage authorization; DB stores no public URL as authority. |
| INV-10 | Binary objects are never stored directly in PostgreSQL; DB holds metadata + internal reference only. | `SYSTEM_ARCHITECTURE §9,§10`, `BACKEND_CONVENTIONS §14` | DB (schema design) + APP | DB4 | No BLOB columns for assets. |
| INV-11 | Monetary values never use floating point; exact decimal only. | `10 §5`, `BACKEND_CONVENTIONS §5,§9` | DB (numeric type) | DB4/DB7 | Column type constraint. |
| INV-12 | Orders and quotations retain historical snapshots; price-list changes never mutate locked quotes/orders. | `00 §8`, `01 §6`, `10 §5` | DB + APP | DB7 | Snapshot columns immutable. |
| INV-13 | A customer-owned product is never represented as a store-owned SKU / store stock. | `04 BR-003`, `01 §9` | DB + APP | DB4 | Distinct entity; no inventory linkage. |
| INV-14 | Sensitive transitions (approval, payment, order, cancellation, refund, stock, security config) are audited with actor/timestamp/reason. | `07 §12`, `06 §8`, `BACKEND_CONVENTIONS §18` | APP + DB (append-only) | DB3/DB7 | Audit events append-only. |
| INV-15 | Payment success is never derived from a browser redirect alone. | `01 §8`, `09 §8`, `00 §8`, `BACKEND_CONVENTIONS §13` | APP + EXT | DB8 | Server-side verification only. |
| INV-16 | Only one design version is actively awaiting customer review at a time. | `06 §4` | TX + DB (partial unique) | DB8 | Concurrency guard. |
| INV-17 | Approved design cannot return to draft. | `06 §4`, `01 §7` | DB + APP | DB7 | Terminal state. |
| INV-18 | Prevent negative stock unless explicitly overridden with an audit reason. | `07 §10` | DB (check) + APP | DB7 | Constraint + override path. |
| INV-19 | No duplicate order creation; no duplicate payment application; no lost design version. | `10 §4` | TX + DB (unique) | DB8 | Idempotency + uniqueness. |
| INV-20 | Approval is authoritative only through the secure flow; messaging apps are not the record. | `04 BR-008`, `12 D-012` | APP | DB3 | Process invariant; no external source of truth. |
| INV-21 | Customer cannot export/download scene document, high-res preview, store-owned artwork, production or digitized files. | `04 BR-011`, `01 §3`, `05 §11`, `00 §8` | APP + EXT | DB8 | No export surface; asset authorization. E2E-09. |
| INV-22 | Customer-facing previews contain watermark; internal production artifacts do not. | `04 BR-012`, `05 §10` | APP | DB4 | Derivative generation rule. |
| INV-23 | External side effects are not part of a DB transaction; committed transactions trigger async work via outbox/equivalent. | `SYSTEM_ARCHITECTURE §11`, `BACKEND_CONVENTIONS §11` | TX + APP | DB8 | Outbox pattern. |
| INV-24 | Idempotency keys/results are scoped and expired intentionally. | `BACKEND_CONVENTIONS §12` | DB + APP | DB4 | Expiry policy DEC-15. |
| INV-25 | Referential integrity is enforced across related records. | `10 §5`, `BACKEND_CONVENTIONS §9` | DB (FK) | DB7 | |

## 3. Migration & portability invariants

| ID | Invariant | Source | Class | Verified at | Notes |
| -- | --------- | ------ | ----- | ----------- | ----- |
| INV-26 | Migrations already merged/shared across machines are immutable. | `BACKEND_CONVENTIONS §9`, DB0 task Task F | APP (process) + OPEN | DB6/DB7 | Enforcement via review + tooling; framework DEC-02. |
| INV-27 | A new change always creates a new migration; existing shared migrations are never edited. | `BACKEND_CONVENTIONS §9`, DB0 task Task F | APP (process) | DB6 | |
| INV-28 | A fresh (empty) database can run the entire migration set in order to reach the current schema version. | DB0 task §2, `10 §10` | DB + APP | DB7 | Fresh-install workflow. |
| INV-29 | An existing database can upgrade from any supported prior version. | DB0 task §2 | DB + APP | DB7 | Upgrade workflow. |
| INV-30 | Git commit ↔ schema/migration state is traceable (a migration history table maps to Git). | DB0 task §2, `10 §10` | DB (history table) + APP | DB6 | Version map. |
| INV-31 | No manual/out-of-band database changes outside migrations without being recorded. | DB0 task Task F | APP (process) | DB10 | Governance. |
| INV-32 | Integrity/canonical hashes (design document, preview) are reproducible across machines. | `05 §9`, `06 §4/§9` | APP + OPEN | DB7 | Canonical hashing strategy DEC-06. |
| INV-33 | Backups are encrypted or access-controlled, stored off the primary server, and restore is tested. | `09 §11`, `10 §9` | EXT + APP | DB10 | Restore verification runbook. |
| INV-34 | Backup compatibility with schema version is known before restore (schema recovery vs business-data recovery separated). | `10 §9`, DB0 task Task H | APP + OPEN | DB10 | Restore compat DEC-12. |
| INV-35 | Incompatible local Docker database volumes are not accidentally reused after branch switches. | DB0 task Task H | APP (process) + OPEN | DB6/DB10 | Volume strategy DEC-17. |

## 4. Classification roll-up

| Primary class | Invariant IDs | Count |
| ------------- | ------------- | ----- |
| DB-enforceable (primary) | INV-10, INV-11, INV-13, INV-17, INV-18, INV-25, INV-28, INV-29, INV-30 | 9 |
| Transactionally enforceable (primary) | INV-05, INV-06, INV-07, INV-16, INV-19, INV-23 | 6 |
| Application-enforceable (primary) | INV-08, INV-14, INV-15, INV-20, INV-21, INV-22, INV-24, INV-26, INV-27, INV-31 | 10 |
| Requires external verification (primary) | INV-09, INV-33 | 2 |
| DB + APP / mixed immutability | INV-01, INV-02, INV-03, INV-12 | 4 |
| Enforcement approach still open | INV-32, INV-34, INV-35 | 3 |
| **Total invariants** | INV-01 … INV-35 | **35** |

> Class counts use each invariant's **primary** enforcement mechanism; nearly
> all use defense-in-depth (e.g. INV-01 is DB **and** APP). The "still open"
> group depends on DEC-06 (hashing), DEC-12 (restore compat), DEC-17 (volume
> policy).

## 5. Notes for later checkpoints

- INV-01, INV-02, INV-12, INV-17 require a concrete **immutability strategy**
  (revoke UPDATE/DELETE privileges, triggers, append-only tables, or
  application guards) — DEC-09, designed at DB3/DB4, tested at DB7.
- INV-05, INV-06, INV-07, INV-16, INV-19, INV-23 are the core **concurrency /
  transaction** invariants tested at **DB8**.
- INV-26 … INV-35 are the **multi-machine / recovery** invariants; several
  depend on the DB1 migration/backup ADR and are audited at **DB10**.
- Enforcement mapping (which invariant is enforced by which mechanism) is a
  **DB3** deliverable and must not be pre-decided here.
