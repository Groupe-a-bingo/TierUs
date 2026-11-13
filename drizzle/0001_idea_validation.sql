CREATE TYPE "public"."idea_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ideas_available_idx";--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "status" "idea_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
CREATE INDEX "ideas_available_idx" ON "ideas" USING btree ("status","used_at");