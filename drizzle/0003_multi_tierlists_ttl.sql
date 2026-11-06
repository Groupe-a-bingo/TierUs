-- Several tier lists at once, archived by TTL, no more reveal, counter instead of streak.
-- Existing data: every existing round becomes a "daily" one expiring 24h after its start;
-- late flags are recomputed against that expiry. The reveal columns and the streak are
-- dropped: results now depend only on having voted, the counter is derived from submissions.
CREATE TYPE "public"."round_kind" AS ENUM('daily', 'extra');--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "kind" "round_kind" DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "rounds" SET "expires_at" = "starts_at" + interval '24 hours';--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
UPDATE "submissions" s SET "is_late" = (s."submitted_at" >= r."expires_at") FROM "rounds" r WHERE r."id" = s."round_id";--> statement-breakpoint
DROP INDEX IF EXISTS "rounds_date_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "rounds_open_idx";--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "revealed_at";--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "reveal_reason";--> statement-breakpoint
DROP TYPE "public"."reveal_reason";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "streak";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "last_played_round_date";--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_daily_date_uq" ON "rounds" USING btree ("date") WHERE "rounds"."kind" = 'daily';--> statement-breakpoint
CREATE INDEX "rounds_expires_idx" ON "rounds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "submissions_voter_idx" ON "submissions" USING btree ("voter_id");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_ttl_positive" CHECK ("rounds"."expires_at" > "rounds"."starts_at");
