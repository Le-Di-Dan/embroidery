# DB4 — Snapshot & Versioning Model

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Baseline:** ADR-DB1-010 classes; DB2 snapshot/history model; nothing is
ever overwritten — corrections are superseding versions, void states, or
compensating records.

## 1. Mutable header + immutable versions

| Pattern | Header (mutable) | Version rows (immutable) | Version identity | Parent/supersede | Current pointer | Correction | Hash | DB7 |
|---|---|---|---|---|---|---|---|---|
| Design Case → Versions | `design_cases` (current_version_id) | `design_versions` frozen once ≠ DRAFT (CST-090) | (case, version) CST-021 | `parent_version_id` (REL-046); SUPERSEDED/VOID states | REL-044 (TX-consistent) | new version | `document_hash` JCS+SHA-256 | D7-03/04/15 |
| Quotation → Versions | `quotations` (status, current_version_id) | `quotation_versions` frozen once SENT (CST-092) + line items | (quotation, version) CST-036 | `parent_version_id` (REL-067); SUPERSEDED | REL-068 | new version + re-acceptance (ADR-DB3-001 r4) | — (amount checks CST-064) | D7-03 |
| Agreement → Versions | `agreements` (current_version_id) | `agreement_versions` frozen once PUBLISHED (CST-096) | (agreement, version) CST-045 | supersede on new publish; WITHDRAWN [R] | REL-098; one effective = CST-046 | new version | `content_hash` | D7-03 |
| Template → Versions | `design_templates` (status, current_version) | `design_template_versions` frozen once published (CST-097) | (template, version) CST-025 | monotonic counter | `current_version` int | new publish | doc schema version | D7-14 |
| Policy Config → Versions | `policy_configurations` (current_version_id) | `policy_configuration_versions` immutable | (config, version) CST-050 | monotonic | REL-102 | new version [R] | value schema version | D7 |

Version numbers are per-root integer sequences (`version`, ADR-DB1-006),
serialized by header row locks (CC-28 pattern).

## 2. Immutable snapshots

| Snapshot | Created at (tx) | Contents principle | Correction | Root relationship | DB7 |
|---|---|---|---|---|---|
| Approval Snapshot (TBL-031..033) | approval tx (TR-LC08-04) | exact version ref + document/preview hashes + geometry refs **and display copies** + dimensions + quantity + thread colors (child) + frozen contact snapshot + grant/step-up refs + per-type agreement version + content hash | **new approval supersedes operationally** (order pointer move, audited); rows never edited/deleted (CST-091) | 1–1 version (CST-023); anchors to case/request/customer | D7-03/07 |
| Order Item commercial snapshot (TBL-044) | order-creation tx (TR-LC14-01) | per-line values copied from accepted quotation version + display names + NOT NULL approval ref | corrective amendment = DB3 policy records; never rewrite (CST-093) | comp of order | D7-03/07 |
| Order total copy (`orders.total_amount`) | order creation | frozen accepted total | recalculation = obligation supersede chain, not order edit | — | D7 |
| Quotation Version (also a snapshot of price inputs/display) | send tx | no live price references (INV-12) | new version | see §1 | D7-03 |
| Shipping Snapshot (TBL-048) | dispatch tx (TR-LC14-07) | recipient/address/fee/carrier/tracking + dispatched_at | post-freeze correction = compensating `order_transitions` event | 1–1 order + detail ref (CST-034, REL-079) | D7-03/D8-14 |
| Production Specification (TBL-060) | job-creation tx (TR-LC18-01) | frozen from approval: hash copy + display + dimensions + quantity + parameters | new job + new spec (ADR-DB3-003) | 1–1 job (CST-042) | D7-03/07 |
| Terms acceptance (TBL-033) | approval tx | agreement version ref + type copy + content hash + timestamp | new approval | child of snapshot | D7 |
| Contact snapshot (columns on TBL-031) | approval tx | frozen name/email/phone copies | break-glass privacy redaction only (audited) | columns, not a table | D7-03 |

## 3. Void / supersede semantics

- **VOID** (design/quotation drafts): admin-only, reason [R], never-sent
  rows only.
- **SUPERSEDED**: system marking when a successor version is sent/accepted
  or obligations are recalculated — always in the same tx as the successor
  creation (Tier B history keeps both rows).
- **Operational supersession of approvals**: `orders.current_approval_snapshot_id`
  pointer move (REL-074) recorded as an `order_transitions` POINTER_MOVE
  event + audit; snapshots themselves have no state machine (LC-10).

## 4. Timestamps & actors

Every version/snapshot stores its creation instant (`created_at`,
`sent_at`/`published_at`/`approved_at`/`dispatched_at` as applicable) and
actor evidence (admin id via audit; customer via grant + step-up refs
embedded in acceptance/approval/review rows). Immutable rows never carry
`updated_at` (ADR-DB1-006).

---

## Forward note — `APP3-G02` (IMP-D042, 2026-08-03)

**Design Template Version is immutable from creation** (LC-24, PO-04). The
earlier "lightweight versioning" reading — bump a counter per publish — is
superseded: every save while the header is `DRAFT` writes a **new** row with
the next monotonic `version`, and no existing version is ever rewritten.
`published_at` is `null` until that exact version is first published, is set
**once** by `TR-LC24-02`, and is never cleared or rewritten — `TR-LC24-03`
(unpublish) changes the header only. Public read while `PUBLISHED` selects the
highest `version` whose `published_at` is not null.
