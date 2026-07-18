CREATE TABLE "sku_stocks" (
	"id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"quantity_on_hand" integer NOT NULL,
	"low_stock_threshold" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_sku_stocks" PRIMARY KEY("id"),
	CONSTRAINT "uq_sku_stocks__sku" UNIQUE("sku_id"),
	CONSTRAINT "ck_sku_stocks__quantity_non_negative" CHECK ("sku_stocks"."quantity_on_hand" >= 0),
	CONSTRAINT "ck_sku_stocks__threshold_non_negative" CHECK ("sku_stocks"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_ledger_entries" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "inventory_ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sku_stock_id" uuid NOT NULL,
	"entry_kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"on_hand_delta" integer NOT NULL,
	"soft_hold_id" uuid,
	"reservation_id" uuid,
	"order_id" uuid,
	"reason" text,
	"actor_kind" text NOT NULL,
	"admin_id" uuid,
	"system_job_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_inventory_ledger_entries" PRIMARY KEY("id"),
	CONSTRAINT "ck_inventory_ledger_entries__entry_kind_allowed" CHECK ("inventory_ledger_entries"."entry_kind" in ('ADJUSTMENT', 'HOLD_PLACED', 'HOLD_RELEASED', 'HOLD_EXPIRED', 'HOLD_CONVERTED', 'RESERVED', 'RESERVATION_RELEASED', 'RESERVATION_EXPIRED', 'CONSUMED')),
	CONSTRAINT "ck_inventory_ledger_entries__quantity_positive" CHECK ("inventory_ledger_entries"."quantity" > 0),
	CONSTRAINT "ck_inventory_ledger_entries__adjustment_has_reason" CHECK ("inventory_ledger_entries"."entry_kind" <> 'ADJUSTMENT' or "inventory_ledger_entries"."reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "sku_stocks" ADD CONSTRAINT "fk_sku_stocks__sku_id" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "fk_inventory_ledger_entries__sku_stock_id" FOREIGN KEY ("sku_stock_id") REFERENCES "public"."sku_stocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_inventory_ledger_entries__stock_id" ON "inventory_ledger_entries" USING btree ("sku_stock_id","id");