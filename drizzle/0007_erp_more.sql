ALTER TABLE "users" ADD COLUMN "erp_info" jsonb;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "weight_g" integer;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "condition_id" integer;