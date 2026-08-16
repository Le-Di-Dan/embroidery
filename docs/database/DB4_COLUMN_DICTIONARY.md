# DB4 — Column Dictionary

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Nature:** Logical column definitions — PostgreSQL-compatible **type
families** only (uuid, bigint, integer, text, boolean, numeric, timestamptz,
date, jsonb). No SQL syntax; exact DDL → DB6.

## 1. Legend and standard columns

- **COL IDs:** `COL-<TBL>-<nn>` (format example: `COL-TBL0xx-nn`). **Standard columns
  are defined once here** and exist on every table with reserved IDs:
  - `COL-<TBL>-00a` — `id` · PK · not null · immutable · uuid (UUIDv7
    app-generated) for `uuid7` tables, bigint identity for `bigint` tables
    (per [`DB4_TABLE_CATALOG.md`](./DB4_TABLE_CATALOG.md) PK column).
  - `COL-<TBL>-00b` — `created_at` · timestamptz · not null · immutable ·
    default now-semantics.
  - `COL-<TBL>-00c` — `updated_at` · timestamptz · not null · mutable —
    **only on tables whose catalog Mut is mutable/header/column-scoped**;
    never on append-only/immutable/version/snapshot tables (ADR-DB1-006).
- **N?** nullable · **M?** mutable after insert (`frz` = frozen at a
  lifecycle event, noted). Money = `numeric(14,2)` + row `currency_code`
  (ADR-DB4-001); percentages `numeric(5,2)`.
- Markers in Notes: `[PII]` sensitive personal data (anonymization target) ·
  `[SEC]` secret-adjacent (hashes only, never plaintext) · `[R]` reason
  required-with-R (app-enforced + DB7) · `→t` FK/reference to table `t` ·
  `UQ`/`CK` unique/check semantics (IDs in
  [`DB4_KEYS_AND_CONSTRAINTS.md`](./DB4_KEYS_AND_CONSTRAINTS.md)) · `[cfg]`
  value/limit from policy configuration.
- Status columns are `text` + CHECK with the exact DB3 state sets
  ([`DB3_DB4_HANDOFF.md`](./DB3_DB4_HANDOFF.md) §1); not repeated per row.

## 2. Identity (CTX-IDN)

### TBL-001 `admin_accounts`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL001-01 | email | text | no | yes | normalized login/contact; UQ |
| COL-TBL001-02 | display_name | text | no | yes | |
| COL-TBL001-03 | status | text | no | yes | ACTIVE/LOCKED/DISABLED; partial UQ one ACTIVE (REQ-IDN-001) |
| COL-TBL001-04 | locked_at | timestamptz | yes | yes | lockout timestamp |
| COL-TBL001-05 | disabled_at | timestamptz | yes | yes | terminal for this record |
| COL-TBL001-06 | replaced_by_admin_account_id | uuid | yes | yes | →admin_accounts; successor on replacement |

### TBL-002 `admin_credentials`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL002-01 | admin_account_id | uuid | no | no | →admin_accounts |
| COL-TBL002-02 | credential_kind | text | no | no | provider-abstract (password_hash/otp_binding/webauthn…); final set at provider ADR (DEC-29) |
| COL-TBL002-03 | credential_reference | text | no | yes | [SEC] hashed/opaque provider reference; **never plaintext secret** (CK direction) |
| COL-TBL002-04 | rotated_at | timestamptz | yes | yes | last rotation |
| COL-TBL002-05 | revoked_at | timestamptz | yes | yes | |

### TBL-003 `admin_sessions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL003-01 | admin_account_id | uuid | no | no | →admin_accounts |
| COL-TBL003-02 | token_hash | text | no | no | [SEC] UQ; hashed session token |
| COL-TBL003-03 | status | text | no | yes | ACTIVE/EXPIRED/REVOKED |
| COL-TBL003-04 | expires_at | timestamptz | no | no | [cfg] |
| COL-TBL003-05 | revoked_at | timestamptz | yes | yes | |
| COL-TBL003-06 | client_metadata | text | yes | no | coarse device/IP summary for alerts (no fingerprint dump) |

## 3. Customer (CTX-CUS)

### TBL-004 `customers`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL004-01 | display_name | text | yes | yes | [PII] anonymization target |
| COL-TBL004-02 | verified_at | timestamptz | no | no | creation = first verified submission (ADR-DB2-001) |
| COL-TBL004-03 | merged_into_customer_id | uuid | yes | yes | →customers; tombstone pointer set by merge; CK ≠ id |
| COL-TBL004-04 | anonymized_at | timestamptz | yes | yes | field-level scrub marker (ADR-DB1-011) |
| COL-TBL004-05 | notes | text | yes | yes | admin-facing notes [PII-adjacent] |

### TBL-078 `business_profiles`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL078-01 | customer_id | uuid | no | no | →customers; UQ (1–0..1) |
| COL-TBL078-02 | company_name | text | no | yes | [PII] |
| COL-TBL078-03 | tax_code | text | yes | yes | [PII] |
| COL-TBL078-04 | billing_contact | text | yes | yes | [PII] dormant B2B readiness; no workflow reads it in MVP |

### TBL-005 `customer_contact_points`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL005-01 | customer_id | uuid | no | no | →customers |
| COL-TBL005-02 | contact_kind | text | no | no | EMAIL/PHONE (CK) |
| COL-TBL005-03 | normalized_value | text | no | no | [PII] lowercase email / E.164-style phone (CON-163/164); partial UQ active-verified link |
| COL-TBL005-04 | display_value | text | no | yes | [PII] as-entered display copy |
| COL-TBL005-05 | is_primary | boolean | no | yes | partial UQ one primary per customer |
| COL-TBL005-06 | verified_at | timestamptz | yes | yes | link active when set and not deactivated |
| COL-TBL005-07 | verified_source | text | yes | yes | challenge purpose/channel evidence ref |
| COL-TBL005-08 | deactivated_at | timestamptz | yes | yes | link re-point/merge disposition |
| COL-TBL005-09 | anonymized_at | timestamptz | yes | yes | PII scrub marker |

### TBL-006 `contact_verification_challenges`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL006-01 | contact_point_id | uuid | yes | no | →customer_contact_points; nullable for submission-time contacts not yet linked to a customer |
| COL-TBL006-02 | contact_kind | text | no | no | EMAIL/PHONE |
| COL-TBL006-03 | normalized_value | text | no | no | [PII] challenge target (pre-customer challenges carry the raw target) |
| COL-TBL006-04 | purpose | text | no | no | SUBMISSION/STEP_UP (CK); partial UQ one open per (target, purpose) |
| COL-TBL006-05 | code_hash | text | no | no | [SEC] hashed OTP; plaintext never stored (D7-12) |
| COL-TBL006-06 | status | text | no | yes | ISSUED/VERIFIED/FAILED/EXPIRED/CANCELLED |
| COL-TBL006-07 | expires_at | timestamptz | no | no | [cfg] |
| COL-TBL006-08 | verified_at | timestamptz | yes | yes | |
| COL-TBL006-09 | session_id | uuid | yes | no | →design_sessions; submission-flow binding |

### TBL-007 `contact_verification_attempts`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL007-01 | challenge_id | uuid | no | no | →contact_verification_challenges |
| COL-TBL007-02 | outcome | text | no | no | MATCH/MISMATCH/EXPIRED_AT_ENTRY (CK) |
| COL-TBL007-03 | attempted_at | timestamptz | no | no | rate-limit input (GRD-026) |

### TBL-008 `secure_access_grants`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL008-01 | customer_id | uuid | no | no | →customers |
| COL-TBL008-02 | custom_request_id | uuid | no | no | →custom_requests; scope binding (INV-08) |
| COL-TBL008-03 | token_hash | text | no | no | [SEC] UQ; high-entropy token stored hashed only (ADR-DB3-004 r7) |
| COL-TBL008-04 | scope_kind | text | no | no | REQUEST_ACCESS (CK; single grant type per ADR-DB3-004 r1 — per-action authorization derives from kind + step-up; a future multi-scope model adds a child table additively) |
| COL-TBL008-05 | status | text | no | yes | ACTIVE/EXPIRED/REVOKED |
| COL-TBL008-06 | expires_at | timestamptz | no | no | [cfg] grant.standard class |
| COL-TBL008-07 | revoked_at | timestamptz | yes | yes | |
| COL-TBL008-08 | revoke_reason | text | yes | yes | [R] on admin revoke |
| COL-TBL008-09 | superseded_by_grant_id | uuid | yes | yes | →secure_access_grants; reissue chain |

