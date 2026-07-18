CREATE TABLE "assets" (
	"id" uuid NOT NULL,
	"kind" text NOT NULL,
	"classification" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" text,
	"status" text NOT NULL,
	"uploaded_by_customer_id" uuid,
	"uploaded_via_session_id" uuid,
	"deletion_requested_at" timestamp with time zone,
	"deletion_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_assets__storage_key" UNIQUE("storage_key"),
	CONSTRAINT "ck_assets__status_allowed" CHECK ("assets"."status" in ('UPLOADED', 'INSPECTING', 'ACCEPTED', 'REJECTED', 'DELETION_PENDING', 'DELETED')),
	CONSTRAINT "ck_assets__kind_allowed" CHECK ("assets"."kind" in ('CUSTOMER_UPLOAD', 'TEMPLATE_SOURCE', 'PRODUCTION_FILE', 'CATALOG_MEDIA', 'GALLERY_MEDIA')),
	CONSTRAINT "ck_assets__classification_allowed" CHECK ("assets"."classification" in ('CUSTOMER_PRIVATE', 'PRODUCTION_SENSITIVE', 'PUBLIC')),
	CONSTRAINT "ck_assets__size_bytes_positive" CHECK ("assets"."size_bytes" > 0),
	CONSTRAINT "ck_assets__checksum_format" CHECK ("assets"."checksum" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "asset_inspections" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "asset_inspections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"asset_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"detail" text,
	"inspected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_asset_inspections" PRIMARY KEY("id"),
	CONSTRAINT "ck_asset_inspections__outcome_allowed" CHECK ("asset_inspections"."outcome" in ('ACCEPTED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "asset_derivatives" (
	"id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"storage_key" text,
	"checksum" text,
	"is_watermarked" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_asset_derivatives" PRIMARY KEY("id"),
	CONSTRAINT "ck_asset_derivatives__status_allowed" CHECK ("asset_derivatives"."status" in ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
	CONSTRAINT "ck_asset_derivatives__kind_allowed" CHECK ("asset_derivatives"."kind" in ('PREVIEW_WATERMARKED', 'MOCKUP', 'NORMALIZED', 'THUMBNAIL')),
	CONSTRAINT "ck_asset_derivatives__checksum_format" CHECK ("asset_derivatives"."checksum" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_asset_derivatives__ready_has_storage_key" CHECK ("asset_derivatives"."status" <> 'READY' or "asset_derivatives"."storage_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "fk_assets__uploaded_by_customer_id" FOREIGN KEY ("uploaded_by_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_inspections" ADD CONSTRAINT "fk_asset_inspections__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_derivatives" ADD CONSTRAINT "fk_asset_derivatives__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_assets__created_id__processing" ON "assets" USING btree ("created_at","id") WHERE "assets"."status" in ('UPLOADED', 'INSPECTING');--> statement-breakpoint
CREATE INDEX "ix_assets__deletion_requested_id__pending" ON "assets" USING btree ("deletion_requested_at","id") WHERE "assets"."status" = 'DELETION_PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_asset_derivatives__asset_kind__not_failed" ON "asset_derivatives" USING btree ("asset_id","kind") WHERE "asset_derivatives"."status" <> 'FAILED';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_asset_derivatives__storage_key__set" ON "asset_derivatives" USING btree ("storage_key") WHERE "asset_derivatives"."storage_key" is not null;--> statement-breakpoint
CREATE INDEX "ix_asset_derivatives__created_id__processing" ON "asset_derivatives" USING btree ("created_at","id") WHERE "asset_derivatives"."status" in ('PENDING', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "ix_asset_derivatives__asset" ON "asset_derivatives" USING btree ("asset_id");