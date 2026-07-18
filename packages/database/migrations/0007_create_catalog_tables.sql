CREATE TABLE "categories" (
	"id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"display_order" integer NOT NULL,
	"status" text NOT NULL,
	"archived_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"is_indexable" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_categories" PRIMARY KEY("id"),
	CONSTRAINT "uq_categories__slug" UNIQUE("slug"),
	CONSTRAINT "ck_categories__status_allowed" CHECK ("categories"."status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"base_price_amount" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"status" text NOT NULL,
	"archived_at" timestamp with time zone,
	"is_display_out_of_stock" boolean NOT NULL,
	"display_order" integer NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"is_indexable" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_products" PRIMARY KEY("id"),
	CONSTRAINT "uq_products__slug" UNIQUE("slug"),
	CONSTRAINT "ck_products__status_allowed" CHECK ("products"."status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
	CONSTRAINT "ck_products__base_price_non_negative" CHECK ("products"."base_price_amount" >= 0),
	CONSTRAINT "ck_products__currency_allowed" CHECK ("products"."currency_code" = 'VND'),
	CONSTRAINT "ck_products__currency_scale" CHECK ("products"."currency_code" not in ('VND') or "products"."base_price_amount" = trunc("products"."base_price_amount"))
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"color_name" text,
	"size_label" text,
	"display_order" integer NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_product_variants" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"price_override_amount" numeric(14, 2),
	"currency_code" char(3) NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_skus" PRIMARY KEY("id"),
	CONSTRAINT "uq_skus__code" UNIQUE("code"),
	CONSTRAINT "ck_skus__price_override_non_negative" CHECK ("skus"."price_override_amount" >= 0),
	CONSTRAINT "ck_skus__currency_allowed" CHECK ("skus"."currency_code" = 'VND'),
	CONSTRAINT "ck_skus__currency_scale" CHECK ("skus"."currency_code" not in ('VND') or "skus"."price_override_amount" = trunc("skus"."price_override_amount"))
);
--> statement-breakpoint
CREATE TABLE "product_sides" (
	"id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"background_asset_id" uuid NOT NULL,
	"image_width_px" integer NOT NULL,
	"image_height_px" integer NOT NULL,
	"physical_width_mm" numeric NOT NULL,
	"physical_height_mm" numeric NOT NULL,
	"px_per_mm" numeric NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_product_sides" PRIMARY KEY("id"),
	CONSTRAINT "ck_product_sides__image_px_positive" CHECK ("product_sides"."image_width_px" > 0 and "product_sides"."image_height_px" > 0),
	CONSTRAINT "ck_product_sides__physical_mm_positive" CHECK ("product_sides"."physical_width_mm" > 0 and "product_sides"."physical_height_mm" > 0),
	CONSTRAINT "ck_product_sides__px_per_mm_positive" CHECK ("product_sides"."px_per_mm" > 0)
);
--> statement-breakpoint
CREATE TABLE "embroidery_areas" (
	"id" uuid NOT NULL,
	"product_side_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bound_x_px" numeric NOT NULL,
	"bound_y_px" numeric NOT NULL,
	"bound_width_px" numeric NOT NULL,
	"bound_height_px" numeric NOT NULL,
	"max_width_mm" numeric,
	"max_height_mm" numeric,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_embroidery_areas" PRIMARY KEY("id"),
	CONSTRAINT "ck_embroidery_areas__bounds_positive" CHECK ("embroidery_areas"."bound_width_px" > 0 and "embroidery_areas"."bound_height_px" > 0),
	CONSTRAINT "ck_embroidery_areas__max_mm_positive" CHECK ("embroidery_areas"."max_width_mm" > 0 and "embroidery_areas"."max_height_mm" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_product_media" PRIMARY KEY("id"),
	CONSTRAINT "uq_product_media__product_asset_role" UNIQUE("product_id","asset_id","role"),
	CONSTRAINT "ck_product_media__role_allowed" CHECK ("product_media"."role" in ('GALLERY', 'THUMBNAIL', 'DETAIL'))
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "fk_products__category_id" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "fk_product_variants__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "fk_skus__product_variant_id" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sides" ADD CONSTRAINT "fk_product_sides__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sides" ADD CONSTRAINT "fk_product_sides__background_asset_id" FOREIGN KEY ("background_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embroidery_areas" ADD CONSTRAINT "fk_embroidery_areas__product_side_id" FOREIGN KEY ("product_side_id") REFERENCES "public"."product_sides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "fk_product_media__product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "fk_product_media__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_products__category_display_id__published" ON "products" USING btree ("category_id","display_order","id") WHERE "products"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "ix_product_variants__product_display" ON "product_variants" USING btree ("product_id","display_order");--> statement-breakpoint
CREATE INDEX "ix_skus__variant" ON "skus" USING btree ("product_variant_id");--> statement-breakpoint
CREATE INDEX "ix_product_sides__product_display" ON "product_sides" USING btree ("product_id","display_order");--> statement-breakpoint
CREATE INDEX "ix_embroidery_areas__side_display" ON "embroidery_areas" USING btree ("product_side_id","display_order");