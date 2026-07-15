# DB0 — Domain Coverage Matrix

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Purpose:** Prove no required domain or operational area is missed. Covers the 58 areas mandated by the DB0 task.

---

## 1. Legend

- **Req?** — Is there a clear requirement? `Yes` / `Partial` / `No`.
- **Open decision?** — Is a blocking/relevant decision still open?
- **CP** — Checkpoint that will primarily handle this domain's design.
- **Blocker for DB1?** — Does this area block the DB1 Persistence ADR? `Yes` / `No`.

DB1 blockers are those where an ADR-level choice must be made before persistence
strategy can be locked (ORM, migration, versioning, backup, retention, ID/enum
strategy, design-document/hashing, test DB). All others are non-blocking for DB1
and are designed in later checkpoints.

## 2. Coverage matrix

| # | Domain / area | Req? | Source(s) | Open decision? | CP | Blocker for DB1? |
| - | ------------- | ---- | --------- | -------------- | -- | ---------------- |
| DOM-01 | Admin identity & admin session | Yes | `07 §1`, `09 §3`, REQ-IDN-001..004 | Yes (auth/OTP provider O-005) | DB2/DB3 | No |
| DOM-02 | Customer identity / contact | Yes | `04 BR-014`, `01 §4`, REQ-CUST-001..003 | No | DB2 | No |
| DOM-03 | Email/phone verification | Yes | `01 §4`, `09 §2`, REQ-VERIF-001..002 | Yes (provider O-005) | DB3 | No |
| DOM-04 | Secure access link / grant | Yes | `01 §4`, `09 §2`, REQ-GRANT-001..004 | Yes (expiry/revocation O-005) | DB3 | No |
| DOM-05 | Catalog | Yes | `01 §2.2`, `07 §3`, REQ-CAT-001..006 | No | DB2 | No |
| DOM-06 | Category | Yes | `01 §2.2`, `08 §2`, REQ-CAT-002 | No | DB2 | No |
| DOM-07 | Product | Yes | `01 §2.2`, `11`, REQ-CAT-001/003 | No | DB2 | No |
| DOM-08 | Variant | Yes | `01 §2.2`, `12 D-016`, REQ-VAR-001 | No | DB2 | No |
| DOM-09 | SKU | Yes | `01 §9`, `11 SKU`, REQ-VAR-001/002 | No | DB2 | No |
| DOM-10 | Product side | Yes | `05 §5`, `11 Product Side`, REQ-SIDE-001 | No | DB2 | No |
| DOM-11 | Embroidery area | Yes | `01 §2.2`, `11`, REQ-SIDE-002 | No | DB2 | No |
| DOM-12 | Product media | Yes | `01 §2.2`, `05 §5`, REQ-MEDIA-001 | No | DB4 | No |
| DOM-13 | Design templates | Partial | `01 §2.2`, REQ-TMPL-001..002 | Yes (ownership/structure — GAP-11) | DB2 | No |
| DOM-14 | Inventory balance | Yes | `01 §9`, `12 D-016`, REQ-INV-001 | No | DB4 | No |
| DOM-15 | Inventory ledger | Yes | `07 §10`, REQ-INV-002 | No | DB4 | No |
| DOM-16 | Inventory reservation | Yes | `04 BR-015`, `06 §8`, REQ-INV-003/004/007 | Yes (expiration — DEC-14) | DB3 | No |
| DOM-17 | Assets | Yes | `SYSTEM_ARCHITECTURE §9,§10`, REQ-ASSET-001 | Yes (object-storage product O-001/D-027) | DB4 | No |
| DOM-18 | Asset derivatives | Yes | `05 §4.2`, REQ-ASSET-003 | Yes (image-processing engine O-001) | DB3 | No |
| DOM-19 | Asset inspection | Yes | `09 §4`, REQ-ASSET-002 | No | DB3 | No |
| DOM-20 | Temporary design session | Yes | `04 BR-013`, `05 §8`, REQ-SESS-001 | Yes (retention period O-008) | DB3 | No |
| DOM-21 | Autosave | Yes | `05 §8`, REQ-SESS-002 | No | DB3 | No |
| DOM-22 | Formal design versions | Yes | `05 §9`, `06 §4`, REQ-DVER-001..006 | Yes (doc JSON + hashing — DEC-06) | DB3 | **Yes** |
| DOM-23 | Customer review | Yes | `03 J5`, `07 §6`, REQ-REVIEW-001..002 | No | DB3 | No |
| DOM-24 | Approval snapshot | Yes | `06 §9`, REQ-APPR-001..003 | Yes (immutability enforcement — DEC-09) | DB3 | **Yes** |
| DOM-25 | Customer-owned product | Yes | `02 §3`, `04 BR-003`, REQ-COP-001..002 | No | DB2 | No |
| DOM-26 | Custom request | Yes | `01 §5`, REQ-REQ-001..005 | No | DB2 | No |
| DOM-27 | Request lifecycle | Yes | `06 §3`, REQ-REQ-002 | Yes (final state names — DB3) | DB3 | No |
| DOM-28 | Quotation | Yes | `01 §6`, `06 §5`, REQ-QUOT-001..006 | No | DB2 | No |
| DOM-29 | Quotation versions | Yes | `06 §5`, `01 §6`, REQ-QUOT-002 | No | DB3 | No |
| DOM-30 | Quotation line items | Yes | `01 §6`, `07 §7`, REQ-QUOT-001 | No | DB4 | No |
| DOM-31 | Quotation acceptance | Yes | `03 J4/J6`, `07 §7`, REQ-QUOT-006 | Yes (acceptance vs approval order — GAP-03/DEC-16) | DB3 | No |
| DOM-32 | Order | Yes | `06 §7`, REQ-ORD-001..002 | No | DB2 | No |
| DOM-33 | Order item | Yes | `01 §5`, `06 §9`, REQ-ORD-002 | No | DB4 | No |
| DOM-34 | Order lifecycle | Yes | `06 §7,§8`, REQ-ORD-001/003/005 | Yes (final state names — DB3) | DB3 | No |
| DOM-35 | Deposit obligation | Yes | `04 BR-005`, `06 §6`, REQ-PAY-001/002 | No | DB2 | No |
| DOM-36 | Remaining payment obligation | Yes | `04 BR-006`, REQ-PAY-001/003 | No | DB2 | No |
| DOM-37 | Payment attempts | Yes | `06 §6`, REQ-PAY-004 | Yes (provider O-006) | DB3 | No |
| DOM-38 | Payment callbacks / events | Yes | `01 §8`, `09 §8`, REQ-PAY-005/006 | Yes (webhook contract O-006) | DB3/DB8 | No |
| DOM-39 | Refund / cancellation support | Partial | `06 §11`, `07 §8`, REQ-PAY-009 | Yes (policy O-009 — GAP-04) | DB3 | No |
| DOM-40 | Production job | Yes | `04 BR-010`, `07 §9`, REQ-PROD-001/002 | No | DB3 | No |
| DOM-41 | Production artifact | Yes | `04 BR-012`, `09 §5`, REQ-PROD-003 | No | DB4 | No |
| DOM-42 | Shipping / delivery | Yes | `01 §10`, `07 §11`, REQ-SHIP-001..004 | Yes (address/history model — GAP-05) | DB4 | No |
| DOM-43 | Gallery | Yes | `01 §2.3`, `07 §4`, REQ-GAL-001..002 | No | DB2 | No |
| DOM-44 | SEO / content pages | Yes | `08 §2,§4`, REQ-SEO-001..004 | No | DB2 | No |
| DOM-45 | Notifications | Partial | `SYSTEM_ARCHITECTURE §5.4`, REQ-NOTIF-001..002 | Yes (persistence depth — GAP-06; provider O-005) | DB2/DB3 | No |
| DOM-46 | Audit events | Yes | `07 §12`, `BACKEND_CONVENTIONS §18`, REQ-AUDIT-001..003 | Yes (retention period O-012 — DEC-13) | DB3 | **Yes** (retention scope) |
| DOM-47 | Outbox / reliable async side effects | Yes | `SYSTEM_ARCHITECTURE §11`, REQ-OUTBOX-001..002 | Yes (queue/broker O-001) | DB4 | No |
| DOM-48 | Idempotency | Yes | `BACKEND_CONVENTIONS §12`, REQ-IDEM-001..002 | Yes (key expiry policy — DEC-15) | DB4 | No |
| DOM-49 | Data retention | Yes | `09 §10`, `10 §12`, REQ-RETEN-001..002 | Yes (periods O-012 — DEC-13) | DB1 | **Yes** |
| DOM-50 | Backup | Yes | `10 §9`, `09 §11`, REQ-OPS-002/003 | Yes (tool/format — DEC-11) | DB1 | **Yes** |
| DOM-51 | Restore | Yes | `10 §9`, `09 §11`, REQ-OPS-002 | Yes (restore compat — DEC-12) | DB1 | **Yes** |
| DOM-52 | Migration | Yes | `10 §10`, `BACKEND_CONVENTIONS §9`, REQ-OPS-001/006/007 | Yes (framework O-001 — DEC-02) | DB1 | **Yes** |
| DOM-53 | Schema versioning | Yes | `10 §10`, REQ-OPS-007, DB0 task §2 | Yes (rollback vs forward-only — DEC-18) | DB1 | **Yes** |
| DOM-54 | Seed / fixtures | Yes | `13 §4`, REQ-OPS-011 | Yes (seed strategy — DEC-19) | DB1 | Partial |
| DOM-55 | Multi-machine development | Yes | DB0 task §2, `LOCAL_DEVELOPMENT`, REQ-OPS-004..009 | Yes (volume/branch policy — DEC-17) | DB1 | **Yes** |
| DOM-56 | Disaster / recovery workflow | Yes | `10 §9`, `09 §11`, REQ-OPS-002 | Yes (runbooks — DB10) | DB1/DB10 | Partial |
| DOM-57 | Docker persistence | Yes | `docker-compose.dev.yml`, `LOCAL_DEVELOPMENT §5,§6`, REQ-OPS-004 | Yes (volume strategy — DEC-17) | DB6 | Partial |
| DOM-58 | Secrets and environment configuration | Yes | `LOCAL_DEVELOPMENT §3`, `BACKEND_CONVENTIONS §16`, REQ-OPS-009/010 | No | DB1/DB6 | No |

