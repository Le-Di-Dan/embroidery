-- APP7-DB01 — the CTX-PAY transfer-evidence association `payment_transfer_evidence`
-- (PO-APP7-001, APP7-G01 §7 and §9).
--
-- ### Why this migration exists
--
-- PO-APP7-001 makes an optional bank-transfer screenshot part of the deposit
-- flow (`TRANSFER_EVIDENCE_SUPPORTED = true`). Everything that upload needs was
-- already delivered — the private intake lane, the content-signature media
-- check, the inspection pipeline, the authorized private-delivery use case — and
-- APP7-G01 audited each of them. Exactly one physical fact was missing:
--
--   no context-owned association table in CTX-PAY / AGG-16 binds an `assets`
--   row to a `payment_attempts` row.
--
-- ADR-DB4-003 forbids a generic `asset_links` table and requires each consuming
-- context to own a typed association with `NOT NULL`, `restrict` foreign keys on
-- both ends. The seven delivered association tables belong to CAT, DSN ×3, ORD,
-- PRD and GAL; none belongs to Payment. `custom_request_assets` is the nearest,
-- but its `role` set is a closed CHECK — so reusing it needs a migration anyway —
-- and it binds to the request, not the attempt, which would make a payment fact
-- Ordering-owned and would lose the attempt binding a retry depends on. And
-- `payment_attempts` cannot carry a single `asset_id`: up to five images are
-- allowed per attempt, and ADR-DB4-003 reserves direct FK columns for
-- single-valued references.
--
-- ### The shape — two business columns, nothing else
--
-- `payment_attempt_id` and `asset_id`, both `NOT NULL`, both `ON DELETE
-- RESTRICT`. No `role`: the table has exactly one meaning, and a discriminator
-- with a single legal value is an abstraction for hypothetical reuse. No
-- `grant_id` or `step_up_challenge_id`: `payment_attempts` already carries both,
-- and evidence never migrates between attempts (a retry is a new attempt,
-- LC-16). No `submitted_at`: `created_at` is the submission instant. No
-- `order_id`, `payment_obligation_id`, `customer_id`, media type, byte size,
-- filename or object key — every one of those is either another aggregate's fact
-- or Asset's, and copying it here creates a second source for it.
--
-- No `updated_at`: the association is append-only (APP7-G01 §7.2), so nothing
-- ever updates a row.
--
-- ### What is deliberately NOT here
--
--   MAX_EVIDENCE_PER_ATTEMPT = 5
--
-- is an application guard evaluated under the payment-attempt row lock, the same
-- way `MAX_ACCEPTED_UPLOADS_PER_CHALLENGE` is enforced today. A CHECK cannot
-- count sibling rows, and no trigger family is invented for it: this database
-- must accept a sixth row, and APP7-B05 must refuse it. Nor is there an
-- append-only trigger — no sibling association table has one, and inventing a
-- new trigger family for one table is not a schema decision this checkpoint owns.
--
-- ### Uniqueness
--
--   UNIQUE (payment_attempt_id, asset_id)
--
-- the CST-043 association rule as `design_version_assets` and
-- `custom_request_assets` state it, minus the role column neither this table nor
-- `design_version_assets` has. `payment_attempt_id` alone is deliberately not
-- unique — that would cap evidence at one image and contradict APP7-G01 §7.2 —
-- and `asset_id` alone is deliberately not unique either: no Asset authority
-- requires a binary to belong to exactly one consuming association globally, and
-- no sibling asserts it.
--
-- ### Retention
--
-- Both FKs are `restrict`, so neither an attempt nor a referenced asset can be
-- hard-deleted while an association exists; disposal goes through the G4 asset
-- tombstone flow, which sees this row. Evidence submitted before a verification
-- decision must survive it, or the record of what the Admin actually looked at
-- is destroyed. `cascade` and `set null` are both wrong here for that reason.
--
-- ### Data
--
-- No backfill. APP7-B05 has not shipped, so no transfer-evidence association can
-- exist yet, and this migration contains no `UPDATE` and no `INSERT`. Nothing
-- outside the new table is touched — no ALTER of `payment_attempts`, `assets` or
-- any other delivered table, no new asset kind or classification, no payment or
-- order state change.
--
-- ### Generation note
--
-- `drizzle-kit generate` again emitted the spurious `DROP CONSTRAINT` /
-- re-`ADD` pair for `ck_approval_snapshots__preview_hash_format` that
-- APP6-DB01 §3.1 documented and predicted, with the re-add truncated at
-- `'^sha256:[0-9a-f]{64}` because the value contains the JavaScript replacement
-- pattern `$'`. Both statements were removed and the same corrupted value was
-- repaired in `meta/0037_snapshot.json` to the value `0036_snapshot.json`
-- records, which is the constraint actually installed — nothing here alters it.

CREATE TABLE "payment_transfer_evidence" (
	"id" uuid NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_transfer_evidence" PRIMARY KEY("id"),
	CONSTRAINT "uq_payment_transfer_evidence__attempt_asset" UNIQUE("payment_attempt_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "payment_transfer_evidence" ADD CONSTRAINT "fk_payment_transfer_evidence__payment_attempt_id" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_transfer_evidence" ADD CONSTRAINT "fk_payment_transfer_evidence__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
