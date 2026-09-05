CREATE TABLE "blockchain_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"credential_env_var" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_status" text,
	"last_test_latency_ms" integer,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blockchain_providers_latency_ck" CHECK ("blockchain_providers"."last_test_latency_ms" is null or "blockchain_providers"."last_test_latency_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blockchain_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"network_id" uuid NOT NULL,
	"contract_address" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"decimals" smallint NOT NULL,
	"source_url" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blockchain_tokens_decimals_ck" CHECK ("blockchain_tokens"."decimals" between 0 and 36),
	CONSTRAINT "blockchain_tokens_contract_lower_ck" CHECK ("blockchain_tokens"."contract_address" = lower("blockchain_tokens"."contract_address"))
);
--> statement-breakpoint
CREATE TABLE "tracked_wallet_tokens" (
	"wallet_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_wallet_tokens_wallet_id_token_id_pk" PRIMARY KEY("wallet_id","token_id")
);
--> statement-breakpoint
ALTER TABLE "blockchain_networks" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD COLUMN "evidence_url" text;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD COLUMN "effective_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD COLUMN "last_sync_status" text;--> statement-breakpoint
ALTER TABLE "tracked_wallets" ADD COLUMN "last_successful_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blockchain_tokens" ADD CONSTRAINT "blockchain_tokens_network_id_blockchain_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."blockchain_networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_wallet_tokens" ADD CONSTRAINT "tracked_wallet_tokens_wallet_id_tracked_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."tracked_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_wallet_tokens" ADD CONSTRAINT "tracked_wallet_tokens_token_id_blockchain_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."blockchain_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_providers_key_uq" ON "blockchain_providers" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_tokens_network_contract_uq" ON "blockchain_tokens" USING btree ("network_id","contract_address");--> statement-breakpoint
CREATE INDEX "blockchain_tokens_enabled_idx" ON "blockchain_tokens" USING btree ("network_id","symbol") WHERE "blockchain_tokens"."is_enabled";--> statement-breakpoint
CREATE INDEX "tracked_wallet_tokens_token_idx" ON "tracked_wallet_tokens" USING btree ("token_id");--> statement-breakpoint
ALTER TABLE "blockchain_networks" ADD CONSTRAINT "blockchain_networks_provider_id_blockchain_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."blockchain_providers"("id") ON DELETE set null ON UPDATE no action;