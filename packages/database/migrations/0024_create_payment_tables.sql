CREATE TABLE "payment_obligations" (
	"id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"status" text NOT NULL,
	"satisfied_at" timestamp with time zone,
	"satisfied_by_attempt_id" uuid,
	"superseded_by_obligation_id" uuid,
	"source_quotation_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_obligations" PRIMARY KEY("id"),
	CONSTRAINT "ck_payment_obligations__kind_allowed" CHECK ("payment_obligations"."kind" in ('DEPOSIT', 'REMAINING')),
	CONSTRAINT "ck_payment_obligations__status_allowed" CHECK ("payment_obligations"."status" in ('PENDING', 'SATISFIED', 'CANCELLED', 'SUPERSEDED')),
	CONSTRAINT "ck_payment_obligations__amount_positive" CHECK ("payment_obligations"."amount" > 0),
	CONSTRAINT "ck_payment_obligations__currency_vnd" CHECK ("payment_obligations"."currency_code" = 'VND'),
	CONSTRAINT "ck_payment_obligations__satisfied_evidence_required" CHECK ("payment_obligations"."status" <> 'SATISFIED' or ("payment_obligations"."satisfied_at" is not null and "payment_obligations"."satisfied_by_attempt_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid NOT NULL,
	"payment_obligation_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"method" text NOT NULL,
	"provider_key" text,
	"provider_ref" text,
	"status" text NOT NULL,
	"grant_id" uuid,
	"step_up_challenge_id" uuid,
	"expires_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_attempts" PRIMARY KEY("id"),
	CONSTRAINT "ck_payment_attempts__method_allowed" CHECK ("payment_attempts"."method" in ('PROVIDER_REDIRECT', 'BANK_TRANSFER', 'OTHER')),
	CONSTRAINT "ck_payment_attempts__status_allowed" CHECK ("payment_attempts"."status" in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REQUIRES_REVIEW', 'REFUNDED', 'PARTIALLY_REFUNDED')),
	CONSTRAINT "ck_payment_attempts__amount_positive" CHECK ("payment_attempts"."amount" > 0),
	CONSTRAINT "ck_payment_attempts__currency_vnd" CHECK ("payment_attempts"."currency_code" = 'VND'),
	CONSTRAINT "ck_payment_attempts__review_reason_required" CHECK ("payment_attempts"."status" <> 'REQUIRES_REVIEW' or "payment_attempts"."review_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_provider_events" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "payment_provider_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider_key" text NOT NULL,
	"provider_event_ref" text NOT NULL,
	"payment_attempt_id" uuid,
	"event_kind" text NOT NULL,
	"amount" numeric(14, 2),
	"currency_code" text,
	"redacted_payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"application_outcome" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_provider_events" PRIMARY KEY("id"),
	CONSTRAINT "uq_payment_provider_events__provider_key__provider_event_ref" UNIQUE("provider_key","provider_event_ref"),
	CONSTRAINT "ck_payment_provider_events__event_kind_allowed" CHECK ("payment_provider_events"."event_kind" in ('SUCCESS', 'FAILURE', 'EXPIRY', 'INFO')),
	CONSTRAINT "ck_payment_provider_events__application_outcome_allowed" CHECK ("payment_provider_events"."application_outcome" in ('APPLIED', 'REPLAYED', 'RECORDED_NO_OP', 'ESCALATED')),
	CONSTRAINT "ck_payment_provider_events__amount_non_negative" CHECK ("payment_provider_events"."amount" is null or "payment_provider_events"."amount" >= 0),
	CONSTRAINT "ck_payment_provider_events__currency_vnd" CHECK ("payment_provider_events"."currency_code" is null or "payment_provider_events"."currency_code" = 'VND')
);
--> statement-breakpoint
CREATE TABLE "payment_reconciliations" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "payment_reconciliations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payment_attempt_id" uuid,
	"payment_obligation_id" uuid,
	"action" text NOT NULL,
	"resolved_status" text,
	"amount" numeric(14, 2),
	"reason" text NOT NULL,
	"admin_id" uuid NOT NULL,
	"bank_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_reconciliations" PRIMARY KEY("id"),
	CONSTRAINT "ck_payment_reconciliations__action_allowed" CHECK ("payment_reconciliations"."action" in ('MANUAL_MATCH', 'RESOLVE_REVIEW', 'OBLIGATION_RECALC', 'CARRYOVER_APPLICATION')),
	CONSTRAINT "ck_payment_reconciliations__target_required" CHECK ("payment_reconciliations"."payment_attempt_id" is not null or "payment_reconciliations"."payment_obligation_id" is not null),
	CONSTRAINT "ck_payment_reconciliations__amount_non_negative" CHECK ("payment_reconciliations"."amount" is null or "payment_reconciliations"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"cancellation_request_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"status" text NOT NULL,
	"method" text,
	"transfer_reference" text,
	"reason" text NOT NULL,
	"customer_visible_reason" text,
	"approved_by_admin_id" uuid,
	"executed_by_admin_id" uuid,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_refunds" PRIMARY KEY("id"),
	CONSTRAINT "ck_refunds__status_allowed" CHECK ("refunds"."status" in ('PENDING_REVIEW', 'APPROVED', 'EXECUTED', 'REJECTED')),
	CONSTRAINT "ck_refunds__method_allowed" CHECK ("refunds"."method" is null or "refunds"."method" in ('BANK_TRANSFER', 'OTHER')),
	CONSTRAINT "ck_refunds__amount_positive" CHECK ("refunds"."amount" > 0),
	CONSTRAINT "ck_refunds__currency_vnd" CHECK ("refunds"."currency_code" = 'VND'),
	CONSTRAINT "ck_refunds__transfer_reference_required" CHECK ("refunds"."status" <> 'EXECUTED' or "refunds"."transfer_reference" is not null)
);
--> statement-breakpoint
ALTER TABLE "payment_obligations" ADD CONSTRAINT "fk_payment_obligations__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_obligations" ADD CONSTRAINT "fk_payment_obligations__source_quotation_version_id" FOREIGN KEY ("source_quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_obligations" ADD CONSTRAINT "fk_payment_obligations__superseded_by_obligation_id" FOREIGN KEY ("superseded_by_obligation_id") REFERENCES "public"."payment_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "fk_payment_attempts__payment_obligation_id" FOREIGN KEY ("payment_obligation_id") REFERENCES "public"."payment_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "fk_payment_attempts__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "fk_payment_attempts__step_up_challenge_id" FOREIGN KEY ("step_up_challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "fk_payment_provider_events__payment_attempt_id" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "fk_payment_reconciliations__payment_attempt_id" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "fk_payment_reconciliations__payment_obligation_id" FOREIGN KEY ("payment_obligation_id") REFERENCES "public"."payment_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds__payment_attempt_id" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds__cancellation_request_id" FOREIGN KEY ("cancellation_request_id") REFERENCES "public"."order_cancellation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_obligations__order_kind__live" ON "payment_obligations" USING btree ("order_id","kind") WHERE "payment_obligations"."status" in ('PENDING', 'SATISFIED');--> statement-breakpoint
CREATE INDEX "ix_payment_obligations__order_id" ON "payment_obligations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ix_payment_attempts__created_id__failed_review" ON "payment_attempts" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "payment_attempts"."status" in ('FAILED', 'REQUIRES_REVIEW');--> statement-breakpoint
CREATE INDEX "ix_payment_attempts__payment_obligation_id" ON "payment_attempts" USING btree ("payment_obligation_id");--> statement-breakpoint
CREATE INDEX "ix_payment_provider_events__received_id" ON "payment_provider_events" USING btree ("received_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_payment_provider_events__attempt_id__matched" ON "payment_provider_events" USING btree ("payment_attempt_id") WHERE "payment_provider_events"."payment_attempt_id" is not null;--> statement-breakpoint
CREATE INDEX "ix_payment_provider_events__received_id__unmatched" ON "payment_provider_events" USING btree ("received_at","id") WHERE "payment_provider_events"."payment_attempt_id" is null;