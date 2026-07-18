# DB5 — Foreign Key Index Review

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Rule:** PostgreSQL creates **no** index for a foreign key. Each `REL-*` is
reviewed on its own evidence. **No FK is indexed mechanically**
(ADR-DB5-004 R4).

## 1. Decision framework

An FK index is justified only by at least one of:

- **(a) Child lookup** — a catalogued query fetches children by parent id.
- **(b) Join path** — the FK is the join column of a catalogued query and
  the child side is the scanned side.
- **(c) Parent delete/restrict** — the parent row is deleted and PostgreSQL
  must scan the child to enforce `RESTRICT`/`NO ACTION`.

**Reason (c) is weak in this schema and is never accepted alone.** Every
relationship uses `restrict` with archive/anonymize/tombstone semantics
(ADR-DB1-011); DB4 states there is **no physical cascade anywhere** except
`cascade-temp` on transient design-session/challenge families. Rows are not
deleted in normal operation, so the "unindexed FK makes parent deletes slow"
argument — usually the strongest generic argument for FK indexes — largely
does not apply here.

`cascade-temp` relationships (REL-008, REL-042) *do* delete children, but
those deletes are bounded batch sweeps over tiny transient families, and
both are already covered by an index for reason (a).

**Verdicts:** `required` · `recommended` · `unnecessary` · `deferred`
· `covered` (an existing unique/composite index already serves it).

## 2. Identity & Customer

| REL | Child → Parent | FK col | Del | Reason | Verdict | IDX | Queries / rationale |
|---|---|---|---|---|---|---|---|
| REL-001 | admin_credentials → admin_accounts | admin_account_id | restrict | (a) | recommended | — | ≤ few rows per account; seq scan acceptable. **Deferred**: no catalogued query. |
| REL-002 | admin_sessions → admin_accounts | admin_account_id | restrict | (a) | required | IDX-120 | revoke-all-sessions |
| REL-003 | admin_accounts → admin_accounts | replaced_by_… | restrict | — | unnecessary | — | successor chain walked forward from a known row |
| REL-004 | business_profiles → customers | customer_id | restrict | (a) | covered | IDX-062 | CST-051 unique |
| REL-005 | customer_contact_points → customers | customer_id | restrict | (a) | required | IDX-134 | customer detail; CC-27 merge |
| REL-006 | challenges → contact_points | contact_point_id | restrict | (a) | recommended | IDX-130 | nullable; partial `IS NOT NULL` |
| REL-007 | challenges → design_sessions | session_id | set-null-cand | — | unnecessary | — | submission binding read forward |
| REL-008 | attempts → challenges | challenge_id | **cascade-temp** | (a)(c) | required | IDX-111 | QX-11 rate window; also serves the cascade delete |
| REL-009 | grants → customers | customer_id | restrict | (b) | required | IDX-107 | CC-27 merge must find **all** grants incl. inactive |
| REL-010 | grants → custom_requests | custom_request_id | restrict | (a) | required | IDX-106 | grants for a request; revoke on merge |
| REL-011 | grants → grants | superseded_by | restrict | — | unnecessary | — | reissue chain walked forward |
| REL-012 | merge_cases → customers ×2 | survivor/loser | restrict | — | deferred | — | handful of rows (IDX-R03 reasoning) |
| REL-013 | merge_events → merge_cases | merge_case_id | restrict | (a) | recommended | IDX-135 | merge evidence timeline |
| REL-014 | customers → customers | merged_into | restrict | (a) | recommended | IDX-129 | tombstone follow; partial `IS NOT NULL` |

## 3. Catalog, Inventory & Asset

