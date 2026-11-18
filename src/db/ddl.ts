/**
 * Generated from src/db/schema.ts with `npx drizzle-kit export`.
 * DDL creates a fresh database; UPGRADE brings an older one up to date and is
 * safe to run on every boot. Regenerate both after any schema change.
 */
export const DDL = `
CREATE TABLE "ad_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"name" text NOT NULL,
	"month" text NOT NULL,
	"budget" integer DEFAULT 0 NOT NULL,
	"spend" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"target_acos" real DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "automation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"automation_id" integer NOT NULL,
	"status" text NOT NULL,
	"code" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"extra" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "automations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"trigger" text NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"plan" text NOT NULL,
	"marketplaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quota" integer,
	"monthly_fee" integer DEFAULT 0 NOT NULL,
	"commission_pct" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "health_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"odr" real DEFAULT 0 NOT NULL,
	"late_shipment" real DEFAULT 0 NOT NULL,
	"cancel_rate" real DEFAULT 0 NOT NULL,
	"valid_tracking" real DEFAULT 100 NOT NULL,
	"violations" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"client_id" integer,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"product_type" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'clear' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"raw" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template" jsonb,
	"imported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"product_id" integer,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"keyword" text NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"products_count" text DEFAULT '' NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"client_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"marketplace" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"engine" text DEFAULT 'template' NOT NULL,
	"model" text,
	"tone" text DEFAULT 'clear' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"bullets_en" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bullets_ar" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"search_terms" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"order_ref" text DEFAULT '' NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"item" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'home' NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"stage" text DEFAULT 'intake' NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"features" text DEFAULT '' NOT NULL,
	"features_ar" text DEFAULT '' NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"stock" integer,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"stock_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"product_id" integer,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL
);

CREATE TABLE "statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"month" text NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"pct" real DEFAULT 0 NOT NULL,
	"extra_items" integer DEFAULT 0 NOT NULL,
	"extra_rate" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"client_id" integer,
	"product_id" integer,
	"listing_id" integer,
	"team" text DEFAULT 'accounts' NOT NULL,
	"due_at" timestamp with time zone,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"automation_id" integer,
	"wa_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "listings" ADD CONSTRAINT "listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
`;

export const UPGRADE = `
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "share_token" text;\n\nALTER TABLE "statements" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock" integer;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reorder_point" integer DEFAULT 0 NOT NULL;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"client_id" integer,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"product_type" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'clear' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"raw" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template" jsonb,
	"imported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"month" text NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"pct" real DEFAULT 0 NOT NULL,
	"extra_items" integer DEFAULT 0 NOT NULL,
	"extra_rate" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"order_ref" text DEFAULT '' NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"item" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"product_id" integer,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"keyword" text NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ad_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"name" text NOT NULL,
	"month" text NOT NULL,
	"budget" integer DEFAULT 0 NOT NULL,
	"spend" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"target_acos" real DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"product_id" integer,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "health_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"marketplace" text DEFAULT 'amazon' NOT NULL,
	"odr" real DEFAULT 0 NOT NULL,
	"late_shipment" real DEFAULT 0 NOT NULL,
	"cancel_rate" real DEFAULT 0 NOT NULL,
	"valid_tracking" real DEFAULT 100 NOT NULL,
	"violations" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"products_count" text DEFAULT '' NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"client_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
`;
