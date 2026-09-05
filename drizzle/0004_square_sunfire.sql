ALTER TABLE "prop_firms" DROP CONSTRAINT "prop_firms_slug_ck";--> statement-breakpoint
ALTER TABLE "prop_firms" ALTER COLUMN "slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prop_firms" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_slug_ck" CHECK ("prop_firms"."slug" is null or "prop_firms"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');