-- Project management — the CSM-owned delivery tracker on each account's
-- "Project Management" tab. See lib/db/schema.ts (clientProjects,
-- projectMilestones, projectTasks, projectTemplates) and lib/projects/*.
--
-- Additive and safe: four brand-new empty tables, no change to existing data.
-- IF NOT EXISTS makes it safe to re-run. Run against the Supabase database
-- (SQL editor or psql). The CREATE INDEX statements use CONCURRENTLY so they
-- never lock — but that cannot run inside a transaction block, so run each
-- statement on its own (the Supabase SQL editor does this; do not wrap in
-- BEGIN/COMMIT). Index names match lib/db/schema.ts so a future
-- `drizzle-kit push` sees them as already-present.

CREATE TABLE IF NOT EXISTS client_projects (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  name text NOT NULL,
  description text,
  type text,
  status text NOT NULL DEFAULT 'not_started',
  start_date timestamptz,
  delivery_date timestamptz,
  owner_email text,
  implementer_email text,
  contact_id text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS project_milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  client_id text NOT NULL,
  name text NOT NULL,
  description text,
  due_date timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  milestone_id text NOT NULL,
  client_id text NOT NULL,
  name text NOT NULL,
  description text,
  type text,
  status text NOT NULL DEFAULT 'todo',
  start_date timestamptz,
  delivery_date timestamptz,
  owner_email text,
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  type text,
  structure jsonb NOT NULL DEFAULT '{"milestones":[]}'::jsonb,
  created_by_email text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_projects_client_id_idx
  ON client_projects (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS project_milestones_project_id_idx
  ON project_milestones (project_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS project_milestones_client_id_idx
  ON project_milestones (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS project_tasks_project_id_idx
  ON project_tasks (project_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS project_tasks_milestone_id_idx
  ON project_tasks (milestone_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS project_tasks_client_id_idx
  ON project_tasks (client_id);
