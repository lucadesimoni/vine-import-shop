ALTER TABLE "customer_groups" ADD COLUMN "payment_methods" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_methods" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "erp_payment_condition_id" integer;