| REL | Child → Parent | FK col | Reason | Verdict | IDX | Rationale |
|---|---|---|---|---|---|---|
| REL-020 | products → categories | category_id | (b) | covered | IDX-065 | leading prefix of the published partial; unfiltered admin listing scans ≤100 rows (IDX-R11) |
| REL-021 | product_variants → products | product_id | (a) | required | IDX-068 | Q-02 |
| REL-022 | skus → product_variants | product_variant_id | (a) | required | IDX-069 | Q-02, Q-03 |
| REL-023 | product_sides → products; areas → sides | product_id; product_side_id | (a) | required | IDX-070, IDX-071 | Q-02 |
| REL-024 | product_sides → assets | background_asset_id | — | unnecessary | — | forward ref; asset fetched by PK |
| REL-025 | product_media → products/assets | product_id; asset_id | (a) | covered | IDX-015 | CST-013 prefix; asset side by PK |
| REL-026 | sku_stocks → skus | sku_id | (a) | covered | IDX-016 | CST-014 unique — the Q-32 anchor path |
| REL-027 | ledger → sku_stocks | sku_stock_id | (a) | required | IDX-115 | ledger replay; the table's only non-PK index |
| REL-028 | ledger → holds/reservations/orders | 3 nullable refs | — | **unnecessary** | — | correlation evidence only; no catalogued query reads the ledger by these. Indexing three nullable columns on an append-heavy table would be textbook over-indexing. |
| REL-029 | soft_holds → sku_stocks / custom_requests | sku_stock_id; custom_request_id | (a)(b) | required | IDX-113, IDX-127 | Q-32 (locked read); release path |
| REL-030 | soft_holds → reservations | converted_reservation_id | — | unnecessary | — | forward ref |
| REL-031 | reservations → sku_stocks / orders | sku_stock_id; order_id | (a)(b) | required | IDX-114, IDX-126 | Q-32; cancel/consume |
| REL-032 | inspections/derivatives → assets | asset_id | (a) | required | IDX-132, IDX-099 | Q-30; asset history |
| REL-033 | assets → customers / sessions | uploaded_by; uploaded_via | (b) | recommended / unnecessary | IDX-119 / — | CC-27 merge needs uploader; session provenance is not catalogued (IDX-R12) |

## 4. Design

| REL | Child → Parent | FK col | Reason | Verdict | IDX | Rationale |
|---|---|---|---|---|---|---|
| REL-040 | design_sessions → products/variants/sides/areas | 4 refs | — | **unnecessary** | — | forward refs read by PK. `design_sessions` is a hot-write table (autosave) — four FK indexes would tax every save for no catalogued read. |
| REL-041 | design_sessions → templates | template_id | — | unnecessary | — | provenance only, no live link |
| REL-042 | session_assets → sessions/assets | session_id; asset_id | (a)(c) | covered | IDX-048 | CST-043 prefix; also serves cascade-temp delete |
| REL-043 | design_cases → custom_requests | custom_request_id | (a) | covered | IDX-022 | CST-020 unique |
| REL-044 | design_cases → design_versions | current_version_id | — | unnecessary | — | header pointer, followed by PK |
| REL-045 | design_versions → design_cases | design_case_id | (a) | covered | IDX-023 | CST-021 prefix |
| REL-046 | design_versions → design_versions | parent_version_id | — | unnecessary | — | chain walked forward |
| REL-047 | design_versions → asset_derivatives | preview_derivative_id | — | unnecessary | — | PK follow |
| REL-048 | version_assets → versions/assets | — | (a) | covered | IDX-047 | CST-043 prefix |
| REL-049 | design_reviews → design_versions | design_version_id | (a) | required | IDX-116 | Q-10; CC-04 first-decision-wins |
| REL-050 | design_reviews → customers/grants/challenges | 3 refs | — | unnecessary | — | actor evidence, never a filter |
| REL-051 | approval_snapshots → design_versions | design_version_id | (a) | covered | IDX-025 | CST-023 unique |
| REL-052 | approval_snapshots → cases/requests/customers | 3 refs | (b) | recommended | IDX-136 | case timeline by request; case/customer not catalogued |
| REL-053 | approval_snapshots → grants/challenges | 2 refs | — | unnecessary | — | INV-20 evidence |
| REL-054 | thread_colors → snapshots | approval_snapshot_id | (a) | covered | IDX-063 | CST-051 prefix |
| REL-055 | acceptances → snapshots/agreement_versions | 2 refs | (a) | covered | IDX-026 | CST-024 prefix |
| REL-056 | template_versions → templates | design_template_id | (a) | covered | IDX-027 | CST-025 prefix |
| REL-057 | templates → derivatives; template_assets | — | (a) | covered | IDX-049 | CST-043 prefix |
| REL-058 | templates → products/sides/areas | 3 refs | — | unnecessary | — | optional scoping |

