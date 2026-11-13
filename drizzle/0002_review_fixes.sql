CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_reply_to_idx" ON "comments" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "placements_target_idx" ON "placements" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "reactions_user_idx" ON "reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "round_targets_user_idx" ON "round_targets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_idea_uq" ON "rounds" USING btree ("idea_id");--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_description_len" CHECK (char_length("ideas"."description") <= 500);