CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coupon_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"parent_id" integer,
	"name" jsonb NOT NULL,
	"image" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"show_on_home" boolean DEFAULT false NOT NULL,
	"erp_code" text,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'percent' NOT NULL,
	"value" integer NOT NULL,
	"min_total_cents" integer DEFAULT 0 NOT NULL,
	"consumer_only" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_trade" boolean DEFAULT false NOT NULL,
	"show_net" boolean DEFAULT false NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"erp_code" text,
	CONSTRAINT "customer_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "erp_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ref_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"variant_id" integer,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_net" integer NOT NULL,
	"unit_gross" integer NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"line_gross" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"token" text NOT NULL,
	"kind" text DEFAULT 'order' NOT NULL,
	"user_id" integer,
	"group_id" integer,
	"is_trade" boolean DEFAULT false NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"payment_method" text NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_ref" text,
	"shipping_method" text NOT NULL,
	"currency" text DEFAULT 'CHF' NOT NULL,
	"subtotal_net" integer DEFAULT 0 NOT NULL,
	"subtotal_gross" integer DEFAULT 0 NOT NULL,
	"shipping_gross" integer DEFAULT 0 NOT NULL,
	"discount_gross" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total_gross" integer DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"billing" jsonb NOT NULL,
	"shipping" jsonb,
	"notes" text,
	"po_number" text,
	"delivery_date" text,
	"locale" text DEFAULT 'de' NOT NULL,
	"erp_id" text,
	"erp_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"show_in_footer" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"min_qty" integer DEFAULT 1 NOT NULL,
	"net_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producers" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"region" text,
	"description" jsonb,
	"logo" text,
	"website" text,
	"featured" boolean DEFAULT false NOT NULL,
	"erp_id" text,
	CONSTRAINT "producers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'wine' NOT NULL,
	"name" jsonb NOT NULL,
	"short" jsonb,
	"description" jsonb,
	"pairing" jsonb,
	"category_id" integer,
	"producer_id" integer,
	"color" text,
	"country" text,
	"region" text,
	"appellation" text,
	"grapes" text,
	"alcohol" numeric(4, 1),
	"organic" boolean DEFAULT false NOT NULL,
	"tax_class" text DEFAULT 'standard' NOT NULL,
	"age_restricted" boolean DEFAULT true NOT NULL,
	"trade_only" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"promo" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"items" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"company" text,
	"uid_number" text,
	"phone" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"group_id" integer,
	"trade_status" text,
	"locale" text DEFAULT 'de' NOT NULL,
	"billing" jsonb,
	"erp_id" text,
	"reset_token" text,
	"reset_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"sku" text NOT NULL,
	"erp_id" text,
	"vintage" text,
	"size" text,
	"volume_ml" integer,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_producer_id_producers_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "erp_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prices_lookup_idx" ON "prices" USING btree ("variant_id","group_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_producer_idx" ON "products" USING btree ("producer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");