CREATE EXTENSION IF NOT EXISTS "postgis";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint
CREATE TYPE "public"."blood_component" AS ENUM('whole_blood', 'rbc', 'plasma', 'platelets');
--> statement-breakpoint
CREATE TYPE "public"."blood_group" AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
--> statement-breakpoint
CREATE TYPE "public"."candidate_response" AS ENUM('pending', 'accepted', 'declined', 'no_response');
--> statement-breakpoint
CREATE TYPE "public"."donor_sex" AS ENUM('male', 'female', 'other');
--> statement-breakpoint
CREATE TYPE "public"."match_algorithm" AS ENUM('baseline', 'hybrid');
--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'matching', 'fulfilled', 'expired', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."request_urgency" AS ENUM('critical', 'urgent', 'standard');
--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('donor', 'hospital', 'blood_bank', 'admin');
--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'suspended');
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"ip_hash" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_banks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"license_no" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blood_bank_id" uuid NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"component" "blood_component" NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blood_inventory_unique_item" UNIQUE("blood_bank_id","blood_group","component"),
	CONSTRAINT "blood_inventory_units_check" CHECK ("blood_inventory"."units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blood_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"component" "blood_component" NOT NULL,
	"units_required" integer NOT NULL,
	"units_fulfilled" integer DEFAULT 0 NOT NULL,
	"urgency" "request_urgency" NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"needed_by" timestamp with time zone NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blood_requests_units_required_check" CHECK ("blood_requests"."units_required" > 0),
	CONSTRAINT "blood_requests_units_fulfilled_check" CHECK ("blood_requests"."units_fulfilled" >= 0 AND "blood_requests"."units_fulfilled" <= "blood_requests"."units_required")
);
--> statement-breakpoint
CREATE TABLE "demand_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"component" "blood_component" NOT NULL,
	"horizon_start" timestamp with time zone NOT NULL,
	"horizon_end" timestamp with time zone NOT NULL,
	"predicted_units" real NOT NULL,
	"model_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demand_forecasts_predicted_units_check" CHECK ("demand_forecasts"."predicted_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"blood_bank_id" uuid NOT NULL,
	"request_id" uuid,
	"donated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donations_units_check" CHECK ("donations"."units" > 0)
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"date_of_birth" date NOT NULL,
	"weight_kg" real NOT NULL,
	"sex" "donor_sex" NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"location_updated_at" timestamp with time zone,
	"is_available" boolean DEFAULT true NOT NULL,
	"available_from" timestamp with time zone,
	"eligible_after" date,
	"last_donation_date" date,
	"consent_location_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donors_weight_kg_check" CHECK ("donors"."weight_kg" >= 45)
);
--> statement-breakpoint
CREATE TABLE "experiment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"strategy" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"registration_no" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_delta_check" CHECK ("inventory_movements"."delta" != 0)
);
--> statement-breakpoint
CREATE TABLE "match_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"donor_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" real,
	"p_response" real,
	"distance_m" real NOT NULL,
	"travel_seconds" integer,
	"batch_no" integer DEFAULT 1 NOT NULL,
	"notified_at" timestamp with time zone,
	"response" "candidate_response" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_candidates_run_donor_unique" UNIQUE("run_id","donor_id")
);
--> statement-breakpoint
CREATE TABLE "match_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"algorithm" "match_algorithm" NOT NULL,
	"algorithm_version" text NOT NULL,
	"config" jsonb NOT NULL,
	"model_version" text,
	"degraded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" text,
	"user_agent_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blood_banks" ADD CONSTRAINT "blood_banks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blood_inventory" ADD CONSTRAINT "blood_inventory_blood_bank_id_blood_banks_user_id_fk" FOREIGN KEY ("blood_bank_id") REFERENCES "public"."blood_banks"("user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_hospital_id_hospitals_user_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_user_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_blood_bank_id_blood_banks_user_id_fk" FOREIGN KEY ("blood_bank_id") REFERENCES "public"."blood_banks"("user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "experiment_runs" ADD CONSTRAINT "experiment_runs_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_id_blood_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."blood_inventory"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_run_id_match_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."match_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_donor_id_donors_user_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_runs" ADD CONSTRAINT "match_runs_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "blood_banks_license_no_unique_idx" ON "blood_banks" USING btree ("license_no");
--> statement-breakpoint
CREATE INDEX "blood_banks_location_gist_idx" ON "blood_banks" USING gist ("location");
--> statement-breakpoint
CREATE INDEX "blood_inventory_bank_id_idx" ON "blood_inventory" USING btree ("blood_bank_id");
--> statement-breakpoint
CREATE INDEX "blood_requests_hospital_id_idx" ON "blood_requests" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX "blood_requests_status_idx" ON "blood_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "blood_requests_location_gist_idx" ON "blood_requests" USING gist ("location");
--> statement-breakpoint
CREATE INDEX "donations_donor_id_idx" ON "donations" USING btree ("donor_id");
--> statement-breakpoint
CREATE INDEX "donations_blood_bank_id_idx" ON "donations" USING btree ("blood_bank_id");
--> statement-breakpoint
CREATE INDEX "donations_request_id_idx" ON "donations" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "donors_location_gist_idx" ON "donors" USING gist ("location");
--> statement-breakpoint
CREATE INDEX "donors_blood_group_available_idx" ON "donors" USING btree ("blood_group","is_available");
--> statement-breakpoint
CREATE INDEX "experiment_runs_experiment_id_idx" ON "experiment_runs" USING btree ("experiment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hospitals_reg_no_unique_idx" ON "hospitals" USING btree ("registration_no");
--> statement-breakpoint
CREATE INDEX "hospitals_location_gist_idx" ON "hospitals" USING gist ("location");
--> statement-breakpoint
CREATE INDEX "hospitals_verified_by_idx" ON "hospitals" USING btree ("verified_by");
--> statement-breakpoint
CREATE INDEX "inventory_movements_inventory_id_idx" ON "inventory_movements" USING btree ("inventory_id");
--> statement-breakpoint
CREATE INDEX "inventory_movements_request_id_idx" ON "inventory_movements" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "match_candidates_run_id_idx" ON "match_candidates" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "match_candidates_donor_id_idx" ON "match_candidates" USING btree ("donor_id");
--> statement-breakpoint
CREATE INDEX "match_runs_request_id_idx" ON "match_runs" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique_idx" ON "push_subscriptions" USING btree ("endpoint");
--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_unique_idx" ON "refresh_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email");
