# ADR-APP6-001 — Customer-Owned-Product Design Context

- Status: Accepted
- Date: 2026-08-19
- Checkpoint: `APP6-G01`
- Decision IDs: IMP-D051
- Supersedes: nothing
- Related: `../database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md`,
  `../database/ADR-DB3-003-POST-APPROVAL-PRODUCTION-REVISION.md`,
  `../database/ADR-DB1-012-DESIGN-DOCUMENT-CANONICALIZATION.md`,
  `ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md`
- Invariant IDs: INV-01, INV-03, INV-12, INV-13, INV-16
- Requirement IDs: REQ-DVER-005, REQ-REQ-002

## 1. Context

`APP6-R00` proved a contradiction that is still present at HEAD.

`packages/database/src/schema/design/design-versions.ts` declares
`product_id`, `product_variant_id`, `product_side_id` and
`embroidery_area_id` **`NOT NULL`** with `restrict` FKs into Catalog, and
`packages/database/src/schema/design/approval-snapshots.ts` declares the same
four columns `NOT NULL` again.

A customer-owned product (COP, TBL-038) holds none of them. Its own table
comment is unambiguous — *"by construction this table has no `sku_id`, no
stock columns and no price authority"*, **INV-13, "Never a SKU"**.

A formal design version is nonetheless **required** for a COP request:
`TR-LC11-09` (`DESIGN_REVIEW → APPROVED`) is guarded by *"`TR-LC08-04` done"*,
and `TR-LC08-04` creates the Approval Snapshot that authorises the order, the
production job and the machine file. No approval path bypasses a design
version.

Today the only ways to satisfy four `NOT NULL` Catalog FKs are to fabricate a
product/variant/side/area or to point at an unrelated real one. Both turn a
customer's own garment into a catalogue SKU, and both are refused here.

Three further facts were established while auditing this decision, and each
changes the shape of the answer:

1. `design_sessions` declares `product_id`, `product_side_id` and
   `embroidery_area_id` `NOT NULL`. **A COP request therefore has no Design
   Session at all** — the APP3 Studio path is Catalog-only. A COP formal design
   document is authored by staff from the customer's evidence assets, not
   cloned from what the customer drew.
2. `DesignPlacementSnapshot` (`packages/design-document`) declares
   `productSideId` and `embroideryAreaId` as **required non-empty strings**,
   enforced by `packages/design-document/src/validation/structure.ts`. A COP
   design document cannot honestly populate them either.
3. `approval_snapshots.product_name` / `side_name` / `area_name` are
   **frozen text copies**, never FKs (COL-TBL031-06, Class F, INV-12), and
   `production_specifications.side_name` / `area_name` are `NOT NULL`
   downstream. Truthful labels are therefore required on the COP branch, and
   nothing in the current schema can supply them.

## 2. Decision drivers

- INV-13 is a product invariant, not a convenience: a customer's garment never
  enters Catalog, never gets a `sku_stocks` row, and never gets a price.
- `order_items` already models this exact branch — nullable `sku_id`, nullable
  `customer_owned_product_id`, one exactly-one `CHECK`. The repository has the
  pattern; it does not need a new one.
- An approval snapshot is evidence. Evidence that names a product the customer
  does not own is worse than evidence that names nothing.
- APP7 must be able to convert an approved COP snapshot into an order without
  inventing Catalog identity.

## 3. Decision

**Two explicit, mutually exclusive branches** on both `design_versions` and
`approval_snapshots`, following the delivered `order_items` shape.

### 3.1 Catalog branch — unchanged

A Catalog design version and its approval snapshot carry the complete
placement quartet (`product_id`, `product_variant_id`, `product_side_id`,
`embroidery_area_id`) and **no** `customer_owned_product_id`. Existing
Catalog placement authority — `validatePlacementSnapshot` reconciliation,
`EmbroideryAreaAuthority` containment, retirement semantics — remains required
and is not weakened by anything in this ADR.

### 3.2 COP branch

A COP design version and its approval snapshot carry
`customer_owned_product_id` and **no** Catalog placement value. The four
Catalog columns are `NULL`. They are never fabricated, never defaulted, and
never pointed at an unrelated real row.

The branch is decided once, at design-version creation, from the request: a
request that has a `customer_owned_products` row (CST-027, at most one per
request) is a COP request. The two branches are never mixed on one row and
never switched after the fact.

### 3.3 Geometry — the frozen placement envelope

For a **Catalog** version, geometry validates against Catalog placement
authority exactly as it does today.

For a **COP** version, `design_versions.physical_width_mm` and
`physical_height_mm` are the **authoritative frozen positive embroidery
placement envelope** of that exact formal version. They are established by the
authorised staff/digitizing workflow from the customer's item evidence and the
agreed placement, and they are what containment validates against.

They are **not** copied from `customer_owned_products.physical_width_mm` /
`physical_height_mm`. Those two columns are nullable and describe *the item*,
not the embroidery placement envelope on it; using them as bounds would
silently claim a customer's whole jacket as the stitch area. A COP version may
consult them as evidence; it may never adopt them as bounds.

