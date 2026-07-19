CREATE TABLE "approval_snapshots" (
	"id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"design_case_id" uuid NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"document_hash" text NOT NULL,
	"preview_hash" text,
	"product_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"product_side_id" uuid NOT NULL,
	"embroidery_area_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" text,
	"side_name" text NOT NULL,
	"area_name" text NOT NULL,
	"physical_width_mm" numeric NOT NULL,
	"physical_height_mm" numeric NOT NULL,
	"quantity_total" integer NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"grant_id" uuid NOT NULL,
	"step_up_challenge_id" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_approval_snapshots" PRIMARY KEY("id"),
	CONSTRAINT "uq_approval_snapshots__version" UNIQUE("design_version_id"),
	CONSTRAINT "ck_approval_snapshots__physical_mm_positive" CHECK ("approval_snapshots"."physical_width_mm" > 0 and "approval_snapshots"."physical_height_mm" > 0),
	CONSTRAINT "ck_approval_snapshots__quantity_positive" CHECK ("approval_snapshots"."quantity_total" > 0),
	CONSTRAINT "ck_approval_snapshots__document_hash_format" CHECK ("approval_snapshots"."document_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_approval_snapshots__preview_hash_format" CHECK ("approval_snapshots"."preview_hash" is null or "approval_snapshots"."preview_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "approval_snapshot_thread_colors" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "approval_snapshot_thread_colors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"approval_snapshot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"color_code" text NOT NULL,
	"color_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_approval_snapshot_thread_colors" PRIMARY KEY("id"),
	CONSTRAINT "uq_approval_thread_colors__approval_position" UNIQUE("approval_snapshot_id","position")
);
--> statement-breakpoint
CREATE TABLE "approval_snapshot_agreement_acceptances" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "approval_snapshot_agreement_acceptances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"approval_snapshot_id" uuid NOT NULL,
	"agreement_version_id" uuid NOT NULL,
	"agreement_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_approval_snapshot_agreement_acceptances" PRIMARY KEY("id"),
	CONSTRAINT "uq_approval_acceptances__approval_agrversion" UNIQUE("approval_snapshot_id","agreement_version_id"),
	CONSTRAINT "ck_approval_acceptances__content_hash_format" CHECK ("approval_snapshot_agreement_acceptances"."content_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__design_version_id" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__design_case_id" FOREIGN KEY ("design_case_id") REFERENCES "public"."design_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__product_variant_id" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__product_side_id" FOREIGN KEY ("product_side_id") REFERENCES "public"."product_sides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__embroidery_area_id" FOREIGN KEY ("embroidery_area_id") REFERENCES "public"."embroidery_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "fk_approval_snapshots__step_up_challenge_id" FOREIGN KEY ("step_up_challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshot_thread_colors" ADD CONSTRAINT "fk_approval_thread_colors__approval_snapshot_id" FOREIGN KEY ("approval_snapshot_id") REFERENCES "public"."approval_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshot_agreement_acceptances" ADD CONSTRAINT "fk_approval_acceptances__approval_snapshot_id" FOREIGN KEY ("approval_snapshot_id") REFERENCES "public"."approval_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_snapshot_agreement_acceptances" ADD CONSTRAINT "fk_approval_acceptances__agreement_version_id" FOREIGN KEY ("agreement_version_id") REFERENCES "public"."agreement_versions"("id") ON DELETE restrict ON UPDATE no action;