-- =========================================================================
-- Stakeholder profiles + relationships — RELATIONAL form.
--
-- NOT REQUIRED TO RUN. The feature ships on clients.properties JSONB
-- (`stakeholder_profiles`, `stakeholder_links`), which is how cs_pulse,
-- cs_health, churn_reasons and stakeholder_mappings are already persisted and
-- which needs no production migration. Per-account stakeholder sets are small,
-- so JSONB is a sound resting place, not a stopgap that must be escaped.
--
-- This file exists so promotion is available and cheap when it's justified —
-- e.g. when you want cross-account queries ("every account where the champion
-- has gone quiet"), which JSONB makes awkward. Column names match the
-- TypeScript field names in lib/stakeholders/profile.ts one-for-one, so
-- promotion is a data move plus a repo-layer swap, not a redesign.
--
-- Run against the DIRECT connection (port 5432) — DDL does not work reliably
-- through the transaction pooler on 6543.
-- =========================================================================

CREATE TABLE IF NOT EXISTS stakeholder_profiles (
  id                    text PRIMARY KEY,
  client_id             text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- The synced HubSpot contact this describes, when there is one. Nullable on
  -- purpose: a stakeholder the CSM knows about but who was never in HubSpot is
  -- a first-class record, not an error.
  contact_id            text,

  first_name            text,
  last_name             text,
  preferred_name        text,
  job_title             text,
  department            text,
  company               text,
  location              text,
  photo_url             text,

  email                 text,
  phone                 text,
  mobile                text,
  linkedin_url          text,
  preferred_channel     text NOT NULL DEFAULT 'unknown',
  timezone              text,

  -- Multiple roles per stakeholder is the norm, not an edge case.
  roles                 text[] NOT NULL DEFAULT '{}',
  influence             text NOT NULL DEFAULT 'unknown',
  decision_authority    text NOT NULL DEFAULT 'unknown',
  sentiment             text NOT NULL DEFAULT 'unknown',
  relationship_strength text NOT NULL DEFAULT 'unknown',
  engagement_status     text NOT NULL DEFAULT 'unknown',
  owner_email           text,
  last_contacted_at     date,
  next_engagement_at    date,

  notes                 text,
  tags                  text[] NOT NULL DEFAULT '{}',

  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            text
);

-- One record per person per account. Partial, so the many stakeholders with no
-- email yet don't collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS stakeholder_profiles_client_email_uniq
  ON stakeholder_profiles (client_id, lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS stakeholder_profiles_client_idx ON stakeholder_profiles (client_id);
-- Serves the coverage rules, which ask "does this account have role X".
CREATE INDEX IF NOT EXISTS stakeholder_profiles_roles_idx  ON stakeholder_profiles USING gin (roles);

CREATE TABLE IF NOT EXISTS stakeholder_links (
  id         text PRIMARY KEY,
  client_id  text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Deleting a stakeholder must take their edges with them, or the map renders
  -- relationships to people who no longer exist.
  from_id    text NOT NULL REFERENCES stakeholder_profiles(id) ON DELETE CASCADE,
  to_id      text NOT NULL REFERENCES stakeholder_profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT stakeholder_links_no_self CHECK (from_id <> to_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS stakeholder_links_uniq ON stakeholder_links (from_id, to_id, kind);
CREATE INDEX IF NOT EXISTS stakeholder_links_client_idx ON stakeholder_links (client_id);

-- Reporting cycles are prevented in the application (saveStakeholderLinkAction
-- walks the chain before writing) rather than here: expressing "no cycles in
-- the reports_to subgraph" as a constraint needs a recursive trigger, which
-- costs more than it protects for graphs this size.