`packages/design-engine` imports no database schema and receives its authority
as an argument, so the COP branch needs no engine change: containment runs
against the envelope rectangle. The Catalog identity reconciliation in
`validatePlacementSnapshot` (`PLACEMENT_SIDE_MISMATCH`,
`PLACEMENT_AREA_MISMATCH`) **does not run** on the COP branch — there is no
Catalog authority to reconcile against, and running it with a fabricated id
would be the failure this ADR exists to prevent.

### 3.4 Design document — absence is expressed, never faked

A COP formal design document must not carry a Catalog `productSideId` or
`embroideryAreaId` value. Absence is expressed as `null`.

Because `DesignPlacementSnapshot` requires both today, this is a real change to
`packages/design-document`, bounded by three rules:

1. **No existing document's stored bytes, canonical form or `document_hash`
   may change.** ADR-DB1-012 canonicalisation and every historical hash stay
   exactly as they are.
2. A reader that cannot represent absence must **reject the document loudly**,
   never coerce a `null` into a lookup. The widening is therefore carried by a
   new document schema version admitted through the delivered
   `SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS` mechanism, not by silently
   relaxing version 1.
3. The Catalog/Studio path keeps emitting the version it emits today. APP3 is
   not modified by this ADR.

Owner: **`APP6-B08`**. This is not a database change and is not part of the
`APP6-DB01` contract.

### 3.5 Freeze

Once a formal version reaches its freeze point — `TR-LC08-02`, send for
review, where the document is canonicalised and hashed — its branch identity,
placement context and geometry are **immutable**. A change to any of them is a
new formal version through `TR-LC08-01`, superseding the prior one
(`TR-LC08-05`); it is never an edit. Post-approval revision follows
ADR-DB3-003 and likewise produces a new version, never a mutation.

### 3.6 Approval snapshot

A COP Approval Snapshot freezes, in its existing columns:

| Snapshot fact | Catalog branch source | COP branch source |
|---|---|---|
| Branch identity | placement quartet, `customer_owned_product_id` NULL | `customer_owned_product_id`, quartet NULL |
| `document_hash` | the exact approved version's hash (GRD-007) | identical |
| `physical_width_mm` / `physical_height_mm` | the version's frozen dimensions | the version's frozen placement envelope (§3.3) |
| `product_name` | Catalog product name at approval | `customer_owned_products.name` — the customer's own description of their item |
| `variant_label` | Catalog variant label | `NULL` — a COP has no variant, and `variant_label` is already nullable |
| `side_name` / `area_name` | Catalog side/area names | the frozen human-readable labels of the agreed placement context (§3.7) |
| Agreement versions | `approval_snapshot_agreement_acceptances` | identical |
| Customer evidence | `grant_id`, `step_up_challenge_id`, frozen contact copy | identical |
| Thread colours | `approval_snapshot_thread_colors` | identical |

No fake Catalog label is written to satisfy persistence. `product_name`,
`side_name` and `area_name` are frozen human evidence in both branches — they
are text, not identity, and writing a truthful COP label into them fabricates
nothing.

### 3.7 Placement labels — the one thing existing persistence cannot hold

`approval_snapshots.side_name` and `area_name` are `NOT NULL`, and
`production_specifications.side_name` / `area_name` are `NOT NULL` downstream,
so a COP snapshot must carry truthful placement labels. On the Catalog branch
they are read through the placement FKs at approval time. **On the COP branch
there is no source anywhere in the current schema**:
`customer_owned_products` carries only `name` and `description` — the item, not
the placement — and adopting `description` as a placement label would repeat
the §3.3 dimension error in text form.

The labels are agreed with the customer and established when the formal
version is authored, and they are frozen with the geometry they describe. They
therefore live on `design_versions`, and the approval transaction copies them
into the snapshot's existing `side_name` / `area_name` columns. This is the
only field addition in the `APP6-DB01` contract, and it is justified per field
in §4.

### 3.8 APP7 handoff

An approved COP snapshot is sufficient for APP7 order conversion on its own:
`customer_owned_product_id` gives the item, the frozen envelope gives the
geometry, the frozen labels give the human placement context, `document_hash`
gives the exact approved design, and `quantity_total` gives the quantity.
`order_items` already accepts exactly this through its nullable
`customer_owned_product_id` branch. **APP7 invents no Catalog identity, and
APP6 implements no part of APP7.**

## 4. `APP6-DB01` schema contract

```text
DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS
```

Authorised schema operations, and nothing else:

| # | Table | Operation | Justification |
|---|---|---|---|
| 1 | `design_versions` | `product_id`, `product_variant_id`, `product_side_id`, `embroidery_area_id` → nullable | §3.2 |
| 2 | `design_versions` | add nullable `customer_owned_product_id` + FK → `customer_owned_products(id)` `ON DELETE RESTRICT` | §3.2 |
| 3 | `design_versions` | add nullable `placement_side_label text`, `placement_area_label text` | §3.7 — the only additional fields |
| 4 | `design_versions` | add `CHECK` exactly-one-branch | §3.2 |
| 5 | `design_versions` | add `CHECK` COP-branch label completeness | §3.7 |
| 6 | `approval_snapshots` | the same four columns → nullable | §3.2 |
| 7 | `approval_snapshots` | add nullable `customer_owned_product_id` + FK → `customer_owned_products(id)` `ON DELETE RESTRICT` | §3.2 |
| 8 | `approval_snapshots` | add `CHECK` exactly-one-branch | §3.2 |

