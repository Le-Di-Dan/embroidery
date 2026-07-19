CREATE TABLE "production_jobs" (
	"id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"approval_snapshot_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reworked_from_job_id" uuid,
	"cancelled_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_production_jobs" PRIMARY KEY("id"),
	CONSTRAINT "uq_production_jobs__order_approval_snapshot" UNIQUE("order_id","approval_snapshot_id"),
	CONSTRAINT "ck_production_jobs__status_allowed" CHECK ("production_jobs"."status" in ('PLANNED', 'STARTED', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "ck_production_jobs__cancelled_reason_required" CHECK ("production_jobs"."status" <> 'CANCELLED' or "production_jobs"."cancelled_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "production_specifications" (
	"id" uuid NOT NULL,
	"production_job_id" uuid NOT NULL,
	"approval_snapshot_id" uuid NOT NULL,
	"document_hash" text NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" text,
	"side_name" text NOT NULL,
	"area_name" text NOT NULL,
	"physical_width_mm" numeric NOT NULL,
	"physical_height_mm" numeric NOT NULL,
	"quantity_total" integer NOT NULL,
	"production_parameters" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_production_specifications" PRIMARY KEY("id"),
	CONSTRAINT "uq_production_specifications__job" UNIQUE("production_job_id"),
	CONSTRAINT "ck_production_specifications__physical_mm_positive" CHECK ("production_specifications"."physical_width_mm" > 0 and "production_specifications"."physical_height_mm" > 0),
	CONSTRAINT "ck_production_specifications__quantity_positive" CHECK ("production_specifications"."quantity_total" > 0),
	CONSTRAINT "ck_production_specifications__document_hash_format" CHECK ("production_specifications"."document_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "production_artifacts" (
	"id" uuid NOT NULL,
	"production_job_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_production_artifacts" PRIMARY KEY("id"),
	CONSTRAINT "uq_production_artifacts__job_asset" UNIQUE("production_job_id","asset_id"),
	CONSTRAINT "ck_production_artifacts__kind_allowed" CHECK ("production_artifacts"."kind" in ('DIGITIZED_FILE', 'MACHINE_FILE', 'PHOTO', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "production_notes" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "production_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"production_job_id" uuid NOT NULL,
	"note" text NOT NULL,
	"admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_production_notes" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "production_job_transitions" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "production_job_transitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"production_job_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_kind" text NOT NULL,
	"admin_id" uuid,
	"system_job_key" text,
	"reason" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_production_job_transitions" PRIMARY KEY("id"),
	CONSTRAINT "ck_production_job_transitions__from_status_allowed" CHECK ("production_job_transitions"."from_status" in ('PLANNED', 'STARTED', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "ck_production_job_transitions__to_status_allowed" CHECK ("production_job_transitions"."to_status" in ('PLANNED', 'STARTED', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "ck_production_job_transitions__reason_required" CHECK ("production_job_transitions"."to_status" <> 'CANCELLED' or "production_job_transitions"."reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "fk_production_jobs__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "fk_production_jobs__approval_snapshot_id" FOREIGN KEY ("approval_snapshot_id") REFERENCES "public"."approval_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "fk_production_jobs__reworked_from_job_id" FOREIGN KEY ("reworked_from_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_specifications" ADD CONSTRAINT "fk_production_specifications__production_job_id" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_specifications" ADD CONSTRAINT "fk_production_specifications__approval_snapshot_id" FOREIGN KEY ("approval_snapshot_id") REFERENCES "public"."approval_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_artifacts" ADD CONSTRAINT "fk_production_artifacts__production_job_id" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_artifacts" ADD CONSTRAINT "fk_production_artifacts__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_notes" ADD CONSTRAINT "fk_production_notes__production_job_id" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_transitions" ADD CONSTRAINT "fk_production_job_transitions__production_job_id" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_transitions" ADD CONSTRAINT "fk_production_job_transitions__admin_id" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_production_jobs__created_id__active" ON "production_jobs" USING btree ("created_at","id") WHERE "production_jobs"."status" in ('PLANNED', 'STARTED');--> statement-breakpoint
CREATE INDEX "ix_production_job_transitions__production_job_id" ON "production_job_transitions" USING btree ("production_job_id","id");