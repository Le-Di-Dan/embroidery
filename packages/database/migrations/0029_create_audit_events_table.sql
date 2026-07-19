CREATE TABLE "audit_events" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_kind" text NOT NULL,
	"admin_id" uuid,
	"customer_id" uuid,
	"grant_id" uuid,
	"system_job_key" text,
	"action" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"summary" jsonb,
	"failure_code" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_audit_events" PRIMARY KEY("id"),
	CONSTRAINT "ck_audit_events__actor_kind_ref_match" CHECK (("audit_events"."actor_kind" <> 'ADMIN' or "audit_events"."admin_id" is not null)
        and ("audit_events"."actor_kind" <> 'CUSTOMER' or "audit_events"."customer_id" is not null)
        and ("audit_events"."actor_kind" <> 'SYSTEM' or "audit_events"."system_job_key" is not null)
        and ("audit_events"."actor_kind" = 'ADMIN' or "audit_events"."admin_id" is null)
        and ("audit_events"."actor_kind" = 'CUSTOMER' or "audit_events"."customer_id" is null)
        and ("audit_events"."actor_kind" = 'SYSTEM' or "audit_events"."system_job_key" is null))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "fk_audit_events__admin_id" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "fk_audit_events__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "fk_audit_events__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_audit_events__target__occurred__id" ON "audit_events" USING btree ("target_kind","target_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_audit_events__occurred__id" ON "audit_events" USING btree ("occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);