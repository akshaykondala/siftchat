CREATE TABLE "booking_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"flight_booked" boolean DEFAULT false,
	"lodging_status" text DEFAULT 'pending',
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true,
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "flight_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"participant_name" text NOT NULL,
	"origin" text NOT NULL,
	"airline" text,
	"price" real,
	"departure_at" text,
	"url" text,
	"selected" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"share_link_slug" text NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "groups_share_link_slug_unique" UNIQUE("share_link_slug")
);
--> statement-breakpoint
CREATE TABLE "itinerary_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"day_index" integer NOT NULL,
	"block_index" integer NOT NULL,
	"suggestion" text NOT NULL,
	"proposed_by" text NOT NULL,
	"votes" integer DEFAULT 0,
	"applied" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"user_id" integer,
	"role" text DEFAULT 'editor' NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pinboard_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"title" text NOT NULL,
	"emoji" text DEFAULT '📌' NOT NULL,
	"category" text DEFAULT 'activity' NOT NULL,
	"added_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pip_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plan_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"alternative_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"summary" text DEFAULT '',
	"last_updated_at" timestamp DEFAULT now(),
	CONSTRAINT "plans_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "support_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"alternative_id" integer,
	"commitment_level" text NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_alternatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"destination" text,
	"date_range" text,
	"budget_band" text,
	"lodging_preference" text,
	"ai_summary" text,
	"support_score" real DEFAULT 0,
	"vote_count" integer DEFAULT 0,
	"likely_attendee_names" text[],
	"committed_attendee_names" text[],
	"evidence_summary" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"destination" text,
	"start_date" text,
	"end_date" text,
	"budget_band" text,
	"lodging_preference" text,
	"flights_booked" boolean DEFAULT false,
	"flight_search_url" text,
	"kayak_url" text,
	"origin_city" text,
	"last_flight_reco_key" text,
	"lodging_booked" boolean DEFAULT false,
	"airbnb_url" text,
	"hotels_url" text,
	"last_lodging_reco_key" text,
	"finalized_flight_url" text,
	"flight_details" text,
	"finalized_lodging_url" text,
	"lodging_type" text,
	"confidence_score" integer DEFAULT 0,
	"status" text DEFAULT 'Early ideas',
	"likely_attendee_names" text[],
	"committed_attendee_names" text[],
	"unresolved_questions" text[],
	"winning_alternative_id" integer,
	"last_guided_phase" text,
	"last_nudge_at" timestamp,
	"last_nudge_step" integer,
	"flight_deadline" text,
	"lodging_deadline" text,
	"itinerary_prefs" text,
	"itinerary" text,
	"events" text,
	"events_scan_key" text,
	"events_scanned_at" timestamp,
	"itinerary_autonomy" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "trip_plans_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "user_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_user_availability" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"google_id" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE INDEX "idx_device_tokens_user_id" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_flight_options_group_id" ON "flight_options" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_itinerary_suggestions_group_id" ON "itinerary_suggestions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_user_availability_user_id" ON "user_availability" USING btree ("user_id");