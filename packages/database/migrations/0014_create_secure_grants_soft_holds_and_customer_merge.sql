CREATE TABLE "secure_access_grants" (
	"id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"scope_kind" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"superseded_by_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_secure_access_grants" PRIMARY KEY("id"),
	CONSTRAINT "uq_secure_access_grants__token_hash" UNIQUE("token_hash"),
	CONSTRAINT "ck_secure_access_grants__status_allowed" CHECK ("secure_access_grants"."status" in ('ACTIVE', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "ck_secure_access_grants__scope_kind_allowed" CHECK ("secure_access_grants"."scope_kind" in ('REQUEST_ACCESS')),
	CONSTRAINT "ck_secure_access_grants__revoke_reason_required" CHECK ("secure_access_grants"."status" <> 'REVOKED' or "secure_access_grants"."revoke_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "inventory_soft_holds" (
	"id" uuid NOT NULL,
	"sku_stock_id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_reason" text,
	"converted_reservation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_inventory_soft_holds" PRIMARY KEY("id"),
	CONSTRAINT "ck_inventory_soft_holds__status_allowed" CHECK ("inventory_soft_holds"."status" in ('HELD', 'CONVERTED', 'RELEASED', 'EXPIRED')),
	CONSTRAINT "ck_inventory_soft_holds__quantity_positive" CHECK ("inventory_soft_holds"."quantity" > 0),
	CONSTRAINT "ck_inventory_soft_holds__released_reason_required" CHECK ("inventory_soft_holds"."status" <> 'RELEASED' or "inventory_soft_holds"."released_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "customer_merge_cases" (
	"id" uuid NOT NULL,
	"survivor_customer_id" uuid NOT NULL,
	"loser_customer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"requested_by_admin_id" uuid NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_customer_merge_cases" PRIMARY KEY("id"),
	CONSTRAINT "ck_customer_merge_cases__status_allowed" CHECK ("customer_merge_cases"."status" in ('REQUESTED', 'EXECUTED', 'REJECTED')),
	CONSTRAINT "ck_customer_merge_cases__no_self_merge" CHECK ("customer_merge_cases"."survivor_customer_id" <> "customer_merge_cases"."loser_customer_id")
);
--> statement-breakpoint
CREATE TABLE "customer_merge_events" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "customer_merge_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"merge_case_id" uuid NOT NULL,
	"step_kind" text NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_customer_merge_events" PRIMARY KEY("id"),
	CONSTRAINT "ck_customer_merge_events__step_kind_allowed" CHECK ("customer_merge_events"."step_kind" in ('OWNERSHIP_TRANSFER', 'CONTACT_MOVE', 'GRANT_REVOKE', 'TOMBSTONE'))
);
--> statement-breakpoint
ALTER TABLE "secure_access_grants" ADD CONSTRAINT "fk_secure_access_grants__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secure_access_grants" ADD CONSTRAINT "fk_secure_access_grants__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secure_access_grants" ADD CONSTRAINT "fk_secure_access_grants__superseded_by_grant_id" FOREIGN KEY ("superseded_by_grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_soft_holds" ADD CONSTRAINT "fk_inventory_soft_holds__sku_stock_id" FOREIGN KEY ("sku_stock_id") REFERENCES "public"."sku_stocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_soft_holds" ADD CONSTRAINT "fk_inventory_soft_holds__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_merge_cases" ADD CONSTRAINT "fk_customer_merge_cases__survivor_customer_id" FOREIGN KEY ("survivor_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_merge_cases" ADD CONSTRAINT "fk_customer_merge_cases__loser_customer_id" FOREIGN KEY ("loser_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_merge_events" ADD CONSTRAINT "fk_customer_merge_events__merge_case_id" FOREIGN KEY ("merge_case_id") REFERENCES "public"."customer_merge_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_secure_access_grants__customer_request__active" ON "secure_access_grants" USING btree ("customer_id","custom_request_id") WHERE "secure_access_grants"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ix_secure_access_grants__expires_at" ON "secure_access_grants" USING btree ("expires_at","id") WHERE "secure_access_grants"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ix_secure_access_grants__custom_request_id" ON "secure_access_grants" USING btree ("custom_request_id");--> statement-breakpoint
CREATE INDEX "ix_secure_access_grants__customer_id" ON "secure_access_grants" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_soft_holds__request_stock__held" ON "inventory_soft_holds" USING btree ("custom_request_id","sku_stock_id") WHERE "inventory_soft_holds"."status" = 'HELD';--> statement-breakpoint
CREATE INDEX "ix_inventory_soft_holds__sku_stock_id" ON "inventory_soft_holds" USING btree ("sku_stock_id","id") WHERE "inventory_soft_holds"."status" = 'HELD';--> statement-breakpoint
CREATE INDEX "ix_inventory_soft_holds__expires_at" ON "inventory_soft_holds" USING btree ("expires_at","id") WHERE "inventory_soft_holds"."status" = 'HELD';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customer_merge_cases__survivor_loser__requested" ON "customer_merge_cases" USING btree ("survivor_customer_id","loser_customer_id") WHERE "customer_merge_cases"."status" = 'REQUESTED';--> statement-breakpoint
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "fk_inventory_ledger_entries__soft_hold_id" FOREIGN KEY ("soft_hold_id") REFERENCES "public"."inventory_soft_holds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_transitions" ADD CONSTRAINT "fk_custom_request_transitions__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;