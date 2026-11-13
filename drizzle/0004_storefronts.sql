CREATE TABLE "storefronts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"hosts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"catalog" jsonb DEFAULT '{"kinds":[],"categoryIds":[],"producerIds":[],"includeIds":[],"excludeIds":[]}'::jsonb NOT NULL,
	"guest_group_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefronts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_slug_unique";--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "storefront_id" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "storefront_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "storefront_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_sf_idx" ON "pages" USING btree ("slug",coalesce("storefront_id", 0));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"),coalesce("storefront_id", 0));