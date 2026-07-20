-- DB6-S25 — remaining launch performance-index backlog (27 entries).
-- Exact definitions sourced from DB6_INDEX_IMPLEMENTATION_MANIFEST.md §3/§7
-- and DB5_INDEX_CATALOG.md; no table/column/FK/CHECK/trigger changes.

-- G1 — admin_sessions
CREATE INDEX "ix_admin_sessions__expires_id__active" ON "admin_sessions" USING btree ("expires_at","id") WHERE "status" = 'ACTIVE';
--> statement-breakpoint
CREATE INDEX "ix_admin_sessions__admin_account" ON "admin_sessions" USING btree ("admin_account_id");
--> statement-breakpoint

-- G2 — outbox_events / idempotency_records / background_job_attempts
CREATE INDEX "ix_outbox_events__next_attempt_id__pending" ON "outbox_events" USING btree ("next_attempt_at" NULLS FIRST,"id") WHERE "status" = 'PENDING';
--> statement-breakpoint
CREATE INDEX "ix_outbox_events__dispatched_id__dispatched" ON "outbox_events" USING btree ("dispatched_at","id") WHERE "status" = 'DISPATCHED';
--> statement-breakpoint
CREATE INDEX "ix_idempotency_records__expires_id" ON "idempotency_records" USING btree ("expires_at","id");
--> statement-breakpoint
CREATE INDEX "ix_idempotency_records__claimed_id__in_progress" ON "idempotency_records" USING btree ("claimed_at","id") WHERE "status" = 'IN_PROGRESS';
--> statement-breakpoint
CREATE INDEX "ix_background_job_attempts__finished_id__dead_letter" ON "background_job_attempts" USING btree ("finished_at","id") WHERE "is_dead_letter";
--> statement-breakpoint

-- G3 — customers
CREATE INDEX "ix_customers__merged_into__set" ON "customers" USING btree ("merged_into_customer_id") WHERE "merged_into_customer_id" IS NOT NULL;
--> statement-breakpoint

-- G4 — assets / asset_inspections
CREATE INDEX "ix_assets__uploaded_by" ON "assets" USING btree ("uploaded_by_customer_id") WHERE "uploaded_by_customer_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ix_asset_inspections__asset_inspected" ON "asset_inspections" USING btree ("asset_id","inspected_at");
--> statement-breakpoint

-- G8 — contact_verification_challenges
CREATE INDEX "ix_contact_verification_challenges__contact_point" ON "contact_verification_challenges" USING btree ("contact_point_id") WHERE "contact_point_id" IS NOT NULL;
--> statement-breakpoint

-- G9 — custom_requests / request_moderation_notes
CREATE INDEX "ix_custom_requests__customer" ON "custom_requests" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX "ix_request_moderation_notes__request_created" ON "request_moderation_notes" USING btree ("custom_request_id","created_at");
--> statement-breakpoint

-- G10 — inventory_soft_holds / customer_merge_events
CREATE INDEX "ix_inventory_soft_holds__request" ON "inventory_soft_holds" USING btree ("custom_request_id");
--> statement-breakpoint
CREATE INDEX "ix_customer_merge_events__merge_case" ON "customer_merge_events" USING btree ("merge_case_id","id");
--> statement-breakpoint

-- G11 — design_reviews
CREATE INDEX "ix_design_reviews__version_decided" ON "design_reviews" USING btree ("design_version_id","decided_at");
--> statement-breakpoint

-- G13 — approval_snapshots
CREATE INDEX "ix_approval_snapshots__request" ON "approval_snapshots" USING btree ("custom_request_id");
--> statement-breakpoint

-- G15 — orders / shipping_fee_acknowledgements / inventory_reservations
CREATE INDEX "ix_orders__customer" ON "orders" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX "ix_shipping_fee_acknowledgements__order" ON "shipping_fee_acknowledgements" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "ix_inventory_reservations__order" ON "inventory_reservations" USING btree ("order_id");
--> statement-breakpoint

-- G16 — payment_attempts / refunds / payment_reconciliations
CREATE INDEX "ix_payment_attempts__provider_key_ref" ON "payment_attempts" USING btree ("provider_key","provider_ref") WHERE "provider_ref" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ix_refunds__order" ON "refunds" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "ix_refunds__created_id__pending_review" ON "refunds" USING btree ("created_at","id") WHERE "status" IN ('PENDING_REVIEW','APPROVED');
--> statement-breakpoint
CREATE INDEX "ix_payment_reconciliations__attempt" ON "payment_reconciliations" USING btree ("payment_attempt_id");
--> statement-breakpoint

-- G17 — production_notes
CREATE INDEX "ix_production_notes__job_created" ON "production_notes" USING btree ("production_job_id","created_at");
--> statement-breakpoint

-- G19 — audit_events (IDX-097 / IDX-098, this group's own deferral)
CREATE INDEX "ix_audit_events__correlation" ON "audit_events" USING btree ("correlation_id");
--> statement-breakpoint
CREATE INDEX "ix_audit_events__admin__occurred__id" ON "audit_events" USING btree ("admin_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "admin_id" IS NOT NULL;
