CREATE TABLE "design_versions" (
	"id" uuid NOT NULL,
	"design_case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_version_id" uuid,
	"status" text NOT NULL,
	"design_document" jsonb NOT NULL,
	"document_schema_version" integer NOT NULL,
	"document_hash" text,
	"preview_derivative_id" uuid,
	"preview_hash" text,
	"product_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"product_side_id" uuid NOT NULL,
	"embroidery_area_id" uuid NOT NULL,
	"physical_width_mm" numeric NOT NULL,
	"physical_height_mm" numeric NOT NULL,
	"sent_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_versions" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_versions__case_version" UNIQUE("design_case_id","version"),
	CONSTRAINT "ck_design_versions__status_allowed" CHECK ("design_versions"."status" in ('DRAFT', 'SENT_FOR_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'SUPERSEDED', 'VOID')),
	CONSTRAINT "ck_design_versions__physical_mm_positive" CHECK ("design_versions"."physical_width_mm" > 0 and "design_versions"."physical_height_mm" > 0),
	CONSTRAINT "ck_design_versions__document_hash_format" CHECK ("design_versions"."document_hash" is null or "design_versions"."document_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_design_versions__preview_hash_format" CHECK ("design_versions"."preview_hash" is null or "design_versions"."preview_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_design_versions__document_hash_required_once_sent" CHECK ("design_versions"."status" = 'DRAFT' or "design_versions"."document_hash" is not null),
	CONSTRAINT "ck_design_versions__void_reason_required" CHECK ("design_versions"."status" <> 'VOID' or "design_versions"."void_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "design_version_assets" (
	"id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_version_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_version_assets__version_asset" UNIQUE("design_version_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "design_reviews" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "design_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"design_version_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"feedback" text,
	"customer_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"step_up_challenge_id" uuid,
	"decided_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_reviews" PRIMARY KEY("id"),
	CONSTRAINT "ck_design_reviews__outcome_allowed" CHECK ("design_reviews"."outcome" in ('APPROVE', 'REQUEST_REVISION'))
);
--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__design_case_id" FOREIGN KEY ("design_case_id") REFERENCES "public"."design_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__parent_version_id" FOREIGN KEY ("parent_version_id") REFERENCES "public"."design_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__preview_derivative_id" FOREIGN KEY ("preview_derivative_id") REFERENCES "public"."asset_derivatives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__product_variant_id" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__product_side_id" FOREIGN KEY ("product_side_id") REFERENCES "public"."product_sides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "fk_design_versions__embroidery_area_id" FOREIGN KEY ("embroidery_area_id") REFERENCES "public"."embroidery_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_assets" ADD CONSTRAINT "fk_design_version_assets__design_version_id" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_assets" ADD CONSTRAINT "fk_design_version_assets__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "fk_design_reviews__design_version_id" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "fk_design_reviews__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "fk_design_reviews__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "fk_design_reviews__step_up_challenge_id" FOREIGN KEY ("step_up_challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_design_versions__case__sent_for_review" ON "design_versions" USING btree ("design_case_id") WHERE "design_versions"."status" = 'SENT_FOR_REVIEW';