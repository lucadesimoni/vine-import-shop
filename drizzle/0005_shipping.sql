ALTER TABLE "orders" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "notified" jsonb DEFAULT '[]'::jsonb NOT NULL;