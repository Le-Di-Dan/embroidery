CREATE TABLE "design_templates" (
	"id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"product_id" uuid,
	"product_side_id" uuid,
	"embroidery_area_id" uuid,
	"status" text NOT NULL,
	"current_version" integer NOT NULL,
	"preview_derivative_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_templates" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_templates__slug" UNIQUE("slug"),
	CONSTRAINT "ck_design_templates__status_allowed" CHECK ("design_templates"."status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "design_template_versions" (
	"id" uuid NOT NULL,
	"design_template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"design_document" jsonb NOT NULL,
	"document_schema_version" integer NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_template_versions" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_template_versions__template_version" UNIQUE("design_template_id","version")
);
--> statement-breakpoint
CREATE TABLE "design_template_assets" (
	"id" uuid NOT NULL,
	"design_template_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_template_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_template_assets__template_asset" UNIQUE("design_template_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "design_sessions" (
	"id" uuid NOT NULL,
	"session_secret_hash" text NOT NULL,
	"product_id" uuid NOT NULL,
	"product_variant_id" uuid,
	"product_side_id" uuid NOT NULL,
	"embroidery_area_id" uuid NOT NULL,
	"design_document" jsonb NOT NULL,
	"document_schema_version" integer NOT NULL,
	"autosave_revision" integer NOT NULL,
	"template_id" uuid,
	"template_version" integer,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"submitted_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_sessions" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_sessions__session_secret_hash" UNIQUE("session_secret_hash"),
	CONSTRAINT "ck_design_sessions__status_allowed" CHECK ("design_sessions"."status" in ('ACTIVE', 'SUBMITTED', 'EXPIRED', 'DELETED')),
	CONSTRAINT "ck_design_sessions__autosave_revision_non_negative" CHECK ("design_sessions"."autosave_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "design_session_assets" (
	"id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_design_session_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_design_session_assets__session_asset" UNIQUE("session_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "design_templates" ADD CONSTRAINT "fk_design_templates__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_templates" ADD CONSTRAINT "fk_design_templates__product_side_id" FOREIGN KEY ("product_side_id") REFERENCES "public"."product_sides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_templates" ADD CONSTRAINT "fk_design_templates__embroidery_area_id" FOREIGN KEY ("embroidery_area_id") REFERENCES "public"."embroidery_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_templates" ADD CONSTRAINT "fk_design_templates__preview_derivative_id" FOREIGN KEY ("preview_derivative_id") REFERENCES "public"."asset_derivatives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_template_versions" ADD CONSTRAINT "fk_design_template_versions__design_template_id" FOREIGN KEY ("design_template_id") REFERENCES "public"."design_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_template_assets" ADD CONSTRAINT "fk_design_template_assets__design_template_id" FOREIGN KEY ("design_template_id") REFERENCES "public"."design_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_template_assets" ADD CONSTRAINT "fk_design_template_assets__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_sessions" ADD CONSTRAINT "fk_design_sessions__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_sessions" ADD CONSTRAINT "fk_design_sessions__product_variant_id" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_sessions" ADD CONSTRAINT "fk_design_sessions__product_side_id" FOREIGN KEY ("product_side_id") REFERENCES "public"."product_sides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_sessions" ADD CONSTRAINT "fk_design_sessions__embroidery_area_id" FOREIGN KEY ("embroidery_area_id") REFERENCES "public"."embroidery_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_sessions" ADD CONSTRAINT "fk_design_sessions__template_id" FOREIGN KEY ("template_id") REFERENCES "public"."design_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_session_assets" ADD CONSTRAINT "fk_design_session_assets__session_id" FOREIGN KEY ("session_id") REFERENCES "public"."design_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_session_assets" ADD CONSTRAINT "fk_design_session_assets__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_design_sessions__last_activity_id__active" ON "design_sessions" USING btree ("last_activity_at","id") WHERE "design_sessions"."status" = 'ACTIVE';