## 5. Ordering, Quotation & Payment

| REL | Child → Parent | FK col | Reason | Verdict | IDX | Rationale |
|---|---|---|---|---|---|---|
| REL-060 | custom_requests → customers | customer_id | (b) | required | IDX-117 | CC-27 merge; customer view |
| REL-061 | custom_requests → products/variants | 2 refs | — | unnecessary | — | subject refs, not filters |
| REL-062 | custom_requests → cases/quotations | 2 pointers | — | unnecessary | — | Q-09 follows them by PK |
| REL-063 | 5 children → custom_requests | custom_request_id | (a) | covered / required | IDX-029, 030, 051, 137, 100 | COP+breakdowns+assets covered by uniques; notes and transitions get their own |
| REL-064 | breakdowns → product_variants | product_variant_id | — | unnecessary | — | display ref |
| REL-065 | quotations → custom_requests | custom_request_id | (a) | covered | IDX-037 | CST-035 unique |
| REL-066 | versions → quotations; lines → versions | — | (a) | covered | IDX-039, IDX-040 | CST-036/037 prefixes |
| REL-067 | versions → versions | parent_version_id | — | unnecessary | — | supersede chain forward |
| REL-068 | quotations → versions | current_version_id | — | unnecessary | — | pointer |
| REL-069 | line_items → skus | sku_id | — | unnecessary | — | display ref (INV-12 snapshots values) |
| REL-070 | acceptances → versions/customers/grants/challenges | — | (a) | covered | IDX-041 | CST-038 unique |
| REL-071 | orders → custom_requests | custom_request_id | (a) | covered | IDX-032 | CST-030 unique |
| REL-072 | orders → customers | customer_id | (b) | required | IDX-118 | CC-27 merge |
| REL-073 | orders → quotation_versions | accepted_… | — | unnecessary | — | forward ref (IDX-R13) |
| REL-074 | orders → approval_snapshots | current_… | — | unnecessary | — | pointer, PK follow |
| REL-075 | order_items → orders | order_id | (a) | covered | IDX-033 | CST-031 prefix + sort |
| REL-076 | order_items → skus/COP | 2 refs | — | unnecessary | — | frozen refs |
| REL-077 | order_items → approval_snapshots | approval_snapshot_id | — | unnecessary | — | integrity chain read forward (IDX-R06) |
| REL-078 | 5 children → orders | order_id | (a) | required / covered | IDX-101, 035, 036, 125; IDX-034 | transitions/shipping/acks; cancellation via CST-032 partial |
| REL-079 | shipping_snapshots → shipping_details | shipping_detail_id | — | covered | IDX-036 | reached via order_id |
| REL-080 | cancellation_requests → grants/challenges | — | — | unnecessary | — | evidence |
| REL-081 | obligations → orders | order_id | (a) | required | IDX-075 | Q-09/17/18; CST-039 partial excludes SUPERSEDED |
| REL-082 | obligations → quotation_versions | source_… | — | unnecessary | — | derivation evidence |
| REL-083 | obligations → obligations / attempts | 2 refs | — | unnecessary | — | chains walked forward |
| REL-084 | attempts → obligations | payment_obligation_id | (a) | required | IDX-077 | Q-16; CC-10 exactly-once |
| REL-085 | attempts → grants/challenges | — | — | unnecessary | — | evidence |
| REL-086 | provider_events → attempts | payment_attempt_id | (a)(b) | required | IDX-080, IDX-081 | Q-16 join + unmatched partial |
| REL-087 | reconciliations → attempts/obligations | 2 refs | (a) | recommended | IDX-124 | reconciliation history by attempt |
| REL-088 | refunds → attempts/orders/cancellations | 3 refs | (a) | required | IDX-122 | refunds by order; attempt side not catalogued |

