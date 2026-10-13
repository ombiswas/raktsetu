CREATE TABLE IF NOT EXISTS "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "login_attempts_identifier_unique_idx" ON "login_attempts" USING btree ("identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_locked_until_idx" ON "login_attempts" USING btree ("locked_until");
