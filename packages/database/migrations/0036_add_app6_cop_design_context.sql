-- APP6-DB01 — customer-owned-product design context on TBL-028 `design_versions`
-- and TBL-031 `approval_snapshots` (ADR-APP6-001, IMP-D051).
--
-- ### Why this migration exists
--
-- Both tables declared the Catalog placement quartet — `product_id`,
-- `product_variant_id`, `product_side_id`, `embroidery_area_id` — `NOT NULL`
-- with `restrict` FKs into Catalog. A customer-owned product (TBL-038) holds
-- none of them: **never a SKU** (INV-13) is that table's own construction rule.
--
-- A formal design version is nonetheless mandatory on a COP request's approval
-- path: `TR-LC11-09` (`DESIGN_REVIEW -> APPROVED`) is guarded by `TR-LC08-04`,
-- which creates the Approval Snapshot that authorises the order, the production
-- job and the machine file. Nothing bypasses it. So at HEAD the only ways to
-- satisfy four `NOT NULL` Catalog FKs for a COP request were to fabricate a
-- product/variant/side/area or to point at an unrelated real one — both turn a
-- customer's own garment into a catalogue SKU, and ADR-APP6-001 refuses both.
--
-- ### The shape
--
-- Two explicit, mutually exclusive branches, following the delivered
-- `order_items` shape (CST-067, nullable `sku_id` XOR nullable
-- `customer_owned_product_id`). The repository already has this pattern; it does
-- not need a new one.
--
--   CST-129  ck_design_versions__exactly_one_placement_branch
--   CST-130  ck_design_versions__cop_placement_labels
--   CST-131  ck_approval_snapshots__exactly_one_placement_branch
--   REL-107  fk_design_versions__customer_owned_product_id      ON DELETE RESTRICT
--   REL-108  fk_approval_snapshots__customer_owned_product_id   ON DELETE RESTRICT
--
-- Each branch CHECK is written as two **complete** conjunctions rather than a
-- `num_nonnulls(...) in (0, 4)` shorthand plus a COP clause. A partial Catalog
-- quartet is as much the failure this guards against as a mixed row is: half a
-- placement is not a stricter record, it is an unanswerable one. A row with
-- neither branch is rejected by the same expression.
--
-- ### Why two label columns, and only two
--
-- `approval_snapshots.side_name`/`area_name` are `NOT NULL`, and
-- `production_specifications.side_name`/`area_name` are `NOT NULL` downstream,
-- so a COP snapshot must carry truthful placement labels. On the Catalog branch
-- they are read through the placement FKs at approval time. The COP branch has
-- no such FK, and `customer_owned_products` carries only `name` and
-- `description` — the *item*, never the placement; adopting `description` as a
-- placement label would fabricate in text exactly what the nullable FKs stop
-- fabricating in identity.
--
-- The labels are agreed with the customer, established when the formal version
-- is authored, and frozen with the geometry they describe — so they live on
-- `design_versions` and the approval transaction copies them into the snapshot's
-- existing `side_name`/`area_name` columns. Nothing else is added:
-- `product_name` comes from `customer_owned_products.name`, `variant_label` is
-- already nullable, and every other snapshot fact is branch-independent.
--
-- `btrim` with an explicit character set in CST-130, the `asset_derivatives`
-- rule: the bare form trims spaces only, so a tab-only label would satisfy a
-- "not blank" check that exists precisely to reject it.
--
-- ### Geometry
--
-- `physical_width_mm`/`physical_height_mm` stay `NOT NULL` and positive on both
-- branches; `ck_design_versions__physical_mm_positive` and
-- `ck_approval_snapshots__physical_mm_positive` are untouched. On a COP version
-- they are that version's authoritative frozen embroidery **placement
-- envelope** — never copied from `customer_owned_products`' own nullable item
-- dimensions, which describe the garment and would silently claim a customer's
-- whole jacket as the stitch area (ADR-APP6-001 §3.3).
--
-- ### Freeze
--
-- No trigger is added or altered. `0030_add_integrity_triggers.sql` gave
-- `design_versions` an **exception-list** guard (CST-090): the trigger diffs
-- every column of `to_jsonb(OLD)` against `to_jsonb(NEW)` and rejects any change
-- outside `status`/`sent_at`/`approved_at`/`superseded_at`/`voided_at`/
-- `void_reason`. All three new columns are therefore frozen at the same
-- `TR-LC08-02` send point as the placement they belong to, the moment they
-- exist; extending the trigger's argument list would have *narrowed* the freeze,
-- not widened it. `approval_snapshots` carries the row-wide `'always'`/`'reject'`
-- guard (CST-091), so the new column inherits identical no-UPDATE/no-DELETE
-- semantics with no change either.
--
-- ### Existing rows
--
-- Every existing row of both tables is a complete Catalog row and already
-- satisfies its branch CHECK. Nullability is only ever widened and the new
-- columns are nullable, so there is **no backfill**, no historical row is
-- rewritten, and no COP row is synthesised. Dropping `NOT NULL` and adding
-- nullable columns take no long lock on PostgreSQL.
--
-- ### Indexes and uniqueness
--
-- None added, none changed. `uq_design_versions__case_version`,
-- `uq_design_versions__case__sent_for_review` and
-- `uq_approval_snapshots__version` key on case/version/status only and are
-- untouched. A COP-lookup index is a later access-path decision, not a
-- correctness one (ADR-APP6-001 §4.2).
--
-- ### Generation note
--
-- Generated by drizzle-kit from the schema change, then hand-trimmed: the
-- generator additionally emitted a DROP + re-ADD of the untouched
-- `ck_approval_snapshots__preview_hash_format`, with its expression truncated at
-- `'^sha256:[0-9a-f]{64}` — the regex-anchor `$'` in that value is expanded as a
-- `String.prototype.replace` replacement pattern (`$'` = "text after the match")
-- while the statement is assembled. Both statements were removed and the same
-- corrupted value was repaired in `meta/0036_snapshot.json`, so the snapshot
-- again records the constraint that is actually installed and no later
-- generation re-emits the pair. That constraint is not part of this contract and
-- is left exactly as `0020` created it.
--
-- Forward-only. No down section, no rollback, no DROP of anything this
-- migration did not create. No network call, no object-storage call, no
-- application dependency. The runner applies each migration exactly once inside
-- a transaction. Narrowing back to `NOT NULL` is safe only while no COP row
-- exists — recorded here rather than discovered later.

