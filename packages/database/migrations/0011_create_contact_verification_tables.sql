CREATE TABLE "contact_verification_challenges" (
	"id" uuid NOT NULL,
	"contact_point_id" uuid,
	"contact_kind" text NOT NULL,
	"normalized_value" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_contact_verification_challenges" PRIMARY KEY("id"),
	CONSTRAINT "ck_contact_verification_challenges__status_allowed" CHECK ("contact_verification_challenges"."status" in ('ISSUED', 'VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED')),
	CONSTRAINT "ck_contact_verification_challenges__purpose_allowed" CHECK ("contact_verification_challenges"."purpose" in ('SUBMISSION', 'STEP_UP')),
	CONSTRAINT "ck_contact_verification_challenges__contact_kind_allowed" CHECK ("contact_verification_challenges"."contact_kind" in ('EMAIL', 'PHONE'))
);
--> statement-breakpoint
CREATE TABLE "contact_verification_attempts" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "contact_verification_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"challenge_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_contact_verification_attempts" PRIMARY KEY("id"),
	CONSTRAINT "ck_contact_verification_attempts__outcome_allowed" CHECK ("contact_verification_attempts"."outcome" in ('MATCH', 'MISMATCH', 'EXPIRED_AT_ENTRY'))
);
--> statement-breakpoint
ALTER TABLE "contact_verification_challenges" ADD CONSTRAINT "fk_contact_verification_challenges__contact_point_id" FOREIGN KEY ("contact_point_id") REFERENCES "public"."customer_contact_points"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_verification_challenges" ADD CONSTRAINT "fk_contact_verification_challenges__session_id" FOREIGN KEY ("session_id") REFERENCES "public"."design_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_verification_attempts" ADD CONSTRAINT "fk_contact_verification_attempts__challenge_id" FOREIGN KEY ("challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_verification_challenges__kind_value_purpose__issued" ON "contact_verification_challenges" USING btree ("contact_kind","normalized_value","purpose") WHERE "contact_verification_challenges"."status" = 'ISSUED';--> statement-breakpoint
CREATE INDEX "ix_verification_challenges__expires_id__issued" ON "contact_verification_challenges" USING btree ("expires_at","id") WHERE "contact_verification_challenges"."status" = 'ISSUED';--> statement-breakpoint
CREATE INDEX "ix_verification_attempts__challenge_attempted" ON "contact_verification_attempts" USING btree ("challenge_id","attempted_at");