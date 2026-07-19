CREATE TABLE "quotations" (
	"id" uuid NOT NULL,
	"code" text NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_quotations" PRIMARY KEY("id"),
	CONSTRAINT "uq_quotations__code" UNIQUE("code"),
	CONSTRAINT "uq_quotations__request" UNIQUE("custom_request_id"),
	CONSTRAINT "ck_quotations__status_allowed" CHECK ("quotations"."status" in ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
	"id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_version_id" uuid,
	"status" text NOT NULL,
	"stitch_count" integer,
	"color_count" integer,
	"physical_width_mm" numeric,
	"physical_height_mm" numeric,
	"quantity_total" integer NOT NULL,
	"product_name" text,
	"variant_label" text,
	"subtotal_amount" numeric(14, 2) NOT NULL,
	"manual_adjustment_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"adjustment_reason" text,
	"shipping_fee_amount" numeric(14, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"deposit_percent" numeric(5, 2) NOT NULL,
	"deposit_amount" numeric(14, 2) NOT NULL,
	"remaining_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_quotation_versions" PRIMARY KEY("id"),
	CONSTRAINT "uq_quotation_versions__quotation_version" UNIQUE("quotation_id","version"),
	CONSTRAINT "ck_quotation_versions__status_allowed" CHECK ("quotation_versions"."status" in ('DRAFT', 'SENT', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED', 'REJECTED', 'VOID')),
	CONSTRAINT "ck_quotation_versions__stitch_count_non_negative" CHECK ("quotation_versions"."stitch_count" >= 0),
	CONSTRAINT "ck_quotation_versions__color_count_non_negative" CHECK ("quotation_versions"."color_count" >= 0),
	CONSTRAINT "ck_quotation_versions__physical_mm_positive" CHECK (("quotation_versions"."physical_width_mm" is null or "quotation_versions"."physical_width_mm" > 0) and ("quotation_versions"."physical_height_mm" is null or "quotation_versions"."physical_height_mm" > 0)),
	CONSTRAINT "ck_quotation_versions__quantity_positive" CHECK ("quotation_versions"."quantity_total" > 0),
	CONSTRAINT "ck_quotation_versions__subtotal_non_negative" CHECK ("quotation_versions"."subtotal_amount" >= 0),
	CONSTRAINT "ck_quotation_versions__shipping_fee_non_negative" CHECK ("quotation_versions"."shipping_fee_amount" >= 0),
	CONSTRAINT "ck_quotation_versions__total_non_negative" CHECK ("quotation_versions"."total_amount" >= 0),
	CONSTRAINT "ck_quotation_versions__total_arithmetic" CHECK ("quotation_versions"."total_amount" = "quotation_versions"."subtotal_amount" + "quotation_versions"."manual_adjustment_amount" + "quotation_versions"."shipping_fee_amount"),
	CONSTRAINT "ck_quotation_versions__deposit_non_negative" CHECK ("quotation_versions"."deposit_amount" >= 0),
	CONSTRAINT "ck_quotation_versions__remaining_non_negative" CHECK ("quotation_versions"."remaining_amount" >= 0),
	CONSTRAINT "ck_quotation_versions__deposit_remaining_arithmetic" CHECK ("quotation_versions"."deposit_amount" + "quotation_versions"."remaining_amount" = "quotation_versions"."total_amount"),
	CONSTRAINT "ck_quotation_versions__deposit_percent_range" CHECK ("quotation_versions"."deposit_percent" >= 0 and "quotation_versions"."deposit_percent" <= 100),
	CONSTRAINT "ck_quotation_versions__adjustment_reason_required" CHECK ("quotation_versions"."manual_adjustment_amount" = 0 or "quotation_versions"."adjustment_reason" is not null),
	CONSTRAINT "ck_quotation_versions__currency_vnd" CHECK ("quotation_versions"."currency_code" = 'VND'),
	CONSTRAINT "ck_quotation_versions__validity_window" CHECK ("quotation_versions"."valid_from" is null or "quotation_versions"."valid_until" is null or "quotation_versions"."valid_from" < "quotation_versions"."valid_until"),
	CONSTRAINT "ck_quotation_versions__void_reason_required" CHECK ("quotation_versions"."status" <> 'VOID' or "quotation_versions"."void_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "quotation_line_items" (
	"id" uuid NOT NULL,
	"quotation_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"line_kind" text NOT NULL,
	"description" text NOT NULL,
	"sku_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_amount" numeric(14, 2) NOT NULL,
	"line_total_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_quotation_line_items" PRIMARY KEY("id"),
	CONSTRAINT "uq_quotation_line_items__qversion_position" UNIQUE("quotation_version_id","position"),
	CONSTRAINT "ck_quotation_line_items__line_kind_allowed" CHECK ("quotation_line_items"."line_kind" in ('PRODUCT', 'EMBROIDERY', 'DIGITIZING_FEE', 'SHIPPING', 'ADJUSTMENT', 'OTHER')),
	CONSTRAINT "ck_quotation_line_items__quantity_positive" CHECK ("quotation_line_items"."quantity" > 0),
	CONSTRAINT "ck_quotation_line_items__unit_price_non_negative" CHECK ("quotation_line_items"."unit_price_amount" >= 0),
	CONSTRAINT "ck_quotation_line_items__line_total_non_negative" CHECK ("quotation_line_items"."line_total_amount" >= 0),
	CONSTRAINT "ck_quotation_line_items__currency_vnd" CHECK ("quotation_line_items"."currency_code" = 'VND')
);
--> statement-breakpoint
CREATE TABLE "quotation_acceptances" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "quotation_acceptances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"quotation_version_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"step_up_challenge_id" uuid NOT NULL,
	"accepted_total_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_quotation_acceptances" PRIMARY KEY("id"),
	CONSTRAINT "uq_quotation_acceptances__qversion" UNIQUE("quotation_version_id"),
	CONSTRAINT "ck_quotation_acceptances__amount_non_negative" CHECK ("quotation_acceptances"."accepted_total_amount" >= 0),
	CONSTRAINT "ck_quotation_acceptances__currency_vnd" CHECK ("quotation_acceptances"."currency_code" = 'VND')
);
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "fk_quotations__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "fk_quotation_versions__quotation_id" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "fk_quotation_versions__parent_version_id" FOREIGN KEY ("parent_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "fk_quotation_line_items__quotation_version_id" FOREIGN KEY ("quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "fk_quotation_line_items__sku_id" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_acceptances" ADD CONSTRAINT "fk_quotation_acceptances__quotation_version_id" FOREIGN KEY ("quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_acceptances" ADD CONSTRAINT "fk_quotation_acceptances__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_acceptances" ADD CONSTRAINT "fk_quotation_acceptances__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_acceptances" ADD CONSTRAINT "fk_quotation_acceptances__step_up_challenge_id" FOREIGN KEY ("step_up_challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_quotation_versions__valid_until_id__sent" ON "quotation_versions" USING btree ("valid_until","id") WHERE "quotation_versions"."status" = 'SENT';