CREATE TABLE "orders" (
	"id" uuid NOT NULL,
	"code" text NOT NULL,
	"custom_request_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"accepted_quotation_version_id" uuid NOT NULL,
	"current_approval_snapshot_id" uuid NOT NULL,
	"status" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"hold_reason" text,
	"cancelled_reason" text,
	"cancelled_customer_reason" text,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_orders" PRIMARY KEY("id"),
	CONSTRAINT "uq_orders__request" UNIQUE("custom_request_id"),
	CONSTRAINT "uq_orders__code" UNIQUE("code"),
	CONSTRAINT "ck_orders__status_allowed" CHECK ("orders"."status" in ('AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED', 'AWAITING_FINAL_PAYMENT', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLING', 'CANCELLED')),
	CONSTRAINT "ck_orders__total_non_negative" CHECK ("orders"."total_amount" >= 0),
	CONSTRAINT "ck_orders__currency_vnd" CHECK ("orders"."currency_code" = 'VND'),
	CONSTRAINT "ck_orders__hold_reason_required" CHECK ("orders"."status" <> 'ON_HOLD' or "orders"."hold_reason" is not null),
	CONSTRAINT "ck_orders__cancelled_reason_required" CHECK ("orders"."status" <> 'CANCELLED' or "orders"."cancelled_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"sku_id" uuid,
	"customer_owned_product_id" uuid,
	"product_name" text NOT NULL,
	"variant_label" text,
	"size_label" text,
	"quantity" integer NOT NULL,
	"unit_price_amount" numeric(14, 2) NOT NULL,
	"line_total_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"approval_snapshot_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_order_items" PRIMARY KEY("id"),
	CONSTRAINT "uq_order_items__order_position" UNIQUE("order_id","position"),
	CONSTRAINT "ck_order_items__exactly_one_subject" CHECK (("order_items"."sku_id" is not null and "order_items"."customer_owned_product_id" is null) or ("order_items"."sku_id" is null and "order_items"."customer_owned_product_id" is not null)),
	CONSTRAINT "ck_order_items__quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "ck_order_items__unit_price_non_negative" CHECK ("order_items"."unit_price_amount" >= 0),
	CONSTRAINT "ck_order_items__line_total_non_negative" CHECK ("order_items"."line_total_amount" >= 0),
	CONSTRAINT "ck_order_items__currency_vnd" CHECK ("order_items"."currency_code" = 'VND')
);
--> statement-breakpoint
CREATE TABLE "order_transitions" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "order_transitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"event_kind" text NOT NULL,
	"saga_step" text,
	"actor_kind" text NOT NULL,
	"admin_id" uuid,
	"customer_id" uuid,
	"grant_id" uuid,
	"system_job_key" text,
	"reason" text,
	"customer_visible_reason" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_order_transitions" PRIMARY KEY("id"),
	CONSTRAINT "ck_order_transitions__from_status_allowed" CHECK ("order_transitions"."from_status" in ('AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED', 'AWAITING_FINAL_PAYMENT', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLING', 'CANCELLED')),
	CONSTRAINT "ck_order_transitions__to_status_allowed" CHECK ("order_transitions"."to_status" in ('AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED', 'AWAITING_FINAL_PAYMENT', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLING', 'CANCELLED')),
	CONSTRAINT "ck_order_transitions__event_kind_allowed" CHECK ("order_transitions"."event_kind" in ('STATE_CHANGE', 'DELIVERY_EVENT', 'SAGA_STEP', 'SHIPPING_FREEZE', 'POINTER_MOVE', 'POST_FREEZE_CORRECTION'))
);
--> statement-breakpoint
CREATE TABLE "order_cancellation_requests" (
	"id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"initiator" text NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"customer_visible_reason" text,
	"grant_id" uuid,
	"step_up_challenge_id" uuid,
	"decided_by_admin_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_order_cancellation_requests" PRIMARY KEY("id"),
	CONSTRAINT "ck_order_cancellation_requests__stage_allowed" CHECK ("order_cancellation_requests"."stage" in ('S4', 'S5', 'S6', 'S7', 'S8')),
	CONSTRAINT "ck_order_cancellation_requests__initiator_allowed" CHECK ("order_cancellation_requests"."initiator" in ('CUSTOMER', 'ADMIN')),
	CONSTRAINT "ck_order_cancellation_requests__status_allowed" CHECK ("order_cancellation_requests"."status" in ('PENDING', 'APPROVED', 'DENIED'))
);
--> statement-breakpoint
CREATE TABLE "shipping_details" (
	"id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"address_line" text NOT NULL,
	"ward" text,
	"district" text,
	"province" text NOT NULL,
	"country_code" text DEFAULT 'VN' NOT NULL,
	"fee_amount" numeric(14, 2),
	"currency_code" text NOT NULL,
	"carrier_name" text,
	"tracking_code" text,
	"fulfillment_note" text,
	"status" text NOT NULL,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_shipping_details" PRIMARY KEY("id"),
	CONSTRAINT "uq_shipping_details__order" UNIQUE("order_id"),
	CONSTRAINT "ck_shipping_details__status_allowed" CHECK ("shipping_details"."status" in ('EDITABLE', 'FROZEN')),
	CONSTRAINT "ck_shipping_details__fee_non_negative" CHECK ("shipping_details"."fee_amount" is null or "shipping_details"."fee_amount" >= 0),
	CONSTRAINT "ck_shipping_details__currency_vnd" CHECK ("shipping_details"."currency_code" = 'VND'),
	CONSTRAINT "ck_shipping_details__frozen_at_required" CHECK ("shipping_details"."status" <> 'FROZEN' or "shipping_details"."frozen_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "shipping_snapshots" (
	"id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shipping_detail_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"address_line" text NOT NULL,
	"ward" text,
	"district" text,
	"province" text NOT NULL,
	"country_code" text NOT NULL,
	"fee_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"carrier_name" text,
	"tracking_code" text,
	"dispatched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_shipping_snapshots" PRIMARY KEY("id"),
	CONSTRAINT "uq_shipping_snapshots__order" UNIQUE("order_id"),
	CONSTRAINT "ck_shipping_snapshots__fee_non_negative" CHECK ("shipping_snapshots"."fee_amount" >= 0),
	CONSTRAINT "ck_shipping_snapshots__currency_vnd" CHECK ("shipping_snapshots"."currency_code" = 'VND')
);
--> statement-breakpoint
CREATE TABLE "shipping_fee_acknowledgements" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "shipping_fee_acknowledgements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"previous_fee_amount" numeric(14, 2) NOT NULL,
	"new_fee_amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"grant_id" uuid NOT NULL,
	"step_up_challenge_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_shipping_fee_acknowledgements" PRIMARY KEY("id"),
	CONSTRAINT "ck_shipping_fee_acknowledgements__previous_fee_non_negative" CHECK ("shipping_fee_acknowledgements"."previous_fee_amount" >= 0),
	CONSTRAINT "ck_shipping_fee_acknowledgements__new_fee_non_negative" CHECK ("shipping_fee_acknowledgements"."new_fee_amount" >= 0),
	CONSTRAINT "ck_shipping_fee_acknowledgements__currency_vnd" CHECK ("shipping_fee_acknowledgements"."currency_code" = 'VND')
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid NOT NULL,
	"sku_stock_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"released_reason" text,
	"terminalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_inventory_reservations" PRIMARY KEY("id"),
	CONSTRAINT "ck_inventory_reservations__status_allowed" CHECK ("inventory_reservations"."status" in ('RESERVED', 'CONSUMED', 'RELEASED', 'EXPIRED')),
	CONSTRAINT "ck_inventory_reservations__quantity_positive" CHECK ("inventory_reservations"."quantity" > 0),
	CONSTRAINT "ck_inventory_reservations__released_reason_required" CHECK ("inventory_reservations"."status" <> 'RELEASED' or "inventory_reservations"."released_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders__custom_request_id" FOREIGN KEY ("custom_request_id") REFERENCES "public"."custom_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders__accepted_quotation_version_id" FOREIGN KEY ("accepted_quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders__current_approval_snapshot_id" FOREIGN KEY ("current_approval_snapshot_id") REFERENCES "public"."approval_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items__sku_id" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items__customer_owned_product_id" FOREIGN KEY ("customer_owned_product_id") REFERENCES "public"."customer_owned_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items__approval_snapshot_id" FOREIGN KEY ("approval_snapshot_id") REFERENCES "public"."approval_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_transitions" ADD CONSTRAINT "fk_order_transitions__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_transitions" ADD CONSTRAINT "fk_order_transitions__admin_id" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_transitions" ADD CONSTRAINT "fk_order_transitions__customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_transitions" ADD CONSTRAINT "fk_order_transitions__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "fk_order_cancellation_requests__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "fk_order_cancellation_requests__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "fk_order_cancellation_requests__step_up_challenge_id" FOREIGN KEY ("step_up_challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_details" ADD CONSTRAINT "fk_shipping_details__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_snapshots" ADD CONSTRAINT "fk_shipping_snapshots__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_snapshots" ADD CONSTRAINT "fk_shipping_snapshots__shipping_detail_id" FOREIGN KEY ("shipping_detail_id") REFERENCES "public"."shipping_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_fee_acknowledgements" ADD CONSTRAINT "fk_shipping_fee_acknowledgements__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_fee_acknowledgements" ADD CONSTRAINT "fk_shipping_fee_acknowledgements__grant_id" FOREIGN KEY ("grant_id") REFERENCES "public"."secure_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_fee_acknowledgements" ADD CONSTRAINT "fk_shipping_fee_acknowledgements__step_up_challenge_id" FOREIGN KEY ("step_up_challenge_id") REFERENCES "public"."contact_verification_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "fk_inventory_reservations__sku_stock_id" FOREIGN KEY ("sku_stock_id") REFERENCES "public"."sku_stocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "fk_inventory_reservations__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_orders__status_created_id" ON "orders" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_orders__id__cancelling" ON "orders" USING btree ("id") WHERE "orders"."status" = 'CANCELLING';--> statement-breakpoint
CREATE INDEX "ix_order_transitions__order_id" ON "order_transitions" USING btree ("order_id","id");--> statement-breakpoint
CREATE INDEX "ix_order_transitions__order_id__saga_step" ON "order_transitions" USING btree ("order_id","id") WHERE "order_transitions"."event_kind" = 'SAGA_STEP';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_cancellation_requests__order__pending" ON "order_cancellation_requests" USING btree ("order_id") WHERE "order_cancellation_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_reservations__order_stock__reserved" ON "inventory_reservations" USING btree ("order_id","sku_stock_id") WHERE "inventory_reservations"."status" = 'RESERVED';--> statement-breakpoint
CREATE INDEX "ix_inventory_reservations__stock_id__reserved" ON "inventory_reservations" USING btree ("sku_stock_id","id") WHERE "inventory_reservations"."status" = 'RESERVED';--> statement-breakpoint
CREATE INDEX "ix_inventory_reservations__expires_id__reserved" ON "inventory_reservations" USING btree ("expires_at","id") WHERE "inventory_reservations"."status" = 'RESERVED' and "inventory_reservations"."expires_at" is not null;--> statement-breakpoint
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "fk_inventory_ledger_entries__reservation_id" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "fk_inventory_ledger_entries__order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_soft_holds" ADD CONSTRAINT "fk_inventory_soft_holds__converted_reservation_id" FOREIGN KEY ("converted_reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE restrict ON UPDATE no action;