## 3. Coverage summary

| Req? | Count |
| ---- | ----- |
| Yes | 54 |
| Partial | 4 (DOM-13, DOM-39, DOM-42*, DOM-45) |
| No | 0 |

\* DOM-42 has a clear shipping requirement but the address/history model shape
is under-specified (GAP-05); the domain itself is covered.

**No domain is entirely missing.** Partial coverage areas each have a recorded
gap and a resolution owner in
[`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md).

## 4. DB1 blockers (from this matrix)

The following areas block the DB1 Persistence ADR because they require an
ADR-level choice before persistence strategy can be locked:

- DOM-22 Design versions — needs design-document JSON structure + canonical
  hashing decision (DEC-06).
- DOM-24 Approval snapshot — needs immutability-enforcement approach (DEC-09).
- DOM-46 Audit events / DOM-49 Data retention — retention scope/periods
  influence table/partition/archival strategy (DEC-13).
- DOM-50/51 Backup/Restore — backup tool/format and restore compatibility
  (DEC-11, DEC-12).
- DOM-52/53 Migration / Schema versioning — migration framework and
  forward-only vs rollback policy (DEC-02, DEC-18).
- DOM-55 Multi-machine development — Docker volume + branch-divergence policy
  (DEC-17).

Additionally, cross-cutting DB1 blockers not tied to a single domain: ORM
(DEC-01), ID/UUID strategy (DEC-04), enum strategy (DEC-05), PostgreSQL version
pin reconciliation (DEC-03/GAP-02), test-database strategy (DEC-20).

See [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md) for the full blocker list.