### TBL-009 `customer_merge_cases`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL009-01 | survivor_customer_id | uuid | no | no | →customers |
| COL-TBL009-02 | loser_customer_id | uuid | no | no | →customers; CK ≠ survivor |
| COL-TBL009-03 | status | text | no | yes | REQUESTED/EXECUTED/REJECTED |
| COL-TBL009-04 | reason | text | no | no | [R] always (both branches) |
| COL-TBL009-05 | requested_by_admin_id | uuid | no | no | →admin_accounts |
| COL-TBL009-06 | decided_at | timestamptz | yes | yes | executed/rejected timestamp |

### TBL-010 `customer_merge_events`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL010-01 | merge_case_id | uuid | no | no | →customer_merge_cases |
| COL-TBL010-02 | step_kind | text | no | no | OWNERSHIP_TRANSFER/CONTACT_MOVE/GRANT_REVOKE/TOMBSTONE (CK) |
| COL-TBL010-03 | subject_table | text | no | no | operational correlation (justified cross-cutting reference, task §8.3) |
| COL-TBL010-04 | subject_id | text | no | no | id of the repointed row (as text; uuid or bigint) |
| COL-TBL010-05 | detail | text | yes | no | transfer summary (no PII dump) |

## 4. Catalog (CTX-CAT)

Shared SEO columns (CON-027) — present on `categories`, `products`,
`gallery_entries`, `content_pages` with per-table COL IDs noted as
`seo_title` text/yes/yes, `seo_description` text/yes/yes, `is_indexable`
boolean/no/yes; listed once per table below by ID only.

### TBL-011 `categories`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL011-01 | name | text | no | yes | |
| COL-TBL011-02 | slug | text | no | yes | UQ |
| COL-TBL011-03 | description | text | yes | yes | |
| COL-TBL011-04 | display_order | integer | no | yes | |
| COL-TBL011-05 | status | text | no | yes | DRAFT/PUBLISHED/ARCHIVED |
| COL-TBL011-06 | archived_at | timestamptz | yes | yes | |
| COL-TBL011-07..09 | seo_title / seo_description / is_indexable | text/text/boolean | yes/yes/no | yes | SEO VO |

### TBL-012 `products`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL012-01 | category_id | uuid | no | yes | →categories |
| COL-TBL012-02 | name | text | no | yes | |
| COL-TBL012-03 | slug | text | no | yes | UQ (Q-02) |
| COL-TBL012-04 | description | text | yes | yes | |
| COL-TBL012-05 | base_price_amount | numeric | no | yes | CK ≥ 0; display base price; never referenced by history (INV-12 — snapshots copy) |
| COL-TBL012-06 | currency_code | text | no | yes | CK 'VND' (ADR-DB4-001) |
| COL-TBL012-07 | status | text | no | yes | DRAFT/PUBLISHED/ARCHIVED (LC-04) |
| COL-TBL012-08 | archived_at | timestamptz | yes | yes | |
| COL-TBL012-09 | is_display_out_of_stock | boolean | no | yes | manual availability override (LC-05: override OUT wins; cannot force AVAILABLE) |
| COL-TBL012-10 | display_order | integer | no | yes | Q-01 sort |
| COL-TBL012-11..13 | seo_title / seo_description / is_indexable | text/text/boolean | yes/yes/no | yes | SEO VO |

### TBL-013 `product_variants`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL013-01 | product_id | uuid | no | no | →products |
| COL-TBL013-02 | color_name | text | yes | yes | |
| COL-TBL013-03 | size_label | text | yes | yes | |
| COL-TBL013-04 | display_order | integer | no | yes | |
| COL-TBL013-05 | is_active | boolean | no | yes | delisting a variant without archive |

### TBL-014 `skus`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL014-01 | product_variant_id | uuid | no | no | →product_variants |
| COL-TBL014-02 | code | text | no | yes | UQ; business SKU code |
| COL-TBL014-03 | price_override_amount | numeric | yes | yes | CK ≥ 0; optional SKU-level price |
| COL-TBL014-04 | currency_code | text | no | yes | CK 'VND' |
| COL-TBL014-05 | is_active | boolean | no | yes | sellable flag (definition side) |

### TBL-015 `product_sides`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL015-01 | product_id | uuid | no | no | →products |
| COL-TBL015-02 | name | text | no | yes | e.g. front/back |
| COL-TBL015-03 | background_asset_id | uuid | no | yes | →assets (ADR-DB4-003 direct ref) |
| COL-TBL015-04 | image_width_px | integer | no | yes | CK > 0 |
| COL-TBL015-05 | image_height_px | integer | no | yes | CK > 0 |
| COL-TBL015-06 | physical_width_mm | numeric | no | yes | CK > 0 (CON-028) |
| COL-TBL015-07 | physical_height_mm | numeric | no | yes | CK > 0 |
| COL-TBL015-08 | px_per_mm | numeric | no | yes | CK > 0; coordinate mapping (CON-029) |
| COL-TBL015-09 | display_order | integer | no | yes | |

### TBL-016 `embroidery_areas`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL016-01 | product_side_id | uuid | no | no | →product_sides |
| COL-TBL016-02 | name | text | no | yes | |
| COL-TBL016-03 | bound_x_px / bound_y_px | numeric | no | yes | canvas origin of area (2 columns: -03a/-03b) |
| COL-TBL016-04 | bound_width_px / bound_height_px | numeric | no | yes | CK > 0 (2 columns: -04a/-04b) |
| COL-TBL016-05 | max_width_mm | numeric | yes | yes | CK > 0 when set |
| COL-TBL016-06 | max_height_mm | numeric | yes | yes | CK > 0 when set |
| COL-TBL016-07 | display_order | integer | no | yes | |

### TBL-017 `product_media`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL017-01 | product_id | uuid | no | no | →products |
| COL-TBL017-02 | asset_id | uuid | no | no | →assets |
| COL-TBL017-03 | role | text | no | yes | GALLERY/THUMBNAIL/DETAIL (CK); UQ (product, asset, role) |
| COL-TBL017-04 | display_order | integer | no | yes | |

## 5. Inventory (CTX-INV)

### TBL-018 `sku_stocks`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL018-01 | sku_id | uuid | no | no | →skus; UQ (one stock row per SKU) |
| COL-TBL018-02 | quantity_on_hand | integer | no | yes | CK ≥ 0 (INV-18); mutated only inside row-locked tx with ledger append |
| COL-TBL018-03 | low_stock_threshold | integer | yes | yes | CK ≥ 0; Q-20 input |

### TBL-019 `inventory_ledger_entries`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL019-01 | sku_stock_id | uuid | no | no | →sku_stocks |
| COL-TBL019-02 | entry_kind | text | no | no | ADJUSTMENT/HOLD_PLACED/HOLD_RELEASED/HOLD_EXPIRED/HOLD_CONVERTED/RESERVED/RESERVATION_RELEASED/RESERVATION_EXPIRED/CONSUMED (CK) |
| COL-TBL019-03 | quantity | integer | no | no | CK > 0; direction implied by kind |
| COL-TBL019-04 | on_hand_delta | integer | no | no | signed effect on quantity_on_hand (0 for pure hold moves) |
| COL-TBL019-05 | soft_hold_id | uuid | yes | no | →inventory_soft_holds |
| COL-TBL019-06 | reservation_id | uuid | yes | no | →inventory_reservations |
| COL-TBL019-07 | order_id | uuid | yes | no | →orders (correlation) |
| COL-TBL019-08 | reason | text | yes | no | [R] mandatory for ADJUSTMENT (GRD-023; CK candidate kind=ADJUSTMENT → reason NOT NULL) |
| COL-TBL019-09 | actor_kind / admin_id / system_job_key | text/uuid/text | no/yes/yes | no | actor evidence (3 columns -09a/-09b/-09c) |

