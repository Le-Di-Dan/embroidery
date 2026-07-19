# DB6-C4 — Forward Relationship Completeness & Current-Pointer Integrity Audit

**Date:** 2026-07-19 · **Checkpoint:** DB6-C4 (audit slice, no schema change)
**Baseline:** HEAD `75510d4` (G11) · migrations `0000`–`0016` unchanged.

This document is the canonical evidence trail for DB6-C4. It does not
reopen G1–G11 implementation logic; it audits (a) whether the physical
schema already implemented correctly enforces same-case ownership on the
`design_cases.current_version_id` pointer, and (b) whether every
FK-shaped column across all 78 canonical tables — implemented and planned —
has a documented relationship classification, so G12–G19 do not repeat the
class of gap DEV-DB6-010/012 already found and closed.

## 1. Current-pointer integrity audit

See `DB6_G11_GROUP_REPORT.md`'s DB6-C4 addendum for full detail. Summary:

| Question | Answer |
|---|---|
| Does a physical FK reject a dangling `current_version_id`? | **Yes** — `fk_design_cases__current_version_id` (migration `0016`), live-verified. |
| Does the schema reject a pointer to a version owned by a *different* Design Case? | **No** — live-reproduced on a disposable database: Case A's `current_version_id` was successfully set to a version owned by Case B. |
| Is this a silently missing guard? | **No.** `DB4_SNAPSHOT_AND_VERSIONING_MODEL.md`'s "Design Case → Versions" row explicitly marks REL-044 **"(TX-consistent)"** — DB4 itself classifies this edge's ownership as TX/App-enforced, not DB-enforced. |
| Verdict | **TX/App PASS.** No trigger or composite FK invented; the future design-case module owns this in the same transaction that validates the target version's `design_case_id`. |

## 2. Global relationship coverage — method

Every reference-shaped column (`_id` suffix, or a "→ target" / "pointer" /
"snapshot anchor" note in `DB4_COLUMN_DICTIONARY.md`) across all 78 tables
was classified against `DB4_RELATIONSHIP_AND_FK_MODEL.md`,
`DB4_KEYS_AND_CONSTRAINTS.md`, `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`,
`DB4_COMPLETENESS_MATRIX.md`, and the DB6 manifest's own §2.2/§2.2.1/§3, into:

- **A** — has a clear REL row (or documented `×N`/implied-multiplicity entry).
- **B** — documented intentional no-FK (polymorphic actor/evidence
  reference, generic audit target, snapshot value copy).
- **C** — FK-shaped, no REL row and no documented no-FK rationale — a
  candidate gap, same class as DEV-DB6-010/012.
- **D** — ambiguous (conflicting DB4 statements).

