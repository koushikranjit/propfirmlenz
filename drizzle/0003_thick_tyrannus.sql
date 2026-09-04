CREATE TABLE "firm_announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"announced_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "firm_announcements_title_ck" CHECK (length("firm_announcements"."title") between 1 and 200),
	CONSTRAINT "firm_announcements_link_ck" CHECK ("firm_announcements"."link_url" is null or "firm_announcements"."link_url" like 'https://%')
);
--> statement-breakpoint
CREATE TABLE "firm_faqs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "firm_faqs_question_ck" CHECK (length("firm_faqs"."question") between 1 and 300),
	CONSTRAINT "firm_faqs_answer_ck" CHECK (length("firm_faqs"."answer") between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "prop_firms" ADD COLUMN "founded_on" date;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD COLUMN "founder_name" text;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD COLUMN "ceo_name" text;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD COLUMN "trustpilot_rating" numeric(2, 1);--> statement-breakpoint
ALTER TABLE "prop_firms" ADD COLUMN "trustpilot_url" text;--> statement-breakpoint
ALTER TABLE "firm_announcements" ADD CONSTRAINT "firm_announcements_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_faqs" ADD CONSTRAINT "firm_faqs_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "firm_announcements_firm_idx" ON "firm_announcements" USING btree ("prop_firm_id","announced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "firm_announcements_live_idx" ON "firm_announcements" USING btree ("prop_firm_id","announced_at" DESC NULLS LAST) WHERE "firm_announcements"."is_active" and "firm_announcements"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "firm_faqs_firm_idx" ON "firm_faqs" USING btree ("prop_firm_id","display_order");--> statement-breakpoint
CREATE INDEX "firm_faqs_live_idx" ON "firm_faqs" USING btree ("prop_firm_id","display_order") WHERE "firm_faqs"."is_active" and "firm_faqs"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_founded_on_ck" CHECK ("prop_firms"."founded_on" is null or ("prop_firms"."founded_on" >= '1900-01-01' and "prop_firms"."founded_on" <= (now() + interval '1 day')::date));--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_trustpilot_ck" CHECK ("prop_firms"."trustpilot_rating" is null or ("prop_firms"."trustpilot_rating" between 0 and 5));--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_trustpilot_url_ck" CHECK ("prop_firms"."trustpilot_url" is null or "prop_firms"."trustpilot_url" like 'https://%');