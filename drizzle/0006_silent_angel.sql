ALTER TABLE "tracked_wallets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD COLUMN "verified_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD CONSTRAINT "tracked_wallets_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;