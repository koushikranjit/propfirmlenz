CREATE TABLE "blockchain_networks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"chain_id" integer,
	"native_symbol" text NOT NULL,
	"explorer_tx_template" text NOT NULL,
	"provider" text NOT NULL,
	"confirmations_required" integer DEFAULT 12 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blockchain_networks_explorer_ck" CHECK ("blockchain_networks"."explorer_tx_template" like '%{hash}%'),
	CONSTRAINT "blockchain_networks_confirmations_ck" CHECK ("blockchain_networks"."confirmations_required" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blockchain_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blockchain_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"network_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"transfer_index" integer DEFAULT 0 NOT NULL,
	"block_number" bigint,
	"block_timestamp" timestamp with time zone NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"asset_symbol" text NOT NULL,
	"asset_contract" text,
	"amount_base_units" numeric(78, 0) NOT NULL,
	"decimals" smallint NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"confirmations" integer,
	"provider" text NOT NULL,
	"raw" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blockchain_transactions_status_ck" CHECK ("blockchain_transactions"."status" in ('success', 'failed', 'pending')),
	CONSTRAINT "blockchain_transactions_amount_ck" CHECK ("blockchain_transactions"."amount_base_units" >= 0),
	CONSTRAINT "blockchain_transactions_decimals_ck" CHECK ("blockchain_transactions"."decimals" between 0 and 36),
	CONSTRAINT "blockchain_transactions_addresses_ck" CHECK ("blockchain_transactions"."from_address" = lower("blockchain_transactions"."from_address") and "blockchain_transactions"."to_address" = lower("blockchain_transactions"."to_address"))
);
--> statement-breakpoint
CREATE TABLE "payout_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" bigint NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"tracked_wallet_id" uuid NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"confidence" smallint,
	"match_reasons" text[],
	"reviewed_by_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_candidates_status_ck" CHECK ("payout_candidates"."status" in ('detected', 'match_review', 'verified', 'rejected', 'unverified')),
	CONSTRAINT "payout_candidates_confidence_ck" CHECK ("payout_candidates"."confidence" is null or ("payout_candidates"."confidence" between 0 and 100)),
	CONSTRAINT "payout_candidates_rejection_ck" CHECK ("payout_candidates"."status" <> 'rejected' or "payout_candidates"."rejection_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "payout_verification_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payout_verification_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"candidate_id" uuid NOT NULL,
	"event" text NOT NULL,
	"actor_admin_id" uuid,
	"from_status" text,
	"to_status" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_verification_events_event_ck" CHECK ("payout_verification_events"."event" in ('detected', 'matched', 'verified', 'rejected', 'corrected'))
);
--> statement-breakpoint
CREATE TABLE "tracked_wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"address" text NOT NULL,
	"address_normalized" text NOT NULL,
	"label" text,
	"purpose" text DEFAULT 'unknown' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"first_seen_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"scan_cursor" text,
	"last_scan_error" text,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_wallets_purpose_ck" CHECK ("tracked_wallets"."purpose" in ('trader_payouts', 'operations', 'treasury', 'other', 'unknown')),
	CONSTRAINT "tracked_wallets_verification_ck" CHECK ("tracked_wallets"."verification_status" in ('unverified', 'verified', 'disputed')),
	CONSTRAINT "tracked_wallets_address_ck" CHECK ("tracked_wallets"."address" ~ '^[A-Za-z0-9:_-]{8,128}$'),
	CONSTRAINT "tracked_wallets_normalized_ck" CHECK ("tracked_wallets"."address_normalized" = lower("tracked_wallets"."address_normalized"))
);
--> statement-breakpoint
CREATE TABLE "verified_payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"transaction_id" bigint NOT NULL,
	"source_wallet_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint,
	"transaction_timestamp" timestamp with time zone NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"asset_symbol" text NOT NULL,
	"asset_contract" text,
	"amount_base_units" numeric(78, 0) NOT NULL,
	"decimals" smallint NOT NULL,
	"usd_value" numeric(20, 2),
	"usd_rate" numeric(24, 10),
	"usd_rate_source" text,
	"usd_rate_at" timestamp with time zone,
	"explorer_url" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verified_payouts_amount_ck" CHECK ("verified_payouts"."amount_base_units" > 0),
	CONSTRAINT "verified_payouts_usd_ck" CHECK ("verified_payouts"."usd_value" is null or ("verified_payouts"."usd_rate" is not null and "verified_payouts"."usd_rate_source" is not null and "verified_payouts"."usd_rate_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_network_id_blockchain_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."blockchain_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_candidates" ADD CONSTRAINT "payout_candidates_transaction_id_blockchain_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."blockchain_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_candidates" ADD CONSTRAINT "payout_candidates_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_candidates" ADD CONSTRAINT "payout_candidates_tracked_wallet_id_tracked_wallets_id_fk" FOREIGN KEY ("tracked_wallet_id") REFERENCES "public"."tracked_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_candidates" ADD CONSTRAINT "payout_candidates_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_verification_events" ADD CONSTRAINT "payout_verification_events_candidate_id_payout_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."payout_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_verification_events" ADD CONSTRAINT "payout_verification_events_actor_admin_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD CONSTRAINT "tracked_wallets_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD CONSTRAINT "tracked_wallets_network_id_blockchain_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."blockchain_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD CONSTRAINT "tracked_wallets_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payouts" ADD CONSTRAINT "verified_payouts_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payouts" ADD CONSTRAINT "verified_payouts_network_id_blockchain_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."blockchain_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payouts" ADD CONSTRAINT "verified_payouts_candidate_id_payout_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."payout_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payouts" ADD CONSTRAINT "verified_payouts_transaction_id_blockchain_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."blockchain_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payouts" ADD CONSTRAINT "verified_payouts_source_wallet_id_tracked_wallets_id_fk" FOREIGN KEY ("source_wallet_id") REFERENCES "public"."tracked_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payouts" ADD CONSTRAINT "verified_payouts_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_networks_key_uq" ON "blockchain_networks" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_transactions_uq" ON "blockchain_transactions" USING btree ("network_id","tx_hash","transfer_index");--> statement-breakpoint
CREATE INDEX "blockchain_transactions_from_idx" ON "blockchain_transactions" USING btree ("network_id","from_address","block_timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "blockchain_transactions_time_idx" ON "blockchain_transactions" USING btree ("block_timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "payout_candidates_transaction_uq" ON "payout_candidates" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "payout_candidates_review_idx" ON "payout_candidates" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payout_candidates_firm_idx" ON "payout_candidates" USING btree ("prop_firm_id","status");--> statement-breakpoint
CREATE INDEX "payout_verification_events_candidate_idx" ON "payout_verification_events" USING btree ("candidate_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_wallets_network_address_uq" ON "tracked_wallets" USING btree ("network_id","address_normalized");--> statement-breakpoint
CREATE INDEX "tracked_wallets_firm_idx" ON "tracked_wallets" USING btree ("prop_firm_id","is_active");--> statement-breakpoint
CREATE INDEX "tracked_wallets_scan_idx" ON "tracked_wallets" USING btree ("last_checked_at") WHERE "tracked_wallets"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "verified_payouts_transaction_uq" ON "verified_payouts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "verified_payouts_firm_idx" ON "verified_payouts" USING btree ("prop_firm_id","transaction_timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "verified_payouts_recent_idx" ON "verified_payouts" USING btree ("transaction_timestamp" DESC NULLS LAST);