CREATE TABLE "admin_accounts" (
	"id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"locked_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"replaced_by_admin_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_admin_accounts" PRIMARY KEY("id"),
	CONSTRAINT "uq_admin_accounts__email" UNIQUE("email"),
	CONSTRAINT "ck_admin_accounts__status" CHECK ("admin_accounts"."status" in ('ACTIVE', 'LOCKED', 'DISABLED'))
);
--> statement-breakpoint
CREATE TABLE "admin_credentials" (
	"id" uuid NOT NULL,
	"admin_account_id" uuid NOT NULL,
	"credential_kind" text NOT NULL,
	"credential_reference" text NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_admin_credentials" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid NOT NULL,
	"admin_account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"client_metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_admin_sessions" PRIMARY KEY("id"),
	CONSTRAINT "uq_admin_sessions__token_hash" UNIQUE("token_hash"),
	CONSTRAINT "ck_admin_sessions__status" CHECK ("admin_sessions"."status" in ('ACTIVE', 'EXPIRED', 'REVOKED'))
);
--> statement-breakpoint
ALTER TABLE "admin_credentials" ADD CONSTRAINT "fk_admin_credentials__admin_account_id" FOREIGN KEY ("admin_account_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "fk_admin_sessions__admin_account_id" FOREIGN KEY ("admin_account_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_admin_accounts__status__active" ON "admin_accounts" USING btree ("status") WHERE "admin_accounts"."status" = 'ACTIVE';