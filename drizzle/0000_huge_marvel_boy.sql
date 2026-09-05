-- ---------------------------------------------------------------------------
-- Hand-authored preamble (docs/INITIALIZATION.md §11 step D).
-- Drizzle cannot express extensions; they are part of the schema, not extras.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent_hash" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"admin_user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by_admin_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_roles_admin_user_id_role_id_pk" PRIMARY KEY("admin_user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_encrypted" text,
	"mfa_recovery_codes" text[],
	"last_login_at" timestamp with time zone,
	"last_login_ip_hash" text,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"invited_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "admin_users_status_ck" CHECK ("admin_users"."status" in ('invited', 'active', 'suspended')),
	CONSTRAINT "admin_users_failed_login_ck" CHECK ("admin_users"."failed_login_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"slug" text,
	"avatar_media_id" uuid,
	"country_code" char(2),
	"bio" text,
	"trading_experience" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profiles_bio_len_ck" CHECK ("profiles"."bio" is null or length("profiles"."bio") <= 1000),
	CONSTRAINT "profiles_country_ck" CHECK ("profiles"."country_code" is null or "profiles"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_status_ck" CHECK ("users"."status" in ('active', 'suspended', 'banned'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_provider" text DEFAULT 'r2' NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"blur_placeholder" text,
	"checksum_sha256" char(64) NOT NULL,
	"alt_text" text NOT NULL,
	"title" text,
	"caption" text,
	"uploaded_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_provider_ck" CHECK ("media"."storage_provider" in ('r2', 's3', 'vercel_blob')),
	CONSTRAINT "media_byte_size_ck" CHECK ("media"."byte_size" > 0),
	CONSTRAINT "media_image_dimensions_ck" CHECK ("media"."mime_type" not like 'image/%' or ("media"."width" is not null and "media"."height" is not null))
);
--> statement-breakpoint
CREATE TABLE "media_usages" (
	"media_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_usages_media_id_entity_type_entity_id_field_pk" PRIMARY KEY("media_id","entity_type","entity_id","field")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"challenge_type" text NOT NULL,
	"account_size" numeric(14, 2) NOT NULL,
	"account_currency" char(3) NOT NULL,
	"price" numeric(12, 2),
	"price_currency" char(3),
	"profit_target_p1_pct" numeric(6, 3),
	"profit_target_p2_pct" numeric(6, 3),
	"profit_target_p3_pct" numeric(6, 3),
	"max_daily_loss_pct" numeric(6, 3),
	"max_total_drawdown_pct" numeric(6, 3),
	"drawdown_type" text,
	"drawdown_basis" text,
	"min_trading_days" smallint,
	"max_trading_days" smallint,
	"profit_split_pct" numeric(6, 3),
	"payout_frequency_days" smallint,
	"first_payout_days" smallint,
	"leverage" text,
	"fee_refundable" boolean,
	"has_scaling_plan" boolean,
	"status" text DEFAULT 'draft' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_by_admin_id" uuid,
	"updated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "challenges_status_ck" CHECK ("challenges"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "challenges_slug_ck" CHECK ("challenges"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "challenges_type_ck" CHECK ("challenges"."challenge_type" in ('one_step', 'two_step', 'three_step', 'instant_funding', 'other')),
	CONSTRAINT "challenges_drawdown_type_ck" CHECK ("challenges"."drawdown_type" is null or "challenges"."drawdown_type" in ('static', 'trailing', 'eod_trailing')),
	CONSTRAINT "challenges_drawdown_basis_ck" CHECK ("challenges"."drawdown_basis" is null or "challenges"."drawdown_basis" in ('initial_balance', 'equity', 'highest_equity', 'highest_balance')),
	CONSTRAINT "challenges_account_size_ck" CHECK ("challenges"."account_size" > 0),
	CONSTRAINT "challenges_price_ck" CHECK ("challenges"."price" is null or "challenges"."price" >= 0),
	CONSTRAINT "challenges_trading_days_ck" CHECK ("challenges"."max_trading_days" is null or "challenges"."min_trading_days" is null or "challenges"."max_trading_days" >= "challenges"."min_trading_days"),
	CONSTRAINT "challenges_profit_split_ck" CHECK ("challenges"."profit_split_pct" is null or ("challenges"."profit_split_pct" between 0 and 100)),
	CONSTRAINT "challenges_daily_loss_ck" CHECK ("challenges"."max_daily_loss_pct" is null or ("challenges"."max_daily_loss_pct" between 0 and 100)),
	CONSTRAINT "challenges_total_drawdown_ck" CHECK ("challenges"."max_total_drawdown_pct" is null or ("challenges"."max_total_drawdown_pct" between 0 and 100)),
	CONSTRAINT "challenges_account_currency_ck" CHECK ("challenges"."account_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "challenges_price_currency_ck" CHECK ("challenges"."price_currency" is null or "challenges"."price_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "challenges_price_pairing_ck" CHECK (("challenges"."price" is null) = ("challenges"."price_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "prop_firms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tagline" text,
	"description" text,
	"founded_year" integer,
	"headquarters_country" char(2),
	"headquarters_city" text,
	"website_url" text,
	"support_email" text,
	"support_url" text,
	"logo_media_id" uuid,
	"cover_media_id" uuid,
	"brand_color" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"draft_payload" jsonb,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"data_completeness_score" smallint,
	"is_featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	"updated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "prop_firms_status_ck" CHECK ("prop_firms"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "prop_firms_verification_ck" CHECK ("prop_firms"."verification_status" in ('unverified', 'verified', 'needs_review')),
	CONSTRAINT "prop_firms_slug_ck" CHECK ("prop_firms"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "prop_firms_tagline_len_ck" CHECK ("prop_firms"."tagline" is null or length("prop_firms"."tagline") <= 160),
	CONSTRAINT "prop_firms_founded_year_ck" CHECK ("prop_firms"."founded_year" is null or ("prop_firms"."founded_year" between 1900 and extract(year from now())::int + 1)),
	CONSTRAINT "prop_firms_brand_color_ck" CHECK ("prop_firms"."brand_color" is null or "prop_firms"."brand_color" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "prop_firms_completeness_ck" CHECK ("prop_firms"."data_completeness_score" is null or ("prop_firms"."data_completeness_score" between 0 and 100)),
	CONSTRAINT "prop_firms_country_ck" CHECK ("prop_firms"."headquarters_country" is null or "prop_firms"."headquarters_country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "prop_firms_draft_shape_ck" CHECK ("prop_firms"."draft_payload" is null or (jsonb_typeof("prop_firms"."draft_payload") = 'object' and "prop_firms"."draft_payload" ? 'schemaVersion'))
);
--> statement-breakpoint
CREATE TABLE "firm_instruments" (
	"prop_firm_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firm_instruments_prop_firm_id_instrument_id_pk" PRIMARY KEY("prop_firm_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "firm_platforms" (
	"prop_firm_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firm_platforms_prop_firm_id_platform_id_pk" PRIMARY KEY("prop_firm_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"asset_class" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'published' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_asset_class_ck" CHECK ("instruments"."asset_class" in ('forex', 'indices', 'commodities', 'metals', 'energies', 'crypto', 'stocks', 'futures', 'options', 'other')),
	CONSTRAINT "instruments_status_ck" CHECK ("instruments"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "instruments_slug_ck" CHECK ("instruments"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_media_id" uuid,
	"website_url" text,
	"description" text,
	"status" text DEFAULT 'published' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_status_ck" CHECK ("platforms"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "platforms_slug_ck" CHECK ("platforms"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "rule_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"prop_firm_id" uuid,
	"challenge_id" uuid,
	"value_boolean" boolean,
	"value_numeric" numeric(14, 4),
	"value_text" text,
	"note" text,
	"source_url" text,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_values_scope_ck" CHECK ("rule_values"."scope" in ('firm', 'challenge')),
	CONSTRAINT "rule_values_target_ck" CHECK (("rule_values"."scope" = 'firm' and "rule_values"."prop_firm_id" is not null and "rule_values"."challenge_id" is null)
          or ("rule_values"."scope" = 'challenge' and "rule_values"."challenge_id" is not null and "rule_values"."prop_firm_id" is null)),
	CONSTRAINT "rule_values_one_value_ck" CHECK (("rule_values"."value_boolean" is not null)::int + ("rule_values"."value_numeric" is not null)::int + ("rule_values"."value_text" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"data_type" text NOT NULL,
	"enum_options" text[],
	"unit" text,
	"applies_to" text DEFAULT 'both' NOT NULL,
	"is_comparable" boolean DEFAULT true NOT NULL,
	"is_filterable" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_category_ck" CHECK ("rules"."category" in ('trading', 'risk', 'payout', 'account', 'platform', 'restriction', 'other')),
	CONSTRAINT "rules_data_type_ck" CHECK ("rules"."data_type" in ('boolean', 'number', 'percent', 'currency', 'text', 'enum')),
	CONSTRAINT "rules_applies_to_ck" CHECK ("rules"."applies_to" in ('firm', 'challenge', 'both')),
	CONSTRAINT "rules_status_ck" CHECK ("rules"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "rules_enum_options_ck" CHECK ("rules"."data_type" <> 'enum' or "rules"."enum_options" is not null)
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "affiliate_clicks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"affiliate_link_id" uuid NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"offer_id" uuid,
	"placement" text,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"country_code" char(2),
	"device_type" text,
	"referrer_host" text,
	"landing_path" text,
	"session_id" text,
	"user_id" uuid,
	"is_bot" boolean DEFAULT false NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"label" text NOT NULL,
	"destination_url" text NOT NULL,
	"network" text,
	"campaign" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"commission_notes" text,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "affiliate_links_status_ck" CHECK ("affiliate_links"."status" in ('active', 'paused', 'archived')),
	CONSTRAINT "affiliate_links_https_ck" CHECK ("affiliate_links"."destination_url" ~ '^https://'),
	CONSTRAINT "affiliate_links_window_ck" CHECK ("affiliate_links"."ends_at" is null or "affiliate_links"."starts_at" is null or "affiliate_links"."ends_at" > "affiliate_links"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"affiliate_link_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"terms" text,
	"code" text,
	"discount_type" text,
	"discount_value" numeric(10, 2),
	"discount_currency" char(3),
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "offers_status_ck" CHECK ("offers"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "offers_discount_type_ck" CHECK ("offers"."discount_type" is null or "offers"."discount_type" in ('percent', 'fixed', 'free_trial', 'other')),
	CONSTRAINT "offers_window_ck" CHECK ("offers"."ends_at" is null or "offers"."starts_at" is null or "offers"."ends_at" > "offers"."starts_at"),
	CONSTRAINT "offers_percent_range_ck" CHECK ("offers"."discount_type" <> 'percent' or ("offers"."discount_value" between 0 and 100)),
	CONSTRAINT "offers_fixed_currency_ck" CHECK ("offers"."discount_type" <> 'fixed' or "offers"."discount_currency" is not null),
	CONSTRAINT "offers_currency_format_ck" CHECK ("offers"."discount_currency" is null or "offers"."discount_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" text NOT NULL,
	"actor_admin_id" uuid,
	"actor_user_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"ip_hash" text,
	"user_agent_hash" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_type_ck" CHECK ("audit_logs"."actor_type" in ('admin', 'user', 'system')),
	CONSTRAINT "audit_logs_actor_match_ck" CHECK (("audit_logs"."actor_type" = 'admin' and "audit_logs"."actor_admin_id" is not null)
          or ("audit_logs"."actor_type" = 'user' and "audit_logs"."actor_user_id" is not null)
          or ("audit_logs"."actor_type" = 'system' and "audit_logs"."actor_admin_id" is null and "audit_logs"."actor_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "entity_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"label" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_versions_entity_type_ck" CHECK ("entity_versions"."entity_type" in ('prop_firm', 'challenge', 'platform', 'instrument', 'offer', 'affiliate_link', 'media', 'rule', 'static_route')),
	CONSTRAINT "entity_versions_number_ck" CHECK ("entity_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_notes_entity_type_ck" CHECK ("internal_notes"."entity_type" in ('prop_firm', 'challenge', 'platform', 'instrument', 'offer', 'affiliate_link', 'media', 'rule', 'static_route'))
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" smallint DEFAULT 301 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"reason" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"hit_count" bigint DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_status_ck" CHECK ("redirects"."status_code" in (301, 302, 307, 308, 410)),
	CONSTRAINT "redirects_source_ck" CHECK ("redirects"."source" in ('auto_slug_change', 'manual', 'import')),
	CONSTRAINT "redirects_no_self_ck" CHECK ("redirects"."from_path" <> "redirects"."to_path"),
	CONSTRAINT "redirects_from_shape_ck" CHECK ("redirects"."from_path" ~ '^/')
);
--> statement-breakpoint
CREATE TABLE "seo_metadata" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"route_path" text,
	"title" text,
	"meta_description" text,
	"canonical_url" text,
	"og_title" text,
	"og_description" text,
	"og_image_media_id" uuid,
	"twitter_card" text,
	"robots_index" boolean DEFAULT true NOT NULL,
	"robots_follow" boolean DEFAULT true NOT NULL,
	"include_in_sitemap" boolean DEFAULT true NOT NULL,
	"structured_data_override" jsonb,
	"keywords" text[],
	"updated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_entity_type_ck" CHECK ("seo_metadata"."entity_type" in ('prop_firm', 'challenge', 'platform', 'instrument', 'article', 'page', 'static_route')),
	CONSTRAINT "seo_target_ck" CHECK (("seo_metadata"."entity_id" is not null and "seo_metadata"."route_path" is null)
          or ("seo_metadata"."entity_id" is null and "seo_metadata"."route_path" is not null)),
	CONSTRAINT "seo_title_len_ck" CHECK ("seo_metadata"."title" is null or length("seo_metadata"."title") <= 70),
	CONSTRAINT "seo_description_len_ck" CHECK ("seo_metadata"."meta_description" is null or length("seo_metadata"."meta_description") <= 160),
	CONSTRAINT "seo_twitter_card_ck" CHECK ("seo_metadata"."twitter_card" is null or "seo_metadata"."twitter_card" in ('summary', 'summary_large_image'))
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_granted_by_admin_id_admin_users_id_fk" FOREIGN KEY ("granted_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_invited_by_admin_id_admin_users_id_fk" FOREIGN KEY ("invited_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_admin_id_admin_users_id_fk" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_instruments" ADD CONSTRAINT "firm_instruments_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_instruments" ADD CONSTRAINT "firm_instruments_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_platforms" ADD CONSTRAINT "firm_platforms_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_platforms" ADD CONSTRAINT "firm_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_values" ADD CONSTRAINT "rule_values_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_values" ADD CONSTRAINT "rule_values_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_values" ADD CONSTRAINT "rule_values_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_values" ADD CONSTRAINT "rule_values_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_metadata" ADD CONSTRAINT "seo_metadata_og_image_media_id_media_id_fk" FOREIGN KEY ("og_image_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_metadata" ADD CONSTRAINT "seo_metadata_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_uq" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_user_roles_role_idx" ON "admin_user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_live_uq" ON "admin_users" USING btree ("email") WHERE "admin_users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "admin_users_status_idx" ON "admin_users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_uq" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_uq" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_slug_live_uq" ON "profiles" USING btree ("slug") WHERE "profiles"."slug" is not null and "profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_uq" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_live_uq" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_uq" ON "media" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_checksum_uq" ON "media" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE INDEX "media_created_idx" ON "media" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_usages_entity_idx" ON "media_usages" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_firm_slug_uq" ON "challenges" USING btree ("prop_firm_id","slug") WHERE "challenges"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "challenges_firm_idx" ON "challenges" USING btree ("prop_firm_id","display_order") WHERE "challenges"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "challenges_filter_idx" ON "challenges" USING btree ("account_size","price","challenge_type") WHERE "challenges"."status" = 'published' and "challenges"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "prop_firms_slug_live_uq" ON "prop_firms" USING btree ("slug") WHERE "prop_firms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "prop_firms_public_idx" ON "prop_firms" USING btree ("status","display_order","name") WHERE "prop_firms"."deleted_at" is null and "prop_firms"."status" = 'published';--> statement-breakpoint
CREATE INDEX "prop_firms_featured_idx" ON "prop_firms" USING btree ("is_featured","display_order") WHERE "prop_firms"."status" = 'published' and "prop_firms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "prop_firms_verification_idx" ON "prop_firms" USING btree ("verification_status","verified_at");--> statement-breakpoint
CREATE INDEX "prop_firms_has_draft_idx" ON "prop_firms" USING btree ("updated_at" DESC NULLS LAST) WHERE "prop_firms"."draft_payload" is not null and "prop_firms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "firm_instruments_instrument_idx" ON "firm_instruments" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "firm_platforms_platform_idx" ON "firm_platforms" USING btree ("platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_key_uq" ON "instruments" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_slug_uq" ON "instruments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "instruments_asset_class_idx" ON "instruments" USING btree ("asset_class");--> statement-breakpoint
CREATE UNIQUE INDEX "platforms_key_uq" ON "platforms" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "platforms_slug_uq" ON "platforms" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_values_firm_uq" ON "rule_values" USING btree ("rule_id","prop_firm_id") WHERE "rule_values"."scope" = 'firm';--> statement-breakpoint
CREATE UNIQUE INDEX "rule_values_challenge_uq" ON "rule_values" USING btree ("rule_id","challenge_id") WHERE "rule_values"."scope" = 'challenge';--> statement-breakpoint
CREATE INDEX "rule_values_firm_lookup_idx" ON "rule_values" USING btree ("prop_firm_id","rule_id");--> statement-breakpoint
CREATE INDEX "rule_values_challenge_lookup_idx" ON "rule_values" USING btree ("challenge_id","rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_key_uq" ON "rules" USING btree ("key");--> statement-breakpoint
CREATE INDEX "rules_category_idx" ON "rules" USING btree ("category","display_order");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_link_idx" ON "affiliate_clicks" USING btree ("affiliate_link_id","clicked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "affiliate_clicks_firm_idx" ON "affiliate_clicks" USING btree ("prop_firm_id","clicked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "affiliate_clicks_reportable_idx" ON "affiliate_clicks" USING btree ("clicked_at" DESC NULLS LAST) WHERE not "affiliate_clicks"."is_bot" and not "affiliate_clicks"."is_internal";--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_default_uq" ON "affiliate_links" USING btree ("prop_firm_id") WHERE "affiliate_links"."is_default" and "affiliate_links"."deleted_at" is null and "affiliate_links"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_campaign_uq" ON "affiliate_links" USING btree ("prop_firm_id","campaign") WHERE "affiliate_links"."campaign" is not null and "affiliate_links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "affiliate_links_firm_idx" ON "affiliate_links" USING btree ("prop_firm_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_firm_code_uq" ON "offers" USING btree ("prop_firm_id",lower("code")) WHERE "offers"."code" is not null and "offers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "offers_active_idx" ON "offers" USING btree ("status","ends_at","display_order") WHERE "offers"."status" = 'published' and "offers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "offers_firm_idx" ON "offers" USING btree ("prop_firm_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "entity_versions_uq" ON "entity_versions" USING btree ("entity_type","entity_id","version_number");--> statement-breakpoint
CREATE INDEX "entity_versions_lookup_idx" ON "entity_versions" USING btree ("entity_type","entity_id","version_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "internal_notes_entity_idx" ON "internal_notes" USING btree ("entity_type","entity_id","is_pinned" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "redirects_from_active_uq" ON "redirects" USING btree ("from_path") WHERE "redirects"."is_active";--> statement-breakpoint
CREATE INDEX "redirects_to_idx" ON "redirects" USING btree ("to_path");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_entity_uq" ON "seo_metadata" USING btree ("entity_type","entity_id") WHERE "seo_metadata"."entity_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_route_uq" ON "seo_metadata" USING btree ("route_path") WHERE "seo_metadata"."route_path" is not null;--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Hand-authored additions (docs/INITIALIZATION.md §11 step D).
-- ---------------------------------------------------------------------------

-- Trigram indexes for admin fuzzy search (docs/DATABASE.md §8).
CREATE INDEX "prop_firms_name_trgm_idx" ON "prop_firms" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "challenges_name_trgm_idx" ON "challenges" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint

-- Append-only enforcement for the tamper-evident tables
-- (docs/DATABASE.md §1.2 rule 4 and §4.7 [LOCKED]).
-- Retention is by partition drop, never by DELETE.
CREATE OR REPLACE FUNCTION prop_firm_lenz_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'append-only table: % on % is forbidden', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prop_firm_lenz_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER entity_versions_append_only
  BEFORE UPDATE OR DELETE ON "entity_versions"
  FOR EACH ROW EXECUTE FUNCTION prop_firm_lenz_forbid_mutation();
--> statement-breakpoint

-- Defence in depth: also revoke the grants, but only if the application role
-- exists. The trigger above is the portable guarantee; this is belt-and-braces
-- for deployments that run under a dedicated least-privilege role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    REVOKE UPDATE, DELETE ON "audit_logs" FROM app_role;
    REVOKE UPDATE, DELETE ON "entity_versions" FROM app_role;
  END IF;
END;
$$;
