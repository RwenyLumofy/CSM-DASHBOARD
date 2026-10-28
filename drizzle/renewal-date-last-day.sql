-- Move every stored renewal date onto the term's last day (decided 2026-10-28).
--
-- A term that starts 1 Jan 2026 for a year renews on 31 Dec 2026, not 1 Jan 2027:
-- the day after the end put year-end renewals in the next quarter. The import and
-- the Record drawer now write renewal = end date (lib/contracts/term.ts); this
-- brings the records already stored into line. On the test database all 224
-- records with a renewal date had renewal = end + 1 day.
--
-- Only records still on the old rule move. A renewal date someone set by hand to
-- anything else is left alone. Each change is written to contract_audit.
-- Safe to run twice: the second run matches nothing.

BEGIN;

WITH moved AS (
  UPDATE contract_records r
  SET renewal_date = r.end_date, updated_at = now()
  WHERE r.end_date IS NOT NULL AND r.renewal_date = r.end_date + 1
  RETURNING r.id, r.client_id, r.end_date
)
INSERT INTO contract_audit (client_id, record_id, action, actor, before, after)
SELECT client_id, id, 'update', 'renewal-date-last-day.sql',
       jsonb_build_object('renewalDate', to_char(end_date + 1, 'YYYY-MM-DD')),
       jsonb_build_object('renewalDate', to_char(end_date, 'YYYY-MM-DD'))
FROM moved;

COMMIT;

-- Verify: expect 0.
SELECT count(*) AS still_day_after_end FROM contract_records
WHERE end_date IS NOT NULL AND renewal_date = end_date + 1;
