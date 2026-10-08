-- Contract records — the account's contract history, owned by Signal.
--
-- Paste-and-run in the Supabase SQL editor of the target project (production
-- migrations run from the dashboard; credentials never reach a laptop). The
-- same DDL is in scripts/add-contract-tables.mjs for the test database.
--
-- Strictly additive and idempotent: re-running it changes nothing, and nothing
-- here reads or changes existing tables. The app does not read these tables
-- until the contract rework is switched on; until then they are filled by the
-- import (scripts/import-contract-records.mts) and compared against today's ARR.
--
-- Decisions: docs/specs/revenue/contract-records-specification.md

-- Every sale, renewal, expansion, downgrade and churn on an account.
CREATE TABLE IF NOT EXISTS contract_records (
  id text PRIMARY KEY,                       -- ctr-{uuid}; imports use ctr-hs-{dealId} / ctr-churn-{clientId}
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind text NOT NULL,                        -- sale | renewal | expansion | downgrade | churn
  source text NOT NULL,                      -- hubspot (Closed Won sale) | signal | imported (from the HubSpot CS pipeline) | expansion (won on the Expansion page)
  hubspot_deal_id text,                      -- sales, and records imported from a HubSpot deal
  opportunity_id text,                       -- the Expansion-page opportunity an expansion came from
  channel text,                              -- sales: Direct Sales, Indirect (Jisr), …
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',      -- USD | BHD | SAR; amounts below are in this currency
  amount double precision NOT NULL DEFAULT 0,-- sale/renewal: licence ARR (year 1); expansion/downgrade: the change; churn: ARR lost (0 = all)
  year_amounts jsonb,                        -- multi-year priced per year: licence ARR for year 1, 2, 3…
  support_level text,
  support_amount double precision,           -- annual; counts toward ARR
  one_time_fees jsonb NOT NULL DEFAULT '[]', -- [{label, amount}]; never ARR
  licences double precision,
  complementary double precision,
  price_per_user double precision,
  modules jsonb NOT NULL DEFAULT '[]',
  starting_modules jsonb NOT NULL DEFAULT '[]',
  library_decided boolean NOT NULL DEFAULT false, -- "None" is a decision
  library_terms jsonb NOT NULL DEFAULT '{}', -- {provider: {licences, start, expiry}}
  implementation_level text,
  ai_credits double precision,
  milestones jsonb NOT NULL DEFAULT '{}',    -- {invoice_sent_date, kickoff_meeting_date, launch_date, platform_start_date, platform_end_date}
  start_date date,
  end_date date,
  renewal_date date,
  counted boolean NOT NULL DEFAULT true,     -- false = kept as history only
  churn_reasons jsonb NOT NULL DEFAULT '[]', -- reason ids from Settings → Churn taxonomy
  note text,
  voided_at timestamptz,                     -- a mistake is voided with a reason, never deleted
  voided_by text,
  void_reason text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_records_client_id_idx ON contract_records (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS contract_records_hubspot_deal_uq ON contract_records (hubspot_deal_id) WHERE hubspot_deal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contract_records_opportunity_uq ON contract_records (opportunity_id) WHERE opportunity_id IS NOT NULL;

-- A status set by hand. Needs a reason; expires (30 days by default) or clears at the next renewal or churn.
CREATE TABLE IF NOT EXISTS client_status_overrides (
  client_id text PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL,                      -- onboarding | active | renewal | overdue | churned
  reason text NOT NULL,
  set_by text,
  set_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

-- Who changed what on an account's contracts and status, before and after.
CREATE TABLE IF NOT EXISTS contract_audit (
  id serial PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  record_id text,                            -- null for status changes
  action text NOT NULL,                      -- create | update | void | status_set | status_cleared | import
  actor text,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_audit_client_idx ON contract_audit (client_id, at DESC);

-- Verify: expect 3.
SELECT count(*) AS contract_tables FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('contract_records', 'client_status_overrides', 'contract_audit');
