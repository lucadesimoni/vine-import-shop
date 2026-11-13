ALTER TABLE "users" ADD COLUMN "login_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_expires" timestamp with time zone;