### TBL-020 `inventory_soft_holds`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL020-01 | sku_stock_id | uuid | no | no | →sku_stocks |
| COL-TBL020-02 | custom_request_id | uuid | no | no | →custom_requests |
| COL-TBL020-03 | quantity | integer | no | no | CK > 0 |
| COL-TBL020-04 | status | text | no | yes | HELD/CONVERTED/RELEASED/EXPIRED; partial UQ active per (request, sku_stock) |
| COL-TBL020-05 | expires_at | timestamptz | no | no | [cfg] mandatory (no TTL config → holds disabled, ADR-DB1-018) |
| COL-TBL020-06 | released_reason | text | yes | yes | [R] on manual release |
| COL-TBL020-07 | converted_reservation_id | uuid | yes | yes | →inventory_reservations |

### TBL-021 `inventory_reservations`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL021-01 | sku_stock_id | uuid | no | no | →sku_stocks |
| COL-TBL021-02 | order_id | uuid | no | no | →orders; created only post approval+deposit (INV-05, GRD-013 — TX guard) |
| COL-TBL021-03 | quantity | integer | no | no | CK > 0 |
| COL-TBL021-04 | status | text | no | yes | RESERVED/CONSUMED/RELEASED/EXPIRED; partial UQ active per (order, sku_stock) |
| COL-TBL021-05 | expires_at | timestamptz | yes | no | [cfg] explicit; NULL = no-expiry per policy (ADR-DB1-018 r3) |
| COL-TBL021-06 | released_reason | text | yes | yes | [R] manual release/override |
| COL-TBL021-07 | terminalized_at | timestamptz | yes | yes | consumed/released/expired timestamp |

## 6. Asset (CTX-AST)

### TBL-022 `assets`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL022-01 | kind | text | no | no | CUSTOMER_UPLOAD/TEMPLATE_SOURCE/PRODUCTION_FILE/CATALOG_MEDIA/GALLERY_MEDIA (CK) |
| COL-TBL022-02 | classification | text | no | no | CUSTOMER_PRIVATE/PRODUCTION_SENSITIVE/PUBLIC (CK); private-by-default (INV-09); drives signed access (CON-044) |
| COL-TBL022-03 | storage_key | text | no | no | UQ; internal object reference (CON-043); **binary never in PG** (INV-10) |
| COL-TBL022-04 | mime_type | text | no | no | |
| COL-TBL022-05 | size_bytes | bigint | no | no | CK > 0 |
| COL-TBL022-06 | checksum | text | yes | no | `sha256:<hex>` of binary |
| COL-TBL022-07 | status | text | no | yes | UPLOADED/INSPECTING/ACCEPTED/REJECTED/DELETION_PENDING/DELETED (LC-06) |
| COL-TBL022-08 | uploaded_by_customer_id | uuid | yes | no | →customers (nullable: guest/admin uploads) |
| COL-TBL022-09 | uploaded_via_session_id | uuid | yes | no | →design_sessions |
| COL-TBL022-10 | deletion_requested_at | timestamptz | yes | yes | tombstone phase 1 |
| COL-TBL022-11 | deletion_reason | text | yes | yes | [R] admin-decided deletion |
| COL-TBL022-12 | deleted_at | timestamptz | yes | yes | tombstone final (binary confirmed deleted) |
| — (APP5-DB01) | uploaded_via_challenge_id | uuid | yes | yes | →contact_verification_challenges (REL-106, `ON DELETE SET NULL`); the challenge that authorized an APP5 pre-submission customer upload. Server-owned, never client-supplied. The scope `APP5-G01 D13`'s "20 accepted uploads per challenge" is counted in — customer scope is **not** equivalent, because CST-007 uniqueness is per `(contact_kind, normalized_value, purpose)` and one customer can hold an EMAIL and a PHONE `VERIFIED SUBMISSION` challenge at once. Mutually exclusive with `uploaded_via_session_id` (CST-127) |
| — (APP5-DB01) | intake_expires_at | timestamptz | yes | yes | durable due-time anchor for the future orphan sweep, written from the authoritative challenge expiry at intake. Server-owned. Required whenever the challenge lane is used (CST-128) and deliberately **survives** the challenge's hard-TTL deletion — a join-only expiry would vanish with the parent and leave every unbound upload unreachable |

### TBL-023 `asset_inspections`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL023-01 | asset_id | uuid | no | no | →assets |
| COL-TBL023-02 | outcome | text | no | no | ACCEPTED/REJECTED (CK) |
| COL-TBL023-03 | detail | text | yes | no | validation findings (`09 §4`) |
| COL-TBL023-04 | inspected_at | timestamptz | no | no | |