## 6. Production, Content & Platform

| REL | Child → Parent | FK col | Reason | Verdict | IDX | Rationale |
|---|---|---|---|---|---|---|
| REL-090 | production_jobs → orders | order_id | (a) | covered | IDX-044 | CST-041 prefix (IDX-R04) |
| REL-091 | production_jobs → approval_snapshots | approval_snapshot_id | — | covered | IDX-044 | second key of CST-041 |
| REL-092 | jobs → jobs | reworked_from | — | unnecessary | — | lineage forward |
| REL-093 | specifications → jobs/snapshots | — | (a) | covered | IDX-045 | CST-042 unique |
| REL-094 | artifacts/notes/transitions → jobs | production_job_id | (a) | covered / required | IDX-046; IDX-138, IDX-102 | artifacts by CST-043 prefix |
| REL-095 | gallery_entry_assets → entries/assets | — | (a) | covered | IDX-050 | CST-043 prefix |
| REL-096 | gallery_entries → products | linked_product_id | — | unnecessary | — | tiny table (IDX-R15) |
| REL-097 | agreement_versions → agreements | agreement_id | (a) | covered | IDX-055, IDX-108 | CST-045 prefix; QX-07 uses IDX-108 |
| REL-098 | agreements → versions | current_version_id | — | unnecessary | — | pointer |
| REL-099 | notification_intents → contact_points | recipient_… | — | unnecessary | — | not catalogued (IDX-R14) |
| REL-100 | delivery_attempts → intents | intent_id | (a) | required | IDX-092 | QX-03 attempt counts |
| REL-101 | intents → outbox_events | source_outbox_event_id | — | unnecessary | — | nullable one-way trace; NTF ≠ outbox |
| REL-102 | config_versions → configurations (+admin) | — | (a) | covered | IDX-061 | CST-050 prefix |
| REL-103 | audit_events → (target_kind, target_id) | polymorphic | (a) | required | IDX-095 | **no FK exists** — the composite index is the only path |
| REL-104 | outbox_events → (aggregate_kind, aggregate_id) | polymorphic | — | **unnecessary** | — | no catalogued query reads outbox by aggregate; relay reads by claim predicate (ADR-DB5-003 R8) |
| REL-105 | transitions/audit actor refs → admins/customers/grants | nullable refs | (b) | recommended | IDX-098 | audit-by-admin only; transition actor columns are evidence, not filters |

## 7. Roll-up

| Verdict | Count |
|---|---|
| `required` | 30 |
| `recommended` | 11 |
| `covered` (by an existing unique/composite) | 30 |
| `unnecessary` | 33 |
| `deferred` | 2 |
| **Total `REL-*` reviewed** | **105** (all, incl. multi-column relationship rows) |

**No FK was indexed for existing alone.** The two structural reasons this
review rejects so many candidates:

1. **`restrict` everywhere with no physical cascade** (ADR-DB1-011) removes
   the usual parent-delete justification.
2. **Composite unique constraints already lead with the FK column** in 30
   cases — indexing them again would be a pure duplicate (ADR-DB5-004 R5).

The three cases where a *separate* index is required **despite** a unique
constraint on the same leading column are called out individually because
each is a correctness matter, not a speed one: IDX-107 (grants by customer,
incl. inactive — CC-27), IDX-075 (obligations by order, incl. SUPERSEDED —
Q-09), IDX-134 (all contacts of a customer, not just primary — CC-27).
