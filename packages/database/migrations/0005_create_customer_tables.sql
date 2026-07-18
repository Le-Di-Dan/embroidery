CREATE TABLE "customers" (
	"id" uuid NOT NULL,
	"display_name" text,
	"verified_at" timestamp with time zone NOT NULL,
	"merged_into_customer_id" uuid,
	"anonymized_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_customers" PRIMARY KEY("id"),
	CONSTRAINT "ck_customers__no_self_merge" CHECK ("customers"."merged_into_customer_id" <> "customers"."id")
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"tax_code" text,
	"billing_contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_business_profiles" PRIMARY KEY("id"),
	CONSTRAINT "uq_business_profiles__customer" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "customer_contact_points" (
	"id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_kind" text NOT NULL,
	"normalized_value" text NOT NULL,
	"display_value" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_source" text,
	"deactivated_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_customer_contact_points" PRIMARY KEY("id"),
	CONSTRAINT "ck_customer_contact_points__contact_kind_allowed" CHECK ("customer_contact_points"."contact_kind" in ('EMAIL', 'PHONE'))
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "fk_customers__merged_into_customer_id" FOREIGN KEY ("merged_into_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "fk_business_profiles__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contact_points" ADD CONSTRAINT "fk_customer_contact_points__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customer_contact_points__kind_value__verified" ON "customer_contact_points" USING btree ("contact_kind","normalized_value") WHERE "customer_contact_points"."verified_at" is not null and "customer_contact_points"."deactivated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customer_contact_points__customer__primary" ON "customer_contact_points" USING btree ("customer_id") WHERE "customer_contact_points"."is_primary";--> statement-breakpoint
CREATE INDEX "ix_customer_contact_points__customer" ON "customer_contact_points" USING btree ("customer_id");