### TBL-024 `asset_derivatives`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL024-01 | asset_id | uuid | no | no | →assets (parent) |
| COL-TBL024-02 | kind | text | no | no | PREVIEW_WATERMARKED/MOCKUP/NORMALIZED/THUMBNAIL/**CATALOG_PREVIEW** (CK); partial UQ active per (asset, kind). `CATALOG_PREVIEW` added by APP2-DB01: the catalog display derivative of a CATALOG_MEDIA asset, never watermarked — a different concept from the customer/design `PREVIEW_WATERMARKED` |
| COL-TBL024-03 | status | text | no | yes | PENDING/PROCESSING/READY/FAILED |
| COL-TBL024-04 | storage_key | text | yes | yes | UQ when set; set at READY |
| COL-TBL024-05 | checksum | text | yes | yes | `sha256:<hex>` of derivative binary (preview_hash source) |
| COL-TBL024-06 | is_watermarked | boolean | no | no | INV-22: customer-visible previews true; internal artifacts false. Physically bound to `kind` for the two kinds whose identity is the watermark decision (CST-126, APP2-DB01); the other three stay application-governed |

## 7. Design (CTX-DSN)

### TBL-025 `design_sessions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL025-01 | session_secret_hash | text | no | no | [SEC] UQ; guest-capable session identity |
| COL-TBL025-02 | product_id / product_variant_id / product_side_id / embroidery_area_id | uuid ×4 | no/yes/no/no | yes | →catalog geometry (4 columns -02a..-02d; variant optional pre-selection) |
| COL-TBL025-03 | design_document | jsonb | no | yes | working copy (ADR-DB4-004 #1) |
| COL-TBL025-04 | document_schema_version | integer | no | yes | ADR-DB1-012 |
| COL-TBL025-05 | autosave_revision | integer | no | yes | optimistic marker (CC-01, GRD-027); monotonic |
| COL-TBL025-06 | template_id / template_version | uuid/integer | yes | no | →design_templates; clone origin provenance (no live link) |
| COL-TBL025-07 | status | text | no | yes | ACTIVE/SUBMITTED/EXPIRED/DELETED (LC-07) |
| COL-TBL025-08 | expires_at | timestamptz | no | yes | [cfg] O-008 TTL |
| COL-TBL025-09 | last_activity_at | timestamptz | no | yes | retention start event |
| COL-TBL025-10 | submitted_request_id | uuid | yes | yes | →custom_requests (handover evidence) |

### TBL-026 `design_session_assets`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL026-01 | session_id | uuid | no | no | →design_sessions |
| COL-TBL026-02 | asset_id | uuid | no | no | →assets; UQ (session, asset) |

### TBL-027 `design_cases`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL027-01 | custom_request_id | uuid | no | no | →custom_requests; UQ (1–1) |
| COL-TBL027-02 | current_version_id | uuid | yes | yes | →design_versions; header pointer |

### TBL-028 `design_versions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL028-01 | design_case_id | uuid | no | no | →design_cases |
| COL-TBL028-02 | version | integer | no | no | UQ (case, version); per-aggregate sequence |
| COL-TBL028-03 | parent_version_id | uuid | yes | no | →design_versions; chain (REQ-DVER-005) |
| COL-TBL028-04 | status | text | no | yes(frz) | DRAFT/SENT_FOR_REVIEW/REVISION_REQUESTED/APPROVED/SUPERSEDED/VOID; partial UQ single-active-review (INV-16); row frozen once sent (GRD-024 trigger) except legal state advances |
| COL-TBL028-05 | design_document | jsonb | no | frz@sent | ADR-DB4-004 #2; frozen + hashed at send |
| COL-TBL028-06 | document_schema_version | integer | no | frz@sent | |
| COL-TBL028-07 | document_hash | text | yes | frz@sent | `sha256:<hex>` (CK format candidate); NOT NULL once sent (CK candidate) — GRD-007 input |
| COL-TBL028-08 | preview_derivative_id | uuid | yes | yes | →asset_derivatives (watermarked preview) |
| COL-TBL028-09 | preview_hash | text | yes | frz@sent | derivative binary hash captured at send |
| COL-TBL028-10 | product_id / product_variant_id / product_side_id / embroidery_area_id | uuid ×4 | no | frz@sent | placement refs (CON-060; 4 columns -10a..-10d) |
| COL-TBL028-11 | physical_width_mm / physical_height_mm | numeric ×2 | no | frz@sent | CK > 0 (2 columns -11a/-11b) |
| COL-TBL028-12 | sent_at / approved_at / superseded_at / voided_at | timestamptz ×4 | yes | state-scoped | state timestamps = Tier B history (4 columns -12a..-12d) |
| COL-TBL028-13 | void_reason | text | yes | yes | [R] admin void (draft only) |

### TBL-029 `design_version_assets`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL029-01 | design_version_id | uuid | no | no | →design_versions |
| COL-TBL029-02 | asset_id | uuid | no | no | →assets; UQ (version, asset); immutable with version |

### TBL-030 `design_reviews`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL030-01 | design_version_id | uuid | no | no | →design_versions |
| COL-TBL030-02 | outcome | text | no | no | APPROVE/REQUEST_REVISION (CK) |
| COL-TBL030-03 | feedback | text | yes | no | customer feedback |
| COL-TBL030-04 | customer_id / grant_id / step_up_challenge_id | uuid ×3 | no/no/yes | no | actor evidence (3 columns -04a..-04c; step-up required for APPROVE) |
| COL-TBL030-05 | decided_at | timestamptz | no | no | first-decision-wins (CC-04) |

### TBL-031 `approval_snapshots`

All columns immutable (reject-mutation trigger, INV-01).

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL031-01 | design_version_id | uuid | no | no | →design_versions; UQ (one approval per version) |
| COL-TBL031-02 | design_case_id / custom_request_id / customer_id | uuid ×3 | no | no | snapshot anchors (3 columns -02a..-02c) |
| COL-TBL031-03 | document_hash | text | no | no | exact-match evidence (GRD-007, INV-03) |
| COL-TBL031-04 | preview_hash | text | yes | no | `06 §9` |
| COL-TBL031-05 | product_id / product_variant_id / product_side_id / embroidery_area_id | uuid ×4 | no | no | refs (4 columns -05a..-05d) |
| COL-TBL031-06 | product_name / variant_label / side_name / area_name | text ×4 | no/yes/no/no | no | frozen display copies (INV-12; 4 columns -06a..-06d) |
| COL-TBL031-07 | physical_width_mm / physical_height_mm | numeric ×2 | no | no | CK > 0 |
| COL-TBL031-08 | quantity_total | integer | no | no | CK > 0 |
| COL-TBL031-09 | contact_name / contact_email / contact_phone | text ×3 | yes | no | [PII] frozen Contact Snapshot (CON-018); redaction only via break-glass privacy procedure |
| COL-TBL031-10 | grant_id / step_up_challenge_id | uuid ×2 | no | no | secure-flow + step-up evidence (INV-20, GRD-002/003) |
| COL-TBL031-11 | approved_at | timestamptz | no | no | |

### TBL-032 `approval_snapshot_thread_colors`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL032-01 | approval_snapshot_id | uuid | no | no | →approval_snapshots |
| COL-TBL032-02 | position | integer | no | no | UQ (snapshot, position) |
| COL-TBL032-03 | color_code | text | no | no | thread color (CON-059) |
| COL-TBL032-04 | color_name | text | yes | no | |

### TBL-033 `approval_snapshot_agreement_acceptances`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL033-01 | approval_snapshot_id | uuid | no | no | →approval_snapshots |
| COL-TBL033-02 | agreement_version_id | uuid | no | no | →agreement_versions; UQ (snapshot, agreement_version) |
| COL-TBL033-03 | agreement_type | text | no | no | frozen copy of the type accepted |
| COL-TBL033-04 | content_hash | text | no | no | hash at accept time; must equal version hash (GRD-008) |
| COL-TBL033-05 | accepted_at | timestamptz | no | no | |

### TBL-034 `design_templates`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL034-01 | name | text | no | yes | |
| COL-TBL034-02 | slug | text | no | yes | UQ (public listing) |
| COL-TBL034-03 | description | text | yes | yes | |
| COL-TBL034-04 | product_id / product_side_id / embroidery_area_id | uuid ×3 | yes | yes | optional scope (GAP-08); also drives catalog display suggestion filtering — no separate catalog association table needed |
| COL-TBL034-05 | status | text | no | yes | DRAFT/PUBLISHED/ARCHIVED |
| COL-TBL034-06 | current_version | integer | no | yes | version counter; bumped per publish |
| COL-TBL034-07 | preview_derivative_id | uuid | yes | yes | →asset_derivatives (public listing preview) |
| COL-TBL034-08 | archived_at | timestamptz | yes | yes | |

### TBL-035 `design_template_versions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL035-01 | design_template_id | uuid | no | no | →design_templates |
| COL-TBL035-02 | version | integer | no | no | UQ (template, version) |
| COL-TBL035-03 | design_document | jsonb | no | frz@publish | ADR-DB4-004 #3 |
| COL-TBL035-04 | document_schema_version | integer | no | frz@publish | |
| COL-TBL035-05 | published_at | timestamptz | yes | yes | immutable once set; clones stamp (template, version) |

### TBL-036 `design_template_assets`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL036-01 | design_template_id | uuid | no | no | →design_templates |
| COL-TBL036-02 | asset_id | uuid | no | no | →assets; UQ (template, asset); private originals (REQ-TMPL-002) |

## 8. Ordering (CTX-ORD)

### TBL-037 `custom_requests`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL037-01 | code | text | no | no | UQ; human request code (CON-073; format [cfg]); never an authz input |
| COL-TBL037-02 | customer_id | uuid | no | no | →customers |
| COL-TBL037-03 | status | text | no | yes | LC-11 set incl. QUOTE_ACCEPTED |
| COL-TBL037-04 | product_id / product_variant_id | uuid ×2 | yes | yes | →catalog; store-product subject (NULL when COP subject; subject-presence rule = TX/App, cross-table) |
| COL-TBL037-05 | customer_note | text | yes | yes | [PII-adjacent] |
| COL-TBL037-06 | current_design_case_id | uuid | yes | yes | →design_cases; pointer |
| COL-TBL037-07 | current_quotation_id | uuid | yes | yes | →quotations; pointer |
| COL-TBL037-08 | cancelled_reason | text | yes | yes | [R] internal reason |
| COL-TBL037-09 | cancelled_customer_reason | text | yes | yes | customer-visible reason (`06 §11`) |
| COL-TBL037-10 | submitted_session_id | uuid | yes | no | →design_sessions provenance |

### TBL-038 `customer_owned_products`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL038-01 | custom_request_id | uuid | no | no | →custom_requests; UQ (0..1). **By construction no sku_id / stock columns** (INV-13) |
| COL-TBL038-02 | name | text | no | yes | customer's product description |
| COL-TBL038-03 | description | text | yes | yes | material/color/condition notes |
| COL-TBL038-04 | physical_width_mm / physical_height_mm | numeric ×2 | yes | yes | CK > 0 when set |

### TBL-039 `custom_request_quantity_breakdowns`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL039-01 | custom_request_id | uuid | no | no | →custom_requests |
| COL-TBL039-02 | product_variant_id | uuid | yes | yes | →product_variants (NULL for COP lines) |
| COL-TBL039-03 | size_label | text | yes | yes | free-form for COP/B2B lines |
| COL-TBL039-04 | quantity | integer | no | yes | CK > 0; UQ (request, variant, size); mutable until request QUOTED (app-guarded) |

### TBL-040 `custom_request_assets`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL040-01 | custom_request_id | uuid | no | no | →custom_requests |
| COL-TBL040-02 | asset_id | uuid | no | no | →assets |
| COL-TBL040-03 | role | text | no | no | COP_IMAGE/REFERENCE/ATTACHMENT (CK); UQ (request, asset, role) |

### TBL-041 `request_moderation_notes`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL041-01 | custom_request_id | uuid | no | no | →custom_requests |
| COL-TBL041-02 | kind | text | no | no | SPAM/REJECT/PAUSE/CLARIFY/NOTE (CK) |
| COL-TBL041-03 | note | text | no | no | [R] for SPAM/REJECT/PAUSE |
| COL-TBL041-04 | admin_id | uuid | no | no | →admin_accounts |

### TBL-042 `custom_request_transitions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL042-01 | custom_request_id | uuid | no | no | →custom_requests |
| COL-TBL042-02 | from_status / to_status | text ×2 | no | no | LC-11 values |
| COL-TBL042-03 | actor_kind / admin_id / customer_id / grant_id / system_job_key | text/uuid/uuid/uuid/text | no/yes/yes/yes/yes | no | actor evidence (5 columns -03a..-03e) |
| COL-TBL042-04 | reason | text | yes | no | [R] per audit spec (cancel/reject/pause) |
| COL-TBL042-05 | customer_visible_reason | text | yes | no | |
| COL-TBL042-06 | correlation_id | text | no | no | request-ID linkage (audit spec) |

### TBL-043 `orders`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL043-01 | code | text | no | no | UQ; human order code (CON-082; format [cfg]) |
| COL-TBL043-02 | custom_request_id | uuid | no | no | →custom_requests; UQ — request→order (INV-19, GRD-009) |
| COL-TBL043-03 | customer_id | uuid | no | no | →customers |
| COL-TBL043-04 | accepted_quotation_version_id | uuid | no | no | →quotation_versions; commercial basis (frozen ref) |
| COL-TBL043-05 | current_approval_snapshot_id | uuid | no | yes | →approval_snapshots; **audited pointer**, repointed on post-approval revision (ADR-DB3-003 r4); historical snapshots retained |
| COL-TBL043-06 | status | text | no | yes | LC-14 11-state set incl. ON_HOLD/CANCELLING |
| COL-TBL043-07 | total_amount | numeric | no | no | CK ≥ 0; frozen copy of accepted total at creation (INV-12) |
| COL-TBL043-08 | currency_code | text | no | no | CK 'VND' |
| COL-TBL043-09 | hold_reason | text | yes | yes | [R] set on ON_HOLD |
| COL-TBL043-10 | cancelled_reason / cancelled_customer_reason | text ×2 | yes | yes | [R] internal + customer-visible |
| COL-TBL043-11 | delivered_at / completed_at | timestamptz ×2 | yes | yes | fulfillment timestamps |

### TBL-044 `order_items`

All columns immutable (INV-12 trigger).

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL044-01 | order_id | uuid | no | no | →orders |
| COL-TBL044-02 | position | integer | no | no | UQ (order, position) |
| COL-TBL044-03 | sku_id | uuid | yes | no | →skus (NULL for COP subject) |
| COL-TBL044-04 | customer_owned_product_id | uuid | yes | no | →customer_owned_products; CK exactly one of sku_id / cop_id set |
| COL-TBL044-05 | product_name / variant_label / size_label | text ×3 | no/yes/yes | no | frozen display snapshot |
| COL-TBL044-06 | quantity | integer | no | no | CK > 0 |
| COL-TBL044-07 | unit_price_amount / line_total_amount | numeric ×2 | no | no | CK ≥ 0; frozen from accepted quotation version |
| COL-TBL044-08 | currency_code | text | no | no | CK 'VND' |
| COL-TBL044-09 | approval_snapshot_id | uuid | no | no | →approval_snapshots; NOT NULL (D7-07) |

### TBL-045 `order_transitions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL045-01 | order_id | uuid | no | no | →orders |
| COL-TBL045-02 | from_status / to_status | text ×2 | no | no | LC-14 values |
| COL-TBL045-03 | event_kind | text | no | no | STATE_CHANGE/DELIVERY_EVENT/SAGA_STEP/SHIPPING_FREEZE/POINTER_MOVE/POST_FREEZE_CORRECTION (CK) |
| COL-TBL045-04 | saga_step | text | yes | no | cancellation step id (spec §2) for SAGA_STEP rows |
| COL-TBL045-05 | actor_kind / admin_id / customer_id / grant_id / system_job_key | text/uuid/uuid/uuid/text | no/yes/yes/yes/yes | no | actor evidence (5 columns -05a..-05e) |
| COL-TBL045-06 | reason | text | yes | no | [R] hold/cancel/correction |
| COL-TBL045-07 | customer_visible_reason | text | yes | no | |
| COL-TBL045-08 | correlation_id | text | no | no | |

### TBL-046 `order_cancellation_requests`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL046-01 | order_id | uuid | no | no | →orders; partial UQ one open per order |
| COL-TBL046-02 | stage | text | no | no | S4..S8 (CK; S1–S3 are request-level, no review record) |
| COL-TBL046-03 | initiator | text | no | no | CUSTOMER/ADMIN (CK) |
| COL-TBL046-04 | status | text | no | yes | PENDING/APPROVED/DENIED |
| COL-TBL046-05 | reason | text | no | no | [R] always |
| COL-TBL046-06 | customer_visible_reason | text | yes | yes | |
| COL-TBL046-07 | grant_id / step_up_challenge_id | uuid ×2 | yes | no | customer-initiated evidence (≥S5 step-up, ADR-DB3-004) |
| COL-TBL046-08 | decided_by_admin_id / decided_at | uuid/timestamptz | yes | yes | review outcome |

### TBL-047 `shipping_details`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL047-01 | order_id | uuid | no | no | →orders; UQ (0..1 per order) |
| COL-TBL047-02 | recipient_name / recipient_phone | text ×2 | no | yes(frz) | [PII] recipient may differ from customer (CON-079) |
| COL-TBL047-03 | address_line | text | no | yes(frz) | [PII] (CON-080) |
| COL-TBL047-04 | ward / district / province | text ×3 | yes/yes/no | yes(frz) | [PII] VN administrative addressing |
| COL-TBL047-05 | country_code | text | no | yes(frz) | default VN |
| COL-TBL047-06 | fee_amount | numeric | yes | yes(frz) | CK ≥ 0; final fee; increases need acknowledgement (TBL-049) |
| COL-TBL047-07 | currency_code | text | no | yes(frz) | CK 'VND' |
| COL-TBL047-08 | carrier_name / tracking_code | text ×2 | yes | yes(frz) | internal only (D-017) |
| COL-TBL047-09 | fulfillment_note | text | yes | yes(frz) | pickup/no-ship note (ADR-DB2-002 r9) |
| COL-TBL047-10 | status | text | no | yes | EDITABLE/FROZEN; all columns frozen at FROZEN (trigger) |
| COL-TBL047-11 | frozen_at | timestamptz | yes | yes | set in dispatch tx (GRD-017) |

### TBL-048 `shipping_snapshots`

Immutable copy created in the dispatch transaction.

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL048-01 | order_id | uuid | no | no | →orders; UQ |
| COL-TBL048-02 | shipping_detail_id | uuid | no | no | →shipping_details |
| COL-TBL048-03..09 | recipient_name, recipient_phone, address_line, ward, district, province, country_code | text ×7 | per source | no | [PII] frozen copies (province/country not null) |
| COL-TBL048-10 | fee_amount / currency_code | numeric/text | no | no | CK ≥ 0 / 'VND'; frozen final fee |
| COL-TBL048-11 | carrier_name / tracking_code | text ×2 | yes | no | |
| COL-TBL048-12 | dispatched_at | timestamptz | no | no | freeze boundary evidence |

### TBL-049 `shipping_fee_acknowledgements`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL049-01 | order_id | uuid | no | no | →orders |
| COL-TBL049-02 | previous_fee_amount / new_fee_amount | numeric ×2 | no | no | CK ≥ 0 |
| COL-TBL049-03 | currency_code | text | no | no | CK 'VND' |
| COL-TBL049-04 | grant_id / step_up_challenge_id | uuid ×2 | no | no | secure-flow acknowledgement evidence |
| COL-TBL049-05 | acknowledged_at | timestamptz | no | no | |

## 9. Quotation (CTX-QUO)

### TBL-050 `quotations`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL050-01 | code | text | no | no | UQ; quotation number ([cfg] format) |
| COL-TBL050-02 | custom_request_id | uuid | no | no | →custom_requests; UQ (1–1 per case) |
| COL-TBL050-03 | status | text | no | yes | LC-12 header set |
| COL-TBL050-04 | current_version_id | uuid | yes | yes | →quotation_versions; pointer |

### TBL-051 `quotation_versions`

Row frozen at SENT (INV-02 trigger); state column may only advance.

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL051-01 | quotation_id | uuid | no | no | →quotations |
| COL-TBL051-02 | version | integer | no | no | UQ (quotation, version) |
| COL-TBL051-03 | parent_version_id | uuid | yes | no | →quotation_versions; supersede chain |
| COL-TBL051-04 | status | text | no | yes(frz) | LC-13 version set |
| COL-TBL051-05 | stitch_count | integer | yes | frz@sent | **GAP-10: admin-entered pricing input, never derived**; CK ≥ 0; NULL in DRAFT; required-at-send guard (TX/App + CK candidate); correction = new version; entry audited (actor=admin) |
| COL-TBL051-06 | color_count | integer | yes | frz@sent | CK ≥ 0 |
| COL-TBL051-07 | physical_width_mm / physical_height_mm | numeric ×2 | yes | frz@sent | CK > 0 when set |
| COL-TBL051-08 | quantity_total | integer | no | frz@sent | CK > 0 |
| COL-TBL051-09 | product_name / variant_label | text ×2 | yes | frz@sent | display snapshot (INV-12) |
| COL-TBL051-10 | subtotal_amount | numeric | no | frz@sent | CK ≥ 0 |
| COL-TBL051-11 | manual_adjustment_amount | numeric | no | frz@sent | signed adjustment (CON-094); default 0 |
| COL-TBL051-12 | adjustment_reason | text | yes | frz@sent | [R] when adjustment ≠ 0 |
| COL-TBL051-13 | shipping_fee_amount | numeric | no | frz@sent | CK ≥ 0; quoted fee (BR-004) |
| COL-TBL051-14 | total_amount | numeric | no | frz@sent | CK ≥ 0; CK total = subtotal + adjustment + shipping fee |
| COL-TBL051-15 | deposit_percent | numeric | no | frz@sent | CK 0–100; snapshot of config value (ADR-DB4-001 r4) |
| COL-TBL051-16 | deposit_amount / remaining_amount | numeric ×2 | no | frz@sent | CK ≥ 0; CK deposit + remaining = total |
| COL-TBL051-17 | currency_code | text | no | frz@sent | CK 'VND' |
| COL-TBL051-18 | valid_from / valid_until | timestamptz ×2 | yes | frz@sent | validity window (CON-095/166); CK from < until; required at send |
| COL-TBL051-19 | sent_at / accepted_at / superseded_at / expired_at | timestamptz ×4 | yes | state-scoped | Tier B history timestamps |
| COL-TBL051-20 | void_reason | text | yes | yes | [R] draft void |

### TBL-052 `quotation_line_items`

Immutable with their version.

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL052-01 | quotation_version_id | uuid | no | no | →quotation_versions |
| COL-TBL052-02 | position | integer | no | no | UQ (version, position) |
| COL-TBL052-03 | line_kind | text | no | no | PRODUCT/EMBROIDERY/DIGITIZING_FEE/SHIPPING/ADJUSTMENT/OTHER (CK; DIGITIZING_FEE feeds S5 refund default) |
| COL-TBL052-04 | description | text | no | no | |
| COL-TBL052-05 | sku_id | uuid | yes | no | →skus (display/reference only) |
| COL-TBL052-06 | quantity | integer | no | no | CK > 0 |
| COL-TBL052-07 | unit_price_amount / line_total_amount | numeric ×2 | no | no | CK ≥ 0 |
| COL-TBL052-08 | currency_code | text | no | no | CK 'VND' |

### TBL-053 `quotation_acceptances`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL053-01 | quotation_version_id | uuid | no | no | →quotation_versions; UQ (one acceptance per version) |
| COL-TBL053-02 | customer_id / grant_id / step_up_challenge_id | uuid ×3 | no | no | secure-flow + step-up evidence (GRD-002/003/006) |
| COL-TBL053-03 | accepted_total_amount | numeric | no | no | CK ≥ 0; fingerprint evidence (idempotency `quotation.accept`) |
| COL-TBL053-04 | currency_code | text | no | no | CK 'VND' |
| COL-TBL053-05 | accepted_at | timestamptz | no | no | |

## 10. Payment (CTX-PAY)

### TBL-054 `payment_obligations`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL054-01 | order_id | uuid | no | no | →orders |
| COL-TBL054-02 | kind | text | no | no | DEPOSIT/REMAINING (CK); partial UQ (order, kind) among PENDING/SATISFIED (INV-04; SUPERSEDED rows excluded for recalculation) |
| COL-TBL054-03 | amount | numeric | no | no | CK > 0 |
| COL-TBL054-04 | currency_code | text | no | no | CK 'VND' |
| COL-TBL054-05 | status | text | no | yes | PENDING/SATISFIED/CANCELLED/SUPERSEDED (LC-15) |
| COL-TBL054-06 | satisfied_at | timestamptz | yes | yes | set exactly once (CC-10) |
| COL-TBL054-07 | satisfied_by_attempt_id | uuid | yes | yes | →payment_attempts; exactly-once application evidence |
| COL-TBL054-08 | superseded_by_obligation_id | uuid | yes | yes | →payment_obligations; recalculation chain (ADR-DB3-003 r7) |
| COL-TBL054-09 | source_quotation_version_id | uuid | no | no | →quotation_versions; amount derivation source |

### TBL-055 `payment_attempts`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL055-01 | payment_obligation_id | uuid | no | no | →payment_obligations; an attempt targets exactly one obligation (CON-106 allocation) |
| COL-TBL055-02 | amount | numeric | no | no | CK > 0 |
| COL-TBL055-03 | currency_code | text | no | no | CK 'VND' |
| COL-TBL055-04 | method | text | no | no | PROVIDER_REDIRECT/BANK_TRANSFER/OTHER (CK; provider abstract, O-006) |
| COL-TBL055-05 | provider_key | text | yes | no | abstract provider identifier |
| COL-TBL055-06 | provider_ref | text | yes | yes | opaque provider transaction reference (CON-103) |
| COL-TBL055-07 | status | text | no | yes | LC-16 set; machine never regresses (CC-08 — TX/App) |
| COL-TBL055-08 | grant_id / step_up_challenge_id | uuid ×2 | yes | no | customer initiation evidence (GRD-002/003) |
| COL-TBL055-09 | expires_at | timestamptz | yes | no | [cfg] |
| COL-TBL055-10 | succeeded_at / failed_at | timestamptz ×2 | yes | yes | state timestamps |
| COL-TBL055-11 | review_reason | text | yes | yes | [R] REQUIRES_REVIEW entry/resolution context |

### TBL-056 `payment_provider_events`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL056-01 | provider_key | text | no | no | |
| COL-TBL056-02 | provider_event_ref | text | no | no | UQ (provider_key, provider_event_ref) — INV-07 arbiter with idempotency |
| COL-TBL056-03 | payment_attempt_id | uuid | yes | no | →payment_attempts (nullable: unmatched events await reconciliation) |
| COL-TBL056-04 | event_kind | text | no | no | SUCCESS/FAILURE/EXPIRY/INFO (CK) |
| COL-TBL056-05 | amount / currency_code | numeric/text | yes | no | provider-reported values for exact verification (GRD-011) |
| COL-TBL056-06 | redacted_payload | jsonb | no | no | ADR-DB4-004 #6; [SEC] redacted evidence, no secrets |
| COL-TBL056-07 | signature_valid | boolean | no | no | server-side verification outcome (INV-15) |
| COL-TBL056-08 | application_outcome | text | no | no | APPLIED/REPLAYED/RECORDED_NO_OP/ESCALATED (CK; out-of-order rule LC-16) |
| COL-TBL056-09 | received_at | timestamptz | no | no | |

### TBL-057 `payment_reconciliations`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL057-01 | payment_attempt_id | uuid | yes | no | →payment_attempts |
| COL-TBL057-02 | payment_obligation_id | uuid | yes | no | →payment_obligations (CK at least one target set) |
| COL-TBL057-03 | action | text | no | no | MANUAL_MATCH/RESOLVE_REVIEW/OBLIGATION_RECALC/CARRYOVER_APPLICATION (CK; ADR-DB3-003 r7 evidence) |
| COL-TBL057-04 | resolved_status | text | yes | no | resulting attempt/obligation status |
| COL-TBL057-05 | amount | numeric | yes | no | CK ≥ 0 when set |
| COL-TBL057-06 | reason | text | no | no | [R] always |
| COL-TBL057-07 | admin_id | uuid | no | no | →admin_accounts |
| COL-TBL057-08 | bank_reference | text | yes | no | [SEC] access-controlled manual-transfer evidence |

### TBL-058 `refunds`

Amount/target columns immutable after creation; only status/decision fields advance.

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL058-01 | payment_attempt_id | uuid | no | no | →payment_attempts (target of refund) |
| COL-TBL058-02 | order_id | uuid | no | no | →orders |
| COL-TBL058-03 | cancellation_request_id | uuid | yes | no | →order_cancellation_requests |
| COL-TBL058-04 | amount | numeric | no | no | CK > 0; ≤ refundable = TX/App (GRD-021) |
| COL-TBL058-05 | currency_code | text | no | no | CK 'VND' |
| COL-TBL058-06 | status | text | no | yes | PENDING_REVIEW/APPROVED/EXECUTED/REJECTED (LC-20) |
| COL-TBL058-07 | method | text | yes | yes | BANK_TRANSFER/OTHER |
| COL-TBL058-08 | transfer_reference | text | yes | yes | [SEC] manual execution evidence; required at EXECUTED (CK candidate) |
| COL-TBL058-09 | reason / customer_visible_reason | text ×2 | no/yes | yes | [R] approve/reject |
| COL-TBL058-10 | approved_by_admin_id / executed_by_admin_id | uuid ×2 | yes | yes | →admin_accounts |
| COL-TBL058-11 | approved_at / executed_at | timestamptz ×2 | yes | yes | |

## 11. Production (CTX-PRD)

### TBL-059 `production_jobs`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL059-01 | order_id | uuid | no | no | →orders |
| COL-TBL059-02 | approval_snapshot_id | uuid | no | no | →approval_snapshots; NOT NULL exact approval (INV-03, D7-07); UQ (order, approval snapshot) |
| COL-TBL059-03 | status | text | no | yes | PLANNED/STARTED/COMPLETED/CANCELLED (LC-18) |
| COL-TBL059-04 | reworked_from_job_id | uuid | yes | no | →production_jobs; rework lineage (ADR-DB3-003 r3) |
| COL-TBL059-05 | cancelled_reason | text | yes | yes | [R] cancel/rework/supersession |
| COL-TBL059-06 | started_at / completed_at / cancelled_at | timestamptz ×3 | yes | yes | state timestamps |

### TBL-060 `production_specifications`

Immutable (INV-03 trigger).

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL060-01 | production_job_id | uuid | no | no | →production_jobs; UQ (1–1) |
| COL-TBL060-02 | approval_snapshot_id | uuid | no | no | →approval_snapshots; source snapshot |
| COL-TBL060-03 | document_hash | text | no | no | copied approval hash — hash linkage (D7-07) |
| COL-TBL060-04 | product_name / variant_label / side_name / area_name | text ×4 | no/yes/no/no | no | frozen display copies |
| COL-TBL060-05 | physical_width_mm / physical_height_mm | numeric ×2 | no | no | CK > 0 |
| COL-TBL060-06 | quantity_total | integer | no | no | CK > 0 |
| COL-TBL060-07 | production_parameters | text | yes | no | admin production instructions (machine/thread notes) |

### TBL-061 `production_artifacts`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL061-01 | production_job_id | uuid | no | no | →production_jobs |
| COL-TBL061-02 | asset_id | uuid | no | no | →assets; UQ (job, asset); internal, unwatermarked (INV-21/22) |
| COL-TBL061-03 | kind | text | no | no | DIGITIZED_FILE/MACHINE_FILE/PHOTO/OTHER (CK) |
| COL-TBL061-04 | note | text | yes | yes | |

### TBL-062 `production_notes`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL062-01 | production_job_id | uuid | no | no | →production_jobs |
| COL-TBL062-02 | note | text | no | no | |
| COL-TBL062-03 | admin_id | uuid | no | no | →admin_accounts |

### TBL-063 `production_job_transitions`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL063-01 | production_job_id | uuid | no | no | →production_jobs |
| COL-TBL063-02 | from_status / to_status | text ×2 | no | no | LC-18 values |
| COL-TBL063-03 | actor_kind / admin_id / system_job_key | text/uuid/text | no/yes/yes | no | actor evidence |
| COL-TBL063-04 | reason | text | yes | no | [R] cancel/rework |
| COL-TBL063-05 | correlation_id | text | no | no | |

## 12. Gallery & Content (CTX-GAL / CTX-CNT)

### TBL-064 `gallery_entries`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL064-01 | title | text | no | yes | |
| COL-TBL064-02 | slug | text | no | yes | UQ |
| COL-TBL064-03 | description | text | no | yes | required text context (REQ-GAL-002) |
| COL-TBL064-04 | status | text | no | yes | DRAFT/PUBLISHED/ARCHIVED |
| COL-TBL064-05 | display_order | integer | no | yes | |
| COL-TBL064-06 | linked_product_id | uuid | yes | yes | →products; SEO internal link (0..N modeled as nullable single MVP link; more links additive) |
| COL-TBL064-07..09 | seo_title / seo_description / is_indexable | text/text/boolean | yes/yes/no | yes | SEO VO |
| COL-TBL064-10 | archived_at | timestamptz | yes | yes | |

### TBL-065 `gallery_entry_assets`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL065-01 | gallery_entry_id | uuid | no | no | →gallery_entries |
| COL-TBL065-02 | asset_id | uuid | no | no | →assets; UQ (entry, asset); public derivatives only — private originals never exposed (App + D7 representation test) |
| COL-TBL065-03 | display_order | integer | no | yes | |

### TBL-066 `content_pages`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL066-01 | page_type | text | no | no | HOME/SERVICE/FAQ/LOCAL/LANDING/POLICY (CK) |
| COL-TBL066-02 | slug | text | no | yes | UQ (page_type, slug) |
| COL-TBL066-03 | title | text | no | yes | |
| COL-TBL066-04 | body | text | yes | yes | rendered content source; **no version history in MVP** (DB2 explicit non-goal; edits audited) |
| COL-TBL066-05 | status | text | no | yes | DRAFT/PUBLISHED/ARCHIVED |
| COL-TBL066-06..08 | seo_title / seo_description / is_indexable | text/text/boolean | yes/yes/no | yes | SEO VO |
| COL-TBL066-09 | archived_at | timestamptz | yes | yes | |

### TBL-067 `redirect_rules`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL067-01 | source_path | text | no | yes | UQ |
| COL-TBL067-02 | target_path | text | no | yes | |
| COL-TBL067-03 | redirect_kind | text | no | yes | PERMANENT/TEMPORARY (CK) |
| COL-TBL067-04 | is_active | boolean | no | yes | |

### TBL-068 `agreements`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL068-01 | agreement_type | text | no | no | UQ; config-extensible type set (payment/return/delivery/privacy — no CK on set, [cfg]) |
| COL-TBL068-02 | name | text | no | yes | |
| COL-TBL068-03 | current_version_id | uuid | yes | yes | →agreement_versions; pointer to latest published |

### TBL-069 `agreement_versions`

Immutable once published (trigger).

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL069-01 | agreement_id | uuid | no | no | →agreements |
| COL-TBL069-02 | version | integer | no | no | UQ (agreement, version); monotonic |
| COL-TBL069-03 | status | text | no | yes(frz) | DRAFT/PUBLISHED/SUPERSEDED/WITHDRAWN; EFFECTIVE is derived, never stored |
| COL-TBL069-04 | content | text | no | frz@publish | published legal text |
| COL-TBL069-05 | content_hash | text | yes | frz@publish | `sha256:<hex>` over canonical content bytes (canonicalization detail = package/DB6 note); NOT NULL once published (CK candidate); GRD-008 input |
| COL-TBL069-06 | language | text | no | frz@publish | 'vi' MVP (readiness attribute) |
| COL-TBL069-07 | effective_from | timestamptz | yes | frz@publish | required at publish |
| COL-TBL069-08 | published_at / superseded_at / withdrawn_at | timestamptz ×3 | yes | state-scoped | |
| COL-TBL069-09 | withdraw_reason | text | yes | yes | [R] withdraw |

## 13. Notification, Audit & Platform (CTX-NTF / CTX-AUD / CTX-PLT)

### TBL-070 `notification_intents`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL070-01 | intent_key | text | no | no | UQ; deterministic (source event, recipient, template) — GRD-012 `notification.intent` |
| COL-TBL070-02 | template_key / template_version | text/integer | no | no | Template Reference (CON-132) |
| COL-TBL070-03 | channel | text | no | no | EMAIL/SMS/… (CK direction; provider open O-005) |
| COL-TBL070-04 | recipient_contact_point_id | uuid | yes | no | →customer_contact_points |
| COL-TBL070-05 | recipient_masked | text | no | no | [PII-min] masked display copy |
| COL-TBL070-06 | params | jsonb | no | no | ADR-DB4-004 #8; redacted typed refs only — **no OTP/token/link URL** (D7-12) |
| COL-TBL070-07 | status | text | no | yes | PENDING/PROCESSING/SATISFIED/FAILED/CANCELLED |
| COL-TBL070-08 | source_outbox_event_id | bigint | yes | no | →outbox_events (origin trace; nullable — outbox rows are cleaned) |
| COL-TBL070-09 | correlation_id | text | no | no | |

### TBL-071 `notification_delivery_attempts`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL071-01 | intent_id | uuid | no | no | →notification_intents |
| COL-TBL071-02 | channel | text | no | no | |
| COL-TBL071-03 | outcome | text | no | no | DELIVERED/FAILED_RETRYABLE/FAILED_TERMINAL (CK) |
| COL-TBL071-04 | provider_message_ref | text | yes | no | opaque |
| COL-TBL071-05 | error_class | text | yes | no | |
| COL-TBL071-06 | attempted_at | timestamptz | no | no | |

### TBL-072 `audit_events`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL072-01 | occurred_at | timestamptz | no | no | |
| COL-TBL072-02 | actor_kind | text | no | no | ADMIN/CUSTOMER/SYSTEM (CK) |
| COL-TBL072-03 | admin_id / customer_id / grant_id / system_job_key | uuid/uuid/uuid/text | yes | no | actor refs (CK: matching actor_kind has its ref set — trigger/App candidate) |
| COL-TBL072-04 | action | text | no | no | stable action code (audit spec groups) |
| COL-TBL072-05 | target_kind / target_id | text ×2 | no | no | **justified cross-cutting polymorphic target** (task §8.3 exception: audit target); target_id as text |
| COL-TBL072-06 | reason | text | yes | no | [R] per action class (D7-10) |
| COL-TBL072-07 | summary | jsonb | yes | no | ADR-DB4-004 #7; before/after reference summary, no payload dumps, redacted |
| COL-TBL072-08 | failure_code | text | yes | no | attempted-invalid audits (guard AuditF) |
| COL-TBL072-09 | correlation_id | text | no | no | NOT NULL (audit spec) |

### TBL-073 `outbox_events`

Payload immutable; **column-scoped mutable set** = status, attempt_count,
next_attempt_at, claimed_by, claimed_at, dispatched_at, last_error
(ADR-DB1-010 exception, enforced by column-list trigger).

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL073-01 | event_type | text | no | no | outbox intent name (SE catalog) |
| COL-TBL073-02 | aggregate_kind / aggregate_id | text ×2 | no | no | **justified polymorphic** (outbox aggregate reference exception) |
| COL-TBL073-03 | payload | jsonb | no | no | ADR-DB4-004 #4; immutable; minimized/redacted |
| COL-TBL073-04 | payload_schema_version | integer | no | no | |
| COL-TBL073-05 | status | text | no | yes | PENDING/DISPATCHED/FAILED/DEAD_LETTER (LC-22) |
| COL-TBL073-06 | attempt_count | integer | no | yes | bounded retries [cfg] |
| COL-TBL073-07 | next_attempt_at | timestamptz | yes | yes | backoff |
| COL-TBL073-08 | claimed_by / claimed_at | text/timestamptz | yes | yes | GRD-029 exclusive claim (skip-locked direction → DB6) |
| COL-TBL073-09 | dispatched_at | timestamptz | yes | yes | |
| COL-TBL073-10 | last_error | text | yes | yes | error class only |

### TBL-074 `idempotency_records`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL074-01 | operation_namespace | text | no | no | stable constant (ADR-DB1-017) |
| COL-TBL074-02 | scope_key | text | no | no | UQ (namespace, scope_key) — INV-19/24 arbiter |
| COL-TBL074-03 | fingerprint | text | no | no | canonical-hash of business payload (GRD-030) |
| COL-TBL074-04 | status | text | no | yes | IN_PROGRESS/COMPLETED (LC-23) |
| COL-TBL074-05 | result | jsonb | yes | yes | ADR-DB4-004 #5; minimal replayable outcome (refs + status), redacted |
| COL-TBL074-06 | expires_at | timestamptz | no | yes | [cfg] TTL class per namespace |
| COL-TBL074-07 | claimed_at / completed_at | timestamptz ×2 | no/yes | yes | stuck-IN_PROGRESS timeout input [cfg] |

### TBL-075 `background_job_attempts`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL075-01 | job_kind | text | no | no | worker job type |
| COL-TBL075-02 | job_key | text | no | no | async-port job id |
| COL-TBL075-03 | attempt_no | integer | no | no | CK > 0; UQ (job_kind, job_key, attempt_no) |
| COL-TBL075-04 | outcome | text | no | no | SUCCEEDED/FAILED_RETRYABLE/FAILED_TERMINAL (CK) |
| COL-TBL075-05 | is_dead_letter | boolean | no | no | true on terminal failure — dead-letter visibility row; manual requeue = new job |
| COL-TBL075-06 | error_class | text | yes | no | no payload/PII |
| COL-TBL075-07 | finished_at | timestamptz | no | no | |

### TBL-076 `policy_configurations`

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL076-01 | config_key | text | no | no | UQ; stable key (retention classes, TTL classes, deposit percent, refund defaults, agreement type set, code formats…) |
| COL-TBL076-02 | description | text | no | yes | |
| COL-TBL076-03 | current_version_id | uuid | yes | yes | →policy_configuration_versions; pointer |

### TBL-077 `policy_configuration_versions`

Immutable.

| COL | Column | Type | N? | M? | Notes |
|---|---|---|---|---|---|
| COL-TBL077-01 | policy_configuration_id | uuid | no | no | →policy_configurations |
| COL-TBL077-02 | version | integer | no | no | UQ (config, version) |
| COL-TBL077-03 | value | jsonb | no | no | ADR-DB4-004 #9; **no secrets in config values** (audit spec) |
| COL-TBL077-04 | value_schema_version | integer | no | no | |
| COL-TBL077-05 | effective_from | timestamptz | no | no | |
| COL-TBL077-06 | created_by_admin_id | uuid | no | no | →admin_accounts |
| COL-TBL077-07 | reason | text | no | no | [R] config change (audit spec) |

## 14. Cross-cutting notes

1. **Derived columns register:** the only derived values in the schema are
   computed (never stored): inventory available/held, "fully paid",
   agreement EFFECTIVE, SKU availability, dashboard buckets (per
   [`DB3_DERIVED_STATE_CATALOG.md`](./DB3_DERIVED_STATE_CATALOG.md)).
   `sku_stocks.quantity_on_hand` is an authoritative operational counter
   reconciled by the ledger, not a projection.
2. **No plaintext secret column exists** — grant tokens, session tokens,
   OTP codes, admin session tokens are `*_hash` only (D7-12).
3. **Optimistic-lock columns:** `design_sessions.autosave_revision` is the
   only optimistic marker required by DB3 (CC-01). All other races use row
   locks / uniques / state-checks per CC strategy — no generic
   `lock_version` columns are added speculatively.
4. Multi-part rows marked `×N` expand to individually named columns at DB6
   with the sub-IDs noted (e.g. COL-TBL028-10a..d); they are single logical
   groups here for readability.