**Per-field justification for the two additional fields.**
`placement_side_label` and `placement_area_label` are the only fields for which
existing persistence cannot preserve required immutable human evidence.
`approval_snapshots.side_name` / `area_name` are `NOT NULL` and
`production_specifications` requires them downstream; the COP branch has no FK
to read them through; `customer_owned_products` holds only item name and
description; and the labels must be frozen with the geometry they describe, on
the same row, or the approval transaction would be inventing them at approval
time rather than freezing what was agreed. Nothing else is added:
`product_name` comes from `customer_owned_products.name`, `variant_label` is
already nullable, and every other snapshot fact is branch-independent.

### 4.1 Branch `CHECK` shape

```text
design_versions      exactly one of:
                       (product_id, product_variant_id, product_side_id,
                        embroidery_area_id) all NOT NULL
                          AND customer_owned_product_id IS NULL
                          AND placement_side_label IS NULL
                          AND placement_area_label IS NULL
                     XOR
                       all four Catalog columns NULL
                          AND customer_owned_product_id IS NOT NULL
                          AND placement_side_label IS NOT NULL
                          AND placement_area_label IS NOT NULL

approval_snapshots   exactly one of:
                       four Catalog columns all NOT NULL
                          AND customer_owned_product_id IS NULL
                     XOR
                       four Catalog columns all NULL
                          AND customer_owned_product_id IS NOT NULL
```

A **partial** Catalog quartet is rejected by both branches. That is
deliberate: the failure this ADR guards against is a half-populated placement,
not only a fabricated one.

### 4.2 Other migration properties

| Property | Ruling |
|---|---|
| FK delete behaviour | `ON DELETE RESTRICT`, matching every other edge on both tables and `order_items`' COP edge |
| Catalog branch completeness | all four columns, exactly as today |
| COP branch completeness | `customer_owned_product_id` + both placement labels + positive dimensions |
| `ck_design_versions__physical_mm_positive` | unchanged — both branches keep positive dimensions |
| `ck_approval_snapshots__physical_mm_positive` | unchanged |
| Index / uniqueness impact | **none**. `uq_design_versions__case_version`, `uq_design_versions__case__sent_for_review` and `uq_approval_snapshots__version` key on case/version/status only and are untouched |
| Partial unique indexes | unchanged; no new one is required |
| Existing-row backfill | **none**. Every existing row is a complete Catalog row and already satisfies the Catalog branch; nullability is widened, never narrowed, so no data is rewritten |
| New indexes | none required by this contract; a COP-lookup index is a later access-path decision, not a correctness one |
| Migration safety | forward-only per ADR-DB1-003 and `08-DATABASE-CHANGE-CONTROL`. Dropping `NOT NULL` and adding nullable columns take no long lock on PostgreSQL; the two `CHECK`s are validated against a table whose every existing row already satisfies them |
| Reversibility | narrowing back to `NOT NULL` is safe only while no COP row exists — stated here so `APP6-DB01` records it rather than discovers it |

`APP6-G01` writes **no SQL** and modifies **no schema file**.

## 5. Consequences

Positive: a COP request reaches a formal design version, a review and an
approval snapshot with no fabricated Catalog row; the Catalog branch is
bit-for-bit unchanged; the pattern is one the repository already uses and
reviews.

Negative: two branches mean two code paths in `APP6-B08`, `B09`, `B10` and
`B11`, and `APP6-E01` must run the whole journey twice. That cost is accepted
— it is the cost of INV-13 being true.

Risk: a future checkpoint reaching for a Catalog row "just to have a name".
`tools/check-app6-g01.mjs` asserts the prohibition, and `APP6-E01`'s COP branch
is the runtime proof.

## 6. Fact table

Values reconciled by `tools/check-app6-g01.mjs` against
`packages/database/seed/app6-policy-configuration.seed.json`.

### 6.1 `quotation.validity`

| Key | Value | Unit | Meaning |
|---|---|---|---|
| `validityDays` | `7` | calendar days | A sent quotation version is acceptance-eligible for seven calendar days from its committed send instant. |

### 6.2 `quotation.deposit`

| Key | Value | Unit | Meaning |
|---|---|---|---|
| `depositPercent` | `40` | percent | BR-005 / D-013 deposit share of the accepted total. |
| `remainingPercent` | `60` | percent | D-014 remaining share. |

### 6.3 `design_approval.agreements`

| Key | Value | Unit | Meaning |
|---|---|---|---|
| `requiredAgreementTypes` | `[PAYMENT_POLICY, RETURN_POLICY]` | — | The agreement types whose effective version a customer must accept at design approval (GRD-008, `DB3_AGREEMENT_ACCEPTANCE_SPEC` §2.1). |