The 44 **implemented** tables (G1–G11) are covered continuously by
`tools/db-metric-check.mjs`'s `checkRelCardinality` and
`tools/db-deferred-owner-check.mjs`'s ledger check, both re-run on every
manifest-checker invocation — they already re-derive the 164/162 REL
denominator and the 7-edge deferred-owner ledger from the DB4 source on
every run, so this document does not re-litigate them here (see manifest
§2.2/§2.2.1 and the checker's own `note()` output for the live figures).

The 34 **planned** tables (G12–G19) had no continuous checker coverage
before this audit — they are re-derived by DB6 execution prompts per group,
one at a time, with no cross-group sweep. This audit is that sweep, done
once before G12 starts.

## 3. G12–G19 findings summary

| Group | Tables audited | Class A | Class B | Class C | Class D |
|---|---|---|---|---|---|
| G12 — Content/gallery/agreement | 6 | 5 | 0 | 0 | 0 |
| G13 — Approval | 3 | 9 | 0 | **4** | 0 |
| G14 — Quotation | 4 | 10 | 0 | 0 | 0 |
| G15 — Order & shipping | 8 | 21 | 0 | **3** | 0 |
| G16 — Payment | 5 | 13 | 0 | **3** | 0 |
| G17 — Production | 5 | 10 | 0 | **1** | 0 |
| G18 — Notification | 2 | 3 | 0 | 0 | 0 |
| G19 — Audit | 1 | 3 | 2 | 0 | 0 |
| **Total** | **34** | **74** | **2** | **11** | **0** |

**No Class D ambiguity found anywhere in G12–G19.**

### Class C detail and resolution

| # | Table (Group) | Column(s) | Resolution | Denominator effect |
|---|---|---|---|---|
| 1 | `approval_snapshots` (G13) | `product_id`/`product_variant_id`/`product_side_id`/`embroidery_area_id` | **DEV-DB6-013** — genuinely missing edge family, same class as DEV-DB6-012; 4 native FKs, planned owner G13 | +4 logical, +4 physical |
| 2 | `shipping_fee_acknowledgements` (G15) | `grant_id`/`step_up_challenge_id` | **DEV-DB6-014** — genuinely missing edge, sibling pattern (REL-050/053/070/080/085) breaks for this one table; 2 native FKs, planned owner G15 | +2 logical, +2 physical |
| 3 | `order_cancellation_requests` (G15) | `decided_by_admin_id` | **DEV-DB6-015** — formalizes existing bare-admin-actor no-FK precedent (TBL-041/009); reclassified **B**, no FK | none |
| 4 | `payment_reconciliations` (G16) | `admin_id` | **DEV-DB6-015** — same formalization; reclassified **B** | none |
| 5 | `refunds` (G16) | `approved_by_admin_id`, `executed_by_admin_id` | **DEV-DB6-015** — same formalization; reclassified **B** | none |
| 6 | `production_notes` (G17) | `admin_id` | **DEV-DB6-015** — same formalization; reclassified **B** | none |

All 11 original Class-C findings are resolved: 2 as new genuinely-missing
edges (own deviations, per DEV-DB6-009's standing scope guard — "a genuinely
missing edge gets its own deviation, not a counting reinterpretation"), and
4 as a documentation-only reclassification to B under an already-established
DB6 precedent (no relationship invented, no denominator change). Full
evidence for each is in `DB6_DEVIATION_REGISTER.md` DEV-DB6-013/014/015.

### Confirmed non-findings (user-flagged pointers)

| Pointer | Status |
|---|---|
| `quotations.current_version_id` (REL-068) | Target table `quotation_versions` created in the **same** group (G14) — an intra-group header/child cycle resolved by custom SQL when G14 builds, same mechanism as REL-044/G11. Not a deferred-ledger case. No new finding. |
| `agreements.current_version_id` (REL-098) | Target table `agreement_versions` created in the **same** group (G12) — same pattern. No new finding. |
| `custom_requests.current_quotation_id` (REL-062 e2) | Already in manifest §2.2.1 ledger, owner **G14**, `deferred`. Confirmed consistent. |
| `inventory_ledger_entries.reservation_id`/`.order_id` (REL-028) | Already in ledger, owner **G15**, `deferred`. Confirmed consistent. |
| `inventory_soft_holds.converted_reservation_id` (REL-030) | Already in ledger, owner **G15**, `deferred`. Confirmed consistent. |
| REL-051 (`approval_snapshots.design_version_id`) | Direct 1–1 row, target already exists (G11). No deferral needed. (Distinct from the DEV-DB6-013 finding above, which is TBL-031's *placement* refs, not this edge.) |

## 4. Denominator reconciliation

```text
Before DB6-C4:  158 logical edges / 156 physical FK target
DEV-DB6-013:    +4 logical / +4 physical  (approval_snapshots placement refs)
DEV-DB6-014:    +2 logical / +2 physical  (shipping_fee_acknowledgements grant/challenge)
DEV-DB6-015:     0 / 0                    (reclassification only, no new edge)
After DB6-C4:   164 logical edges / 162 physical FK target
```

Checker-enforced in `tools/db-metric-check.mjs` (`EXPECTED_FK_EDGES = 164`,
`ADDITIONAL_EDGES = 11`). Re-run after this update:

```text
[manifest] REL: 92 rows -> 153 derived + 11 added (DEV-DB6-010/012/013/014) = 164 FK edges
[manifest] all checks passed
```

**164 logical edges above is checker-verified and unchanged.** The physical
FK **target** of 162 stated in this section's heading, however, is
**superseded by DEV-DB6-017** (2026-07-19, G19 final reconciliation): the
correct target is **160**, not 162 — no tool ever derived "162" from
source, and summing every group's own already-committed physical-FK delta
against 164 lands on 160. This section's arithmetic is retained verbatim
as the historical record of what DB6-C4 declared at the time; see
`DB6_DEVIATION_REGISTER.md` DEV-DB6-017 for the corrected figure and full
evidence trail.

## 5. What G12 inherits

- G12's own 6 tables: **zero Class-C findings** — G12 may proceed once this
  audit is accepted. **Implemented (2026-07-19, DB6-G12):** all 5 Class-A
  edges (REL-095 ×2, REL-096, REL-097, REL-098) are now physical FKs; REL-098
  (`agreements.current_version_id`) resolved by custom SQL
  (`0019_add_agreement_current_version_fk.sql`), same header↔child cycle
  mechanism as REL-044/0016 — existence is physical, same-agreement
  ownership is TX/App (live-verified, see `DB6_G12_GROUP_REPORT.md`).
- G13, G15, G16, G17 each inherit one or more DB6-C4 notes (added inline in
  `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §3 next to their group's table
  list) specifying the exact FKs (DEV-DB6-013/014) or no-FK treatment
  (DEV-DB6-015) their execution prompts must apply — so those groups do not
  need to re-derive this from scratch.
- G13's own 9 Class-A edges plus the DEV-DB6-013 finding: **zero remaining
  Class-C/D findings** for this group. **Implemented (2026-07-19,
  DB6-G13):** REL-051/052 ×3/053 ×2/054/055 ×2 and all four DEV-DB6-013
  placement FKs are now physical (migration
  `0020_create_approval_snapshot_tables.sql`). Existence is physical for
  all nine placement/version/anchor edges; **cross-column placement
  hierarchy consistency** (variant/side/area actually belonging to the
  same product) is **TX/App**, not DB-enforced — live-verified, see
  `DB6_G13_GROUP_REPORT.md` §D.
- G14 — Quotation: no Class-C/D findings for this group (see §3 table, row
  "G14 — Quotation | 4 | 10 | 0 | 0 | 0"). **Implemented (2026-07-19,
  DB6-G14):** all 10 Class-A edges (REL-065, REL-066 ×2, REL-067, REL-068,
  REL-069, REL-070 ×4) are now physical FKs, plus the deferred REL-062
  second edge (`custom_requests.current_quotation_id` → `quotations`,
  §2.2.1 ledger, owner G14) — 11 physical FKs total. REL-068 and REL-062 e2
  both resolved by custom SQL
  (`0022_add_quotation_current_version_and_request_pointer_fks.sql`), the
  same header↔child cycle mechanism as REL-044/0016 and REL-098/0019.
  Existence is physical for all eleven edges; same-quotation ownership of
  `quotations.current_version_id` and same-request ownership of
  `custom_requests.current_quotation_id` stay TX/App, same tier already
  applied to REL-044/REL-098 — see `DB6_G14_GROUP_REPORT.md` §D.
- G15 — Order & shipping: no Class-C/D findings for this group beyond
  DEV-DB6-014 (see §3 table, row "G15 — Order & shipping | 8 | 21 | 0 | 3 |
  0" — the 3 Class-C findings are DEV-DB6-014 (grant/challenge) and the
  two DEV-DB6-015 reclassifications, `order_cancellation_requests.
  decided_by_admin_id`). **Implemented (2026-07-19, DB6-G15):** all 21
  Class-A edges (REL-071/072/073/074/075/076 ×2/077/078 ×5/079/080 ×2/031
  ×2/105 ×3) plus DEV-DB6-014's two grant/challenge FKs and the three
  REL-028/030 deferred-ledger resolutions are now physical (migration
  `0023_create_order_reservation_shipping_tables.sql`). `orders.
  current_approval_snapshot_id` (REL-074) is an audited pointer with no
  header↔child cycle (target predates this group) — existence physical,
  same-case chain TX/App, same tier as every other current-pointer
  finding in this engagement.
- G16 — Payment: no Class-C/D findings for this group beyond the two
  DEV-DB6-015 reclassifications (`payment_reconciliations.admin_id`,
  `refunds.approved_by_admin_id`/`executed_by_admin_id`). **Implemented
  (2026-07-19, DB6-G16):** REL-081/082/083 ×2/084/085 ×2/086/087 ×2/088 ×3
  are now physical FKs (migration `0024_create_payment_tables.sql`).
  `payment_obligations.satisfied_by_attempt_id` (REL-083's second edge) is
  the one deferred-by-cycle resolution this group needed — same
  header↔child cycle mechanism as REL-044/0016, REL-098/0019 and
  REL-068/0022, resolved by custom SQL
  (`0025_add_payment_obligation_satisfied_by_fk.sql`). Existence is
  physical for all thirteen edges; which attempt wins the satisfaction race
  (CC-10) stays TX/App, same tier as every other current-pointer finding in
  this engagement.
- G17 — Production: no Class-C/D findings for this group beyond the one
  DEV-DB6-015 reclassification (`production_notes.admin_id`, the fourth
  and last forward column that entry named). **Implemented (2026-07-19,
  DB6-G17):** REL-090/091/092/093 ×2/094 ×4 are now physical FKs (migration
  `0027_create_production_tables.sql`) — ten edges total: `production_jobs`
  → orders / approval_snapshots / self (rework lineage);
  `production_specifications` → production_jobs / approval_snapshots;
  `production_artifacts` → production_jobs / assets; `production_notes` →
  production_jobs; `production_job_transitions` → production_jobs /
  admin_accounts (the REL-105 actor edge, real FK — distinct from
  `production_notes.admin_id`'s no-FK treatment on the same group). Zero
  header↔child import cycles; no custom SQL needed. Existence is physical
  for all ten edges; that `production_specifications.approval_snapshot_id`
  is the *same* snapshot the parent job itself references is TX/App, same
  tier as every other current-pointer/chain finding in this engagement.
- G18 — Notification: no Class-C/D findings for this group; all three
  reference-shaped columns (REL-099, REL-100, REL-101) already carried REL
  rows in `DB4_RELATIONSHIP_AND_FK_MODEL.md` (Class A per this audit's own
  definition — "has a clear REL row", not "gets a physical FK"), so this
  audit's pre-registered 3A/0B/0C/0D held exactly. **Implemented (2026-07-19,
  DB6-G18):** only REL-100 (`notification_delivery_attempts.intent_id` →
  `notification_intents`, restrict) is a physical FK — the one edge
  `DB5_FK_INDEX_REVIEW.md` marks "required", backed by IDX-092. REL-099
  (`recipient_contact_point_id`) and REL-101 (`source_outbox_event_id`) stay
  no-FK by design, exactly as their own REL rows already specified ("FK
  exists? no", index verdict "unnecessary") — `DEV-DB6-016` formalizes the
  rationale (contact-point anonymization/merge cleanup, outbox transience)
  rather than introducing a new classification. One physical FK total;
  164/162 logical/physical-FK-target denominators unaffected — neither
  no-FK column was ever counted toward the physical-FK-target side.
- G19 — Audit: no Class-C/D findings for this group; this audit's
  pre-registered 3A/0B/0C/0D held exactly. **Implemented (2026-07-19,
  DB6-G19):** all three REL-105 (TBL-072 subset) actor edges are now
  physical FKs — `admin_id` → `admin_accounts`, `customer_id` →
  `customers`, `grant_id` → `secure_access_grants`, all restrict, backed by
  IDX-095/IDX-096's leading columns. This closes REL-105's full 10-edge
  enumeration (TBL-042/045/063/072) at **10/10 physical**. The 2 Class-B
  findings (REL-103 polymorphic target; `system_job_key` bare evidence,
  no REL row) stay no-FK by design, exactly as pre-registered — no schema
  change, no new classification. **DEV-DB6-017 correction:** with this
  group's 3 edges added, the running implemented count reaches
  **160**, not the previously-repeated **162** — the "162" physical-FK-target
  ceiling declared at this audit's own §4 was miscomputed by 2 at
  authoring time and never re-verified against the full G1–G19 delta chain
  until this group closed the ledger; see `DB6_DEVIATION_REGISTER.md`
  DEV-DB6-017 for the full evidence trail. §4's arithmetic below is
  retained as history; the corrected ceiling is **160**.
- No physical defect was found in G1–G11 (the already-implemented tables).
  No forward-fix migration is required. DB6-C4 makes **no schema change**.

## 6. Verdict

```text
DB6-C4       PASS
```
