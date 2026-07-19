CREATE TABLE "custom_requests" (
	"id" uuid NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"product_id" uuid,
	"product_variant_id" uuid,
	"customer_note" text,
	"current_design_case_id" uuid,
	"current_quotation_id" uuid,
	"cancelled_reason" text,
	"cancelled_customer_reason" text,
	"submitted_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_custom_requests" PRIMARY KEY("id"),
	CONSTRAINT "uq_custom_requests__code" UNIQUE("code"),
	CONSTRAINT "ck_custom_requests__status_allowed" CHECK ("custom_requests"."status" in ('NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'QUOTED', 'QUOTE_ACCEPTED', 'DIGITIZING', 'DESIGN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "customer_owned_products" (
	"id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"physical_width_mm" numeric,
	"physical_height_mm" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_customer_owned_products" PRIMARY KEY("id"),
	CONSTRAINT "uq_customer_owned_products__request" UNIQUE("custom_request_id"),
	CONSTRAINT "ck_customer_owned_products__dims_positive" CHECK ("customer_owned_products"."physical_width_mm" > 0 and "customer_owned_products"."physical_height_mm" > 0)
);
--> statement-breakpoint
CREATE TABLE "custom_request_quantity_breakdowns" (
	"id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"product_variant_id" uuid,
	"size_label" text,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_custom_request_quantity_breakdowns" PRIMARY KEY("id"),
	CONSTRAINT "uq_request_quantity_breakdowns__request_variant_size" UNIQUE("custom_request_id","product_variant_id","size_label"),
	CONSTRAINT "ck_custom_request_quantity_breakdowns__quantity_positive" CHECK ("custom_request_quantity_breakdowns"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "custom_request_assets" (
	"id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_custom_request_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_custom_request_assets__request_asset_role" UNIQUE("custom_request_id","asset_id","role"),
	CONSTRAINT "ck_custom_request_assets__role_allowed" CHECK ("custom_request_assets"."role" in ('COP_IMAGE', 'REFERENCE', 'ATTACHMENT'))
);
--> statement-breakpoint
CREATE TABLE "request_moderation_notes" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "request_moderation_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"custom_request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_request_moderation_notes" PRIMARY KEY("id"),
	CONSTRAINT "ck_request_moderation_notes__kind_allowed" CHECK ("request_moderation_notes"."kind" in ('SPAM', 'REJECT', 'PAUSE', 'CLARIFY', 'NOTE'))
);
--> statement-breakpoint
CREATE TABLE "custom_request_transitions" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "custom_request_transitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"custom_request_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_kind" text NOT NULL,
	"admin_id" uuid,
	"customer_id" uuid,
	"grant_id" uuid,
	"system_job_key" text,
	"reason" text,
	"customer_visible_reason" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_custom_request_transitions" PRIMARY KEY("id"),
	CONSTRAINT "ck_custom_request_transitions__from_status_allowed" CHECK ("custom_request_transitions"."from_status" in ('NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'QUOTED', 'QUOTE_ACCEPTED', 'DIGITIZING', 'DESIGN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
	CONSTRAINT "ck_custom_request_transitions__to_status_allowed" CHECK ("custom_request_transitions"."to_status" in ('NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'QUOTED', 'QUOTE_ACCEPTED', 'DIGITIZING', 'DESIGN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "design_cases" (
	"id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_cases" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_cases__request" UNIQUE("custom_request_id")
);
--> statement-breakpoint
ALTER TABLE "custom_requests" ADD CONSTRAINT "fk_custom_requests__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD CONSTRAINT "fk_custom_requests__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD CONSTRAINT "fk_custom_requests__product_variant_id" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_owned_products" ADD CONSTRAINT "fk_customer_owned_products__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_quantity_breakdowns" ADD CONSTRAINT "fk_custom_request_quantity_breakdowns__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_quantity_breakdowns" ADD CONSTRAINT "fk_custom_request_quantity_breakdowns__product_variant_id" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_assets" ADD CONSTRAINT "fk_custom_request_assets__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_assets" ADD CONSTRAINT "fk_custom_request_assets__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_moderation_notes" ADD CONSTRAINT "fk_request_moderation_notes__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_transitions" ADD CONSTRAINT "fk_custom_request_transitions__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_transitions" ADD CONSTRAINT "fk_custom_request_transitions__admin_id" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_transitions" ADD CONSTRAINT "fk_custom_request_transitions__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_cases" ADD CONSTRAINT "fk_design_cases__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_custom_requests__status_created_id" ON "custom_requests" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_request_transitions__request_id" ON "custom_request_transitions" USING btree ("custom_request_id","id");