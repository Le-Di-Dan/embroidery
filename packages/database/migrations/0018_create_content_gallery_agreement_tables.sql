CREATE TABLE "gallery_entries" (
	"id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"display_order" integer NOT NULL,
	"linked_product_id" uuid,
	"seo_title" text,
	"seo_description" text,
	"is_indexable" boolean NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_gallery_entries" PRIMARY KEY("id"),
	CONSTRAINT "uq_gallery_entries__slug" UNIQUE("slug"),
	CONSTRAINT "ck_gallery_entries__status_allowed" CHECK ("gallery_entries"."status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "gallery_entry_assets" (
	"id" uuid NOT NULL,
	"gallery_entry_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_gallery_entry_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_gallery_entry_assets__entry_asset" UNIQUE("gallery_entry_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid NOT NULL,
	"page_type" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"is_indexable" boolean NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_content_pages" PRIMARY KEY("id"),
	CONSTRAINT "uq_content_pages__page_type_slug" UNIQUE("page_type","slug"),
	CONSTRAINT "ck_content_pages__page_type_allowed" CHECK ("content_pages"."page_type" in ('HOME', 'SERVICE', 'FAQ', 'LOCAL', 'LANDING', 'POLICY')),
	CONSTRAINT "ck_content_pages__status_allowed" CHECK ("content_pages"."status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "redirect_rules" (
	"id" uuid NOT NULL,
	"source_path" text NOT NULL,
	"target_path" text NOT NULL,
	"redirect_kind" text NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_redirect_rules" PRIMARY KEY("id"),
	CONSTRAINT "uq_redirect_rules__source_path" UNIQUE("source_path"),
	CONSTRAINT "ck_redirect_rules__kind_allowed" CHECK ("redirect_rules"."redirect_kind" in ('PERMANENT', 'TEMPORARY'))
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid NOT NULL,
	"agreement_type" text NOT NULL,
	"name" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_agreements" PRIMARY KEY("id"),
	CONSTRAINT "uq_agreements__agreement_type" UNIQUE("agreement_type")
);
--> statement-breakpoint
CREATE TABLE "agreement_versions" (
	"id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"language" text NOT NULL,
	"effective_from" timestamp with time zone,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"withdraw_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_agreement_versions" PRIMARY KEY("id"),
	CONSTRAINT "uq_agreement_versions__agreement_version" UNIQUE("agreement_id","version"),
	CONSTRAINT "ck_agreement_versions__status_allowed" CHECK ("agreement_versions"."status" in ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN')),
	CONSTRAINT "ck_agreement_versions__content_hash_format" CHECK ("agreement_versions"."content_hash" is null or "agreement_versions"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_agreement_versions__content_hash_required_once_published" CHECK ("agreement_versions"."status" = 'DRAFT' or "agreement_versions"."content_hash" is not null),
	CONSTRAINT "ck_agreement_versions__effective_from_required_once_published" CHECK ("agreement_versions"."status" = 'DRAFT' or "agreement_versions"."effective_from" is not null),
	CONSTRAINT "ck_agreement_versions__withdraw_reason_required" CHECK ("agreement_versions"."status" <> 'WITHDRAWN' or "agreement_versions"."withdraw_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "gallery_entries" ADD CONSTRAINT "fk_gallery_entries__linked_product_id" FOREIGN KEY ("linked_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_entry_assets" ADD CONSTRAINT "fk_gallery_entry_assets__gallery_entry_id" FOREIGN KEY ("gallery_entry_id") REFERENCES "public"."gallery_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_entry_assets" ADD CONSTRAINT "fk_gallery_entry_assets__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_versions" ADD CONSTRAINT "fk_agreement_versions__agreement_id" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_gallery_entries__display_id__published" ON "gallery_entries" USING btree ("display_order","id") WHERE "gallery_entries"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "ix_content_pages__published_indexable" ON "content_pages" USING btree ("id") WHERE "content_pages"."status" = 'PUBLISHED' and "content_pages"."is_indexable";--> statement-breakpoint
CREATE INDEX "ix_agreement_versions__agreement_effective_id__published" ON "agreement_versions" USING btree ("agreement_id","effective_from" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "agreement_versions"."status" = 'PUBLISHED';