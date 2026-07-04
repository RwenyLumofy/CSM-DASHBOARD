CREATE TABLE "arr_events" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"arr" double precision DEFAULT 0 NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"renewal_date" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arr_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"period" text NOT NULL,
	"arr" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"hubspot_file_id" text,
	"deal_id" text,
	"name" text NOT NULL,
	"url" text,
	"extension" text,
	"size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"hubspot_contact_id" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"hubspot_id" text,
	"source" text DEFAULT 'hubspot' NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"country" text,
	"industry" text,
	"employees" integer,
	"customer_type" text DEFAULT 'arr' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"csm" jsonb,
	"currency" text DEFAULT 'USD' NOT NULL,
	"arr" double precision DEFAULT 0 NOT NULL,
	"previous_arr" double precision DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"renewal_date" timestamp with time zone,
	"churned_at" timestamp with time zone,
	"segment" text DEFAULT 'smb' NOT NULL,
	"logo_url" text,
	"hubspot_url" text,
	"health" jsonb,
	"support" jsonb,
	"usage" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"playbook_id" text NOT NULL,
	"step_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"due_date" timestamp with time zone,
	"owner_id" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"trigger_value" double precision,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"author" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
