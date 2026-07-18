CREATE TABLE "policy_configurations" (
	"id" uuid NOT NULL,
	"config_key" text NOT NULL,
	"description" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_policy_configurations" PRIMARY KEY("id"),
	CONSTRAINT "uq_policy_configurations__config_key" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "policy_configuration_versions" (
	"id" uuid NOT NULL,
	"policy_configuration_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"value" jsonb NOT NULL,
	"value_schema_version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_by_admin_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_policy_configuration_versions" PRIMARY KEY("id"),
	CONSTRAINT "uq_policy_configuration_versions__config_version" UNIQUE("policy_configuration_id","version")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "idempotency_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"operation_namespace" text NOT NULL,
	"scope_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_idempotency_records" PRIMARY KEY("id"),
	CONSTRAINT "uq_idempotency_records__namespace_scope_key" UNIQUE("operation_namespace","scope_key"),
	CONSTRAINT "ck_idempotency_records__status_allowed" CHECK ("idempotency_records"."status" in ('IN_PROGRESS', 'COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_type" text NOT NULL,
	"aggregate_kind" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_schema_version" integer NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_outbox_events" PRIMARY KEY("id"),
	CONSTRAINT "ck_outbox_events__status_allowed" CHECK ("outbox_events"."status" in ('PENDING', 'DISPATCHED', 'FAILED', 'DEAD_LETTER'))
);
--> statement-breakpoint
CREATE TABLE "background_job_attempts" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "background_job_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_kind" text NOT NULL,
	"job_key" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"outcome" text NOT NULL,
	"is_dead_letter" boolean NOT NULL,
	"error_class" text,
	"finished_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_background_job_attempts" PRIMARY KEY("id"),
	CONSTRAINT "uq_background_job_attempts__kind_key_attempt" UNIQUE("job_kind","job_key","attempt_no"),
	CONSTRAINT "ck_background_job_attempts__outcome_allowed" CHECK ("background_job_attempts"."outcome" in ('SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL')),
	CONSTRAINT "ck_background_job_attempts__attempt_no_positive" CHECK ("background_job_attempts"."attempt_no" > 0)
);
--> statement-breakpoint
ALTER TABLE "policy_configuration_versions" ADD CONSTRAINT "fk_policy_configuration_versions__policy_configuration_id" FOREIGN KEY ("policy_configuration_id") REFERENCES "public"."policy_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_configuration_versions" ADD CONSTRAINT "fk_policy_configuration_versions__created_by_admin_id" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;