ALTER TABLE "design_versions" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "design_versions" ALTER COLUMN "product_variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "design_versions" ALTER COLUMN "product_side_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "design_versions" ALTER COLUMN "embroidery_area_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ALTER COLUMN "product_variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ALTER COLUMN "product_side_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ALTER COLUMN "embroidery_area_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "design_versions" ADD COLUMN "customer_owned_product_id" uuid;--> statement-breakpoint
ALTER TABLE "design_versions" ADD COLUMN "placement_side_label" text;--> statement-breakpoint
ALTER TABLE "design_versions" ADD COLUMN "placement_area_label" text;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD COLUMN "customer_owned_product_id" uuid;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__customer_owned_product_id" FOREIGN KEY ("customer_owned_product_id") REFERENCES "public"."customer_owned_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__customer_owned_product_id" FOREIGN KEY ("customer_owned_product_id") REFERENCES "public"."customer_owned_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "ck_design_versions__exactly_one_placement_branch" CHECK (("design_versions"."product_id" is not null and "design_versions"."product_variant_id" is not null and "design_versions"."product_side_id" is not null and "design_versions"."embroidery_area_id" is not null and "design_versions"."customer_owned_product_id" is null) or ("design_versions"."product_id" is null and "design_versions"."product_variant_id" is null and "design_versions"."product_side_id" is null and "design_versions"."embroidery_area_id" is null and "design_versions"."customer_owned_product_id" is not null));--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "ck_design_versions__cop_placement_labels" CHECK (("design_versions"."customer_owned_product_id" is null and "design_versions"."placement_side_label" is null and "design_versions"."placement_area_label" is null) or ("design_versions"."customer_owned_product_id" is not null and "design_versions"."placement_side_label" is not null and "design_versions"."placement_area_label" is not null and btrim("design_versions"."placement_side_label", E' \t\r\n') <> '' and btrim("design_versions"."placement_area_label", E' \t\r\n') <> ''));--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "ck_approval_snapshots__exactly_one_placement_branch" CHECK (("approval_snapshots"."product_id" is not null and "approval_snapshots"."product_variant_id" is not null and "approval_snapshots"."product_side_id" is not null and "approval_snapshots"."embroidery_area_id" is not null and "approval_snapshots"."customer_owned_product_id" is null) or ("approval_snapshots"."product_id" is null and "approval_snapshots"."product_variant_id" is null and "approval_snapshots"."product_side_id" is null and "approval_snapshots"."embroidery_area_id" is null and "approval_snapshots"."customer_owned_product_id" is not null));
