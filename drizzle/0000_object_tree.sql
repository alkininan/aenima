CREATE TYPE "public"."activity_trigger" AS ENUM('user', 'agent', 'schedule', 'webhook', 'sync');--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."artifact_kind" AS ENUM('brief', 'prd', 'tech_spec', 'design_package', 'backlog');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('feature', 'enhancement', 'technical', 'content', 'experiment', 'fix', 'spike');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'product', 'developer', 'viewer');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"actor_agent" text,
	"action" text NOT NULL,
	"trigger_source" "activity_trigger" NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_actor_shape" CHECK (("activity"."actor_kind" = 'human' and "activity"."actor_user_id" is not null and "activity"."actor_agent" is null)
       or ("activity"."actor_kind" = 'agent' and "activity"."actor_agent" is not null and "activity"."actor_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_workspace_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "artifact_item_kind" UNIQUE("item_id","kind")
);
--> statement-breakpoint
CREATE TABLE "artifact_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"authored_by_kind" "actor_kind" NOT NULL,
	"authored_by_user_id" uuid,
	"authored_by_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_version_no" UNIQUE("artifact_id","version_no"),
	CONSTRAINT "artifact_version_no_positive" CHECK ("artifact_version"."version_no" > 0),
	CONSTRAINT "artifact_version_actor_shape" CHECK (("artifact_version"."authored_by_kind" = 'human' and "artifact_version"."authored_by_user_id" is not null and "artifact_version"."authored_by_agent" is null)
       or ("artifact_version"."authored_by_kind" = 'agent' and "artifact_version"."authored_by_agent" is not null and "artifact_version"."authored_by_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"type" "item_type" NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_workspace_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "item_title_len" CHECK (length(btrim("item"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"all_products" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_workspace_user" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "membership_product" (
	"workspace_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "membership_product_membership_id_product_id_pk" PRIMARY KEY("membership_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_workspace_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "opportunity_title_len" CHECK (length(btrim("opportunity"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"decider_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_workspace_slug" UNIQUE("workspace_id","slug"),
	CONSTRAINT "product_workspace_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "product_name_len" CHECK (length(btrim("product"."name")) between 1 and 120),
	CONSTRAINT "product_slug_shape" CHECK ("product"."slug" ~ '^[a-z0-9][a-z0-9-]{0,62}$')
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_name_len" CHECK (length(btrim("workspace"."name")) between 1 and 120),
	CONSTRAINT "workspace_locale" CHECK ("workspace"."locale" in ('en','tr','nl'))
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."product"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "public"."item"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_fk" FOREIGN KEY ("workspace_id","artifact_id") REFERENCES "public"."artifact"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."product"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_opportunity_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunity"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_product" ADD CONSTRAINT "membership_product_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_product" ADD CONSTRAINT "membership_product_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."product"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."product"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_workspace_time_idx" ON "activity" USING btree ("workspace_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "artifact_item_idx" ON "artifact" USING btree ("workspace_id","item_id");--> statement-breakpoint
CREATE INDEX "artifact_version_artifact_idx" ON "artifact_version" USING btree ("workspace_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_version_current_idx" ON "artifact_version" USING btree ("artifact_id","version_no" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_product_idx" ON "item" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "item_opportunity_idx" ON "item" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "membership_workspace_idx" ON "membership" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "membership_product_workspace_idx" ON "membership_product" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "opportunity_product_idx" ON "opportunity" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "product_workspace_idx" ON "product" USING btree ("workspace_id");