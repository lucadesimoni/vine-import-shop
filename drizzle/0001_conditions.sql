CREATE TABLE "conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'platform' NOT NULL,
	"erp_id" text,
	"type" text NOT NULL,
	"customer_id" integer,
	"group_id" integer,
	"target_type" text DEFAULT 'all' NOT NULL,
	"target" text,
	"calc" text DEFAULT 'percent' NOT NULL,
	"value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_qty" integer DEFAULT 0 NOT NULL,
	"min_amount_cents" integer DEFAULT 0 NOT NULL,
	"buy_qty" integer DEFAULT 0 NOT NULL,
	"pay_qty" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"on_net_prices" boolean DEFAULT false NOT NULL,
	"label" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "discount_group" text;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conditions_customer_idx" ON "conditions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conditions_group_idx" ON "conditions" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conditions_erp_idx" ON "conditions" USING btree ("source","erp_id");