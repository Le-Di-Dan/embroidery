CREATE TABLE "notification_intents" (
	"id" uuid NOT NULL,
	"intent_key" text NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"channel" text NOT NULL,
	"recipient_contact_point_id" uuid,
	"recipient_masked" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text NOT NULL,
	"source_outbox_event_id" bigint,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_notification_intents" PRIMARY KEY("id"),
	CONSTRAINT "uq_notification_intents__intent_key" UNIQUE("intent_key"),
	CONSTRAINT "ck_notification_intents__status_allowed" CHECK ("notification_intents"."status" in ('PENDING', 'PROCESSING', 'SATISFIED', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_attempts" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "notification_delivery_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"intent_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"provider_message_ref" text,
	"error_class" text,
	"attempted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_notification_delivery_attempts" PRIMARY KEY("id"),
	CONSTRAINT "ck_notification_delivery_attempts__outcome_allowed" CHECK ("notification_delivery_attempts"."outcome" in ('DELIVERED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'))
);
--> statement-breakpoint
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "fk_notification_delivery_attempts__intent_id" FOREIGN KEY ("intent_id") REFERENCES "public"."notification_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_notification_intents__created_id__claimable" ON "notification_intents" USING btree ("created_at","id") WHERE "notification_intents"."status" in ('PENDING', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "ix_notification_delivery_attempts__intent_id__attempted_at" ON "notification_delivery_attempts" USING btree ("intent_id","attempted_at");