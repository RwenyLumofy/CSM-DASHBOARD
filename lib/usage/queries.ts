/* =========================================================================
   Lumofy product-usage queries (Metabase / underlying Postgres).

   Every metric was validated against real tenant data across 7 environments
   in BOTH regional DBs (Lumofy LXP AWS = db 4, Lumofy KSA Oracle = db 5) — the
   schema is identical on both, so the same SQL runs on either; only the
   Metabase `database` id differs. See the 2026-07-04 audit for the evidence
   behind each non-obvious choice (noted inline below).

   Two consolidated queries per environment keep the runtime to two API calls:
     SNAPSHOT_SQL — one row of current scalar values (all KPIs)
     TREND_SQL    — long-format monthly series for the last 12 months

   `:ENV_ID` is substituted at call time with the environment UUID as a quoted
   literal (validated as a UUID first — see index.ts — so this is injection-safe).
   Tenant scoping mirrors each table's real shape: some tables carry
   environment_id directly, others scope through the user (users_lumofyuser) or
   a parent row.

   Cross-cutting rules learned from the audit:
   - Active/login and user counts EXCLUDE soft-deleted users (deleted_at IS NULL)
     and the platform's internal accounts (is_support / is_integration_user) —
     every tenant carries one internal@lumofy.com support user that otherwise
     inflates WAU/MAU/active by 1.
   - "Learning" reads ONE table: learning_contentitemenrollment (content catalog
     — course-builder, Docebo, Go1, edX, Coursera; joined to learning_contentitem
     for content_type). Until 2026-09-30 it was UNIONed (dedupe by shared id)
     with the legacy learning_items_enrollment / learning_items_learningitem
     pair, which mirror-wrote the same enrollments. Lumofy DROPPED both legacy
     tables on 2026-09-30 in both regional DBs, and their legacy-only rows were
     NOT migrated into the content tables (verified 2026-10-18 against the
     2026-07-28 snapshots: about half the tenants match exactly, the rest lose
     up to ~83% of their lifetime learning counts). The legacy-only history is no
     longer queryable anywhere Metabase can see, so lifetime learning totals
     are now lower than before for tenants with older authored-item usage.
   - The same upstream cleanup dropped the legacy performance_management_cycle
     table, so PM cycles now read performance_cycles_* only (see below).
   ========================================================================= */

/** Current-value snapshot: one row, one column per measure. */
export const SNAPSHOT_SQL = `
SELECT
  -- ── Adoption foundation ──────────────────────────────────────────────
  -- WAU/MAU exclude soft-deleted + internal support/integration accounts.
  (SELECT count(DISTINCT ul.user_id) FROM public.users_userlogin ul
     JOIN public.users_lumofyuser u ON ul.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ul.date >= (CURRENT_DATE - INTERVAL '7 day')
       AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false) AS wau,
  (SELECT count(DISTINCT ul.user_id) FROM public.users_userlogin ul
     JOIN public.users_lumofyuser u ON ul.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ul.date >= (CURRENT_DATE - INTERVAL '30 day')
       AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false) AS mau,
  (SELECT count(*) FROM public.users_lumofyuser WHERE environment_id = :ENV_ID AND deleted_at IS NULL) AS total_users,
  (SELECT count(*) FROM public.users_lumofyuser WHERE environment_id = :ENV_ID AND is_active AND deleted_at IS NULL) AS active_users,
  (SELECT COALESCE(SUM(available_licenses), 0) FROM public.environments_environmentuserlicense
     WHERE environment_id = :ENV_ID AND is_active = true) AS seats,
  (SELECT COALESCE(SUM(used_licenses), 0) FROM public.environments_environmentuserlicense
     WHERE environment_id = :ENV_ID AND is_active = true) AS used_licenses,
  -- ── Org structure (depth) ────────────────────────────────────────────
  (SELECT count(*) FROM public.mappings_jobrole WHERE environment_id = :ENV_ID) AS job_roles,
  -- job_levels = org grade definitions (mappings_joblevel). The old
  -- users_jobrolelevel table holds per-job-role rows, not levels (returned 0
  -- in 5/7 envs, the job-role count in the rest).
  (SELECT count(*) FROM public.mappings_joblevel WHERE environment_id = :ENV_ID) AS job_levels,
  (SELECT count(*) FROM public.org_structure_department WHERE environment_id = :ENV_ID) AS departments,
  (SELECT count(*) FROM public.org_structure_division WHERE environment_id = :ENV_ID) AS divisions,
  (SELECT count(*) FROM public.org_structure_legalentity WHERE environment_id = :ENV_ID) AS legal_entities,
  -- ── Employee Development ─────────────────────────────────────────────
  -- Learning enrollments = content-catalog enrollments (the legacy
  -- learning_items_* mirror was dropped 2026-09-30 — see header).
  (SELECT count(*) FROM public.learning_contentitemenrollment ce
     JOIN public.users_lumofyuser u ON ce.user_id = u.id
     WHERE u.environment_id = :ENV_ID) AS learning_enrollments,
  (SELECT count(*) FROM public.learning_contentitemenrollment ce
     JOIN public.users_lumofyuser u ON ce.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ce.status = 'COMPLETED') AS learning_completions,
  -- Distinct learning items the company's people have actually ENROLLED in,
  -- across every source (own-built + Lumofy library + external providers).
  -- (NOT the count of items authored in this env — that's misleadingly ~0-1
  -- for library-consuming tenants whose content lives in shared catalogs.)
  (SELECT count(DISTINCT ce.content_item_id) FROM public.learning_contentitemenrollment ce
     JOIN public.users_lumofyuser u ON ce.user_id = u.id
     WHERE u.environment_id = :ENV_ID) AS learning_items_count,
  -- The company / Lumofy / global-library breakdown of these learning
  -- enrollments is computed separately in LEARNING_SPLIT_SQL (it needs a
  -- per-enrollment classifier that's too heavy to inline here).
  -- Pathways/quizzes are scoped by the ENROLLED USER's environment, NOT the
  -- pathway/quiz's environment — so a company's usage of pathways built in the
  -- shared "Lumofy Content Team" replicator env (available to all tenants) is
  -- counted, not just pathways it authored itself. (Scoping by the entity env
  -- massively undercounts: it only sees self-authored pathways/quizzes.)
  -- pathways_count = distinct pathways the company's users are enrolled in (own + shared).
  (SELECT count(DISTINCT e.development_pathway_id) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     WHERE u.environment_id = :ENV_ID) AS pathways_count,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     WHERE u.environment_id = :ENV_ID) AS pathway_enrollments,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND e.completed_at IS NOT NULL) AS pathway_completions,
  -- Pathway company-built vs Lumofy-library split (mirrors the content split):
  -- a pathway is "company" if it was built in THIS env, else "lumofy" (authored
  -- in the shared Lumofy Content Team replicator env). No global — pathways are
  -- a platform feature, never an external marketplace item.
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id = :ENV_ID) AS pathway_company_enrollments,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id = :ENV_ID AND e.completed_at IS NOT NULL) AS pathway_company_completions,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id IS DISTINCT FROM :ENV_ID) AS pathway_lumofy_enrollments,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id IS DISTINCT FROM :ENV_ID AND e.completed_at IS NOT NULL) AS pathway_lumofy_completions,
  (SELECT count(*) FROM public.quiz_maker_quiz WHERE environment_id = :ENV_ID) AS quizzes_generated,
  -- Quiz enrollments = standalone + pathway-embedded quizzes, scoped by the
  -- enrolled user's env (own + shared). The two tables are disjoint (no shared
  -- ids), so they are summed.
  (
    (SELECT count(*) FROM public.quiz_maker_quizenrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id WHERE u.environment_id = :ENV_ID)
    + (SELECT count(*) FROM public.development_pathways_developmentpathwayquizenrollment d
       JOIN public.users_lumofyuser u ON d.user_id = u.id WHERE u.environment_id = :ENV_ID)
  ) AS quiz_enrollments,
  (
    (SELECT count(*) FROM public.quiz_maker_quizenrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id WHERE u.environment_id = :ENV_ID AND e.status = 'COMPLETED')
    + (SELECT count(*) FROM public.development_pathways_developmentpathwayquizenrollment d
       JOIN public.users_lumofyuser u ON d.user_id = u.id WHERE u.environment_id = :ENV_ID AND d.status = 'COMPLETED')
  ) AS quiz_completions,
  (SELECT count(*) FROM public.live_sessions_livesession WHERE environment_id = :ENV_ID) AS sessions_created,
  -- ── Engage (employee surveys) ────────────────────────────────────────
  -- eNPS + custom surveys. These review tables have NO environment_id (and
  -- created_by_id is null on eNPS), so they scope via the PARTICIPANT users:
  -- cycles via the cycle↔user join table, responses via the responder user.
  (SELECT count(DISTINCT cu.enpsreviewcycle_id) FROM public.reviews_enpsreviewcycle_users cu
     JOIN public.users_lumofyuser u ON cu.lumofyuser_id = u.id WHERE u.environment_id = :ENV_ID) AS enps_cycles,
  (SELECT count(*) FROM public.reviews_enpsreviewresponse rr
     JOIN public.users_lumofyuser u ON rr.user_id = u.id WHERE u.environment_id = :ENV_ID) AS enps_responses,
  (SELECT count(DISTINCT cu.customreviewcycle_id) FROM public.reviews_customreviewcycle_users cu
     JOIN public.users_lumofyuser u ON cu.lumofyuser_id = u.id WHERE u.environment_id = :ENV_ID) AS survey_cycles,
  (SELECT count(*) FROM public.reviews_customreviewresponse rr
     JOIN public.users_lumofyuser u ON rr.user_id = u.id WHERE u.environment_id = :ENV_ID) AS survey_responses,
  -- ── Talent (2 assessment types) ──────────────────────────────────────
  -- Enrollments belong to an internal user OR an external candidate (mutually
  -- exclusive owner columns). Both branches must be counted or external-candidate
  -- tenants report 0.
  (
    (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.users_lumofyuser u ON e.internal_user_id = u.id WHERE u.environment_id = :ENV_ID)
    + (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.talent_assessments_assessmentexternaluser x ON e.external_user_id = x.id WHERE x.environment_id = :ENV_ID)
  ) AS talent_assessment_enrollments,
  (
    (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.users_lumofyuser u ON e.internal_user_id = u.id WHERE u.environment_id = :ENV_ID AND e.status = 'COMPLETED')
    + (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.talent_assessments_assessmentexternaluser x ON e.external_user_id = x.id WHERE x.environment_id = :ENV_ID AND e.status = 'COMPLETED')
  ) AS talent_assessment_completed,
  (SELECT count(*) FROM public.skills_system_competencyassessment ca
     JOIN public.users_lumofyuser u ON ca.user_id = u.id
     WHERE u.environment_id = :ENV_ID) AS ai_assessment_enrollments,
  (SELECT count(*) FROM public.skills_system_competencyassessment ca
     JOIN public.users_lumofyuser u ON ca.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ca.status = 'EVALUATED') AS ai_assessment_completed,
  -- ── Performance Management ───────────────────────────────────────────
  -- performance_cycles_* only. Until 2026-09-30 this fell back to the legacy
  -- performance_management_cycle table for tenants with no newer cycles; Lumofy
  -- dropped that table upstream on 2026-09-30 (both regional DBs).
  (SELECT count(*) FROM public.performance_cycles_cycle WHERE environment_id = :ENV_ID) AS pm_cycles_configured,
  (SELECT count(DISTINCT c.id)
     FROM public.performance_cycles_cycle c
     JOIN public.performance_cycles_step s ON s.cycle_id = c.id
     JOIN public.performance_cycles_cycleend ce ON ce.step_ptr_id = s.id
    WHERE c.environment_id = :ENV_ID
      AND c.creation_status = 'PUBLISHED'
      AND ce.end_date < CURRENT_DATE) AS pm_cycles_completed,
  -- ── AI leverage & competencies ───────────────────────────────────────
  (SELECT count(*) FROM public.mappings_competence
     WHERE environment_id = :ENV_ID AND deleted_at IS NULL) AS competencies_total,
  (SELECT count(*) FROM public.mappings_competence
     WHERE environment_id = :ENV_ID AND deleted_at IS NULL
       AND ( (ai_generation_info #>> array['description']::text[])::boolean IS TRUE
          OR (ai_generation_info #>> array['levels']::text[])::boolean IS TRUE
          OR (ai_generation_info #>> array['synonyms']::text[])::boolean IS TRUE )) AS competencies_ai_generated,
  -- ai_generation_runs = competency-generation runs (mappings_competenciesaigenerationrun);
  -- ai_generation_aigenerationrun is a different (behavioral-indicator) system that was 0 for every real tenant.
  (SELECT count(*) FROM public.mappings_competenciesaigenerationrun WHERE environment_id = :ENV_ID) AS ai_generation_runs
`.trim();

/** Monthly (last 12 months) long-format series: (metric, month, value). */
export const TREND_SQL = `
SELECT metric, month::date AS month, value FROM (
  SELECT 'active_users' AS metric, date_trunc('month', ul.date) AS month, count(DISTINCT ul.user_id) AS value
    FROM public.users_userlogin ul JOIN public.users_lumofyuser u ON ul.user_id = u.id
    WHERE u.environment_id = :ENV_ID AND ul.date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 month'
      AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false
    GROUP BY 1, 2
  UNION ALL
  -- learning enrollments bucket by created_at, completions by completed_at
  SELECT 'learning_enrollments', date_trunc('month', ce.created_at), count(*)
    FROM public.learning_contentitemenrollment ce
    JOIN public.users_lumofyuser u ON ce.user_id = u.id
    WHERE u.environment_id = :ENV_ID AND ce.created_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'learning_completions', date_trunc('month', ce.completed_at), count(*)
    FROM public.learning_contentitemenrollment ce
    JOIN public.users_lumofyuser u ON ce.user_id = u.id
    WHERE u.environment_id = :ENV_ID AND ce.status = 'COMPLETED' AND ce.completed_at IS NOT NULL
      AND ce.completed_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  -- pathways scoped by enrolled user's env (own + shared replicator pathways)
  SELECT 'pathway_enrollments', date_trunc('month', e.assigned_at), count(*)
    FROM public.development_pathways_developmentpathwayenrollment e
    JOIN public.users_lumofyuser u ON e.user_id = u.id
    WHERE u.environment_id = :ENV_ID AND e.assigned_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'pathway_completions', date_trunc('month', e.completed_at), count(*)
    FROM public.development_pathways_developmentpathwayenrollment e
    JOIN public.users_lumofyuser u ON e.user_id = u.id
    WHERE u.environment_id = :ENV_ID AND e.completed_at IS NOT NULL
      AND e.completed_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  -- quiz enrollments: standalone + pathway-embedded, scoped by enrolled user's env
  SELECT 'quiz_enrollments', date_trunc('month', ts), count(*)
    FROM (
      SELECT e.created_at AS ts FROM public.quiz_maker_quizenrollment e
        JOIN public.users_lumofyuser u ON e.user_id = u.id WHERE u.environment_id = :ENV_ID
      UNION ALL
      SELECT d.created_at AS ts FROM public.development_pathways_developmentpathwayquizenrollment d
        JOIN public.users_lumofyuser u ON d.user_id = u.id WHERE u.environment_id = :ENV_ID
    ) x
    WHERE ts >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'quiz_completions', date_trunc('month', ts), count(*)
    FROM (
      SELECT e.completed_at AS ts FROM public.quiz_maker_quizenrollment e
        JOIN public.users_lumofyuser u ON e.user_id = u.id WHERE u.environment_id = :ENV_ID AND e.status = 'COMPLETED'
      UNION ALL
      SELECT d.completed_at AS ts FROM public.development_pathways_developmentpathwayquizenrollment d
        JOIN public.users_lumofyuser u ON d.user_id = u.id WHERE u.environment_id = :ENV_ID AND d.status = 'COMPLETED'
    ) x
    WHERE ts >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'sessions_created', date_trunc('month', s.created_at), count(*)
    FROM public.live_sessions_livesession s
    WHERE s.environment_id = :ENV_ID AND s.created_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  -- talent enrollments: internal users + external candidates
  SELECT 'talent_assessment_enrollments', date_trunc('month', ts), count(*)
    FROM (
      SELECT e.created_at AS ts FROM public.talent_assessments_assessmentenrollment e
        JOIN public.users_lumofyuser u ON e.internal_user_id = u.id WHERE u.environment_id = :ENV_ID
      UNION ALL
      SELECT e.created_at AS ts FROM public.talent_assessments_assessmentenrollment e
        JOIN public.talent_assessments_assessmentexternaluser x ON e.external_user_id = x.id WHERE x.environment_id = :ENV_ID
    ) x
    WHERE ts >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'ai_assessment_enrollments', date_trunc('month', ca.created_at), count(*)
    FROM public.skills_system_competencyassessment ca JOIN public.users_lumofyuser u ON ca.user_id = u.id
    WHERE u.environment_id = :ENV_ID AND ca.created_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'competencies_ai_generated', date_trunc('month', created_at), count(*)
    FROM public.mappings_competence
    WHERE environment_id = :ENV_ID AND deleted_at IS NULL
      AND ( (ai_generation_info #>> array['description']::text[])::boolean IS TRUE
         OR (ai_generation_info #>> array['levels']::text[])::boolean IS TRUE
         OR (ai_generation_info #>> array['synonyms']::text[])::boolean IS TRUE )
      AND created_at >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
) t
ORDER BY metric, month
`.trim();

/**
 * Learning-enrollment breakdown into 3 content categories + the global-library
 * provider mix. Returns long-format rows: (kind, label, enrollments, completions).
 *   kind='category' → label ∈ {company, lumofy, global}
 *   kind='provider' → label = a global-library provider (GO1 / COURSERA / EDX …)
 *
 * The 3 categories (per the product's content model):
 *   • company — courses the client built in its OWN course-builder (content_item
 *     env == this env).
 *   • lumofy  — Lumofy-curated library: DOCEBO content, and course-builder content
 *     authored in a shared "Lumofy Content Team" environment (env != this env).
 *   • global  — external marketplaces (Go1 / Coursera / edX …): content_type not
 *     in (COURSE_BUILDER, DOCEBO), which carry a NULL environment_id.
 *
 * Classification is by content_type (authoritative, on learning_contentitem).
 * (Until 2026-09-30 a second branch classified legacy learning_items_* rows by
 * source-environment name and deduped them against these by id; those tables
 * were dropped upstream — see the header.)
 */
export const LEARNING_SPLIT_SQL = `
WITH learn AS MATERIALIZED (
  SELECT ce.id, ce.content_item_id AS item_id,
    CASE WHEN ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO') THEN 'global'
         WHEN ci.content_type = 'DOCEBO' OR (ci.content_type = 'COURSE_BUILDER' AND ci.environment_id IS DISTINCT FROM :ENV_ID) THEN 'lumofy'
         ELSE 'company' END AS category,
    CASE WHEN ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO') THEN ci.content_type END AS provider,
    (ce.status = 'COMPLETED') AS completed
  FROM public.learning_contentitemenrollment ce
    JOIN public.users_lumofyuser u ON ce.user_id = u.id
    JOIN public.learning_contentitem ci ON ce.content_item_id = ci.id
  WHERE u.environment_id = :ENV_ID
)
-- 'items' = distinct learning items (courses) consumed, per category / provider.
SELECT 'category' AS kind, category AS label, count(*) AS enrollments, count(*) FILTER (WHERE completed) AS completions, count(DISTINCT item_id) AS items
  FROM learn GROUP BY category
UNION ALL
SELECT 'provider', provider, count(*), count(*) FILTER (WHERE completed), count(DISTINCT item_id)
  FROM learn WHERE category = 'global' AND provider IS NOT NULL GROUP BY provider
ORDER BY 1, 3 DESC
`.trim();

/** Existence/region probe for an environment id (run per DB). */
export const ENV_EXISTS_SQL = `SELECT count(*) AS n FROM public.environments_environment WHERE id = :ENV_ID`;

/* =========================================================================
   Usage-timeline filter — arbitrary [:RANGE_START, :RANGE_END) window queries
   (the Usage tab's week/month/quarter/year/custom filter). Every measure here
   mirrors its SNAPSHOT_SQL/TREND_SQL counterpart's exact join and exclusion
   logic verbatim, substituting the date bound for "trailing N days"/"all
   time" — so a query with RANGE == the trailing-7/30-day window it replaces
   reproduces WAU/MAU exactly (verified against live data during rollout).

   Deliberately NOT period-scoped here (left as "Current" in the UI instead):
   seats/used_licenses/total_users/active_users(flag)/job structure — no
   history is tracked for these, they're current config/state, not events;
   competencies_total — total framework size reads more naturally as current;
   enps_cycles, survey_cycles — the cycle-to-user junction tables have no date
   column of their own (only the response tables do, which ARE period-scoped
   below as enps_responses/survey_responses).
   Every field included below has a confirmed, schema-verified date column
   (verified live against Metabase 2026-07-05, in addition to what TREND_SQL
   already established).
   ========================================================================= */

/** One row of period-bounded totals — the "snapshot of this time" numbers. */
export const PERIOD_SNAPSHOT_SQL = `
SELECT
  (SELECT count(DISTINCT ul.user_id) FROM public.users_userlogin ul
     JOIN public.users_lumofyuser u ON ul.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ul.date >= :RANGE_START AND ul.date < :RANGE_END
       AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false) AS active_users,
  (SELECT count(*) FROM public.learning_contentitemenrollment ce
     JOIN public.users_lumofyuser u ON ce.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ce.created_at >= :RANGE_START AND ce.created_at < :RANGE_END) AS learning_enrollments,
  (SELECT count(*) FROM public.learning_contentitemenrollment ce
     JOIN public.users_lumofyuser u ON ce.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ce.status = 'COMPLETED'
       AND ce.completed_at >= :RANGE_START AND ce.completed_at < :RANGE_END) AS learning_completions,
  -- Distinct items with at least one enrollment CREATED within the period.
  (SELECT count(DISTINCT ce.content_item_id) FROM public.learning_contentitemenrollment ce
     JOIN public.users_lumofyuser u ON ce.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ce.created_at >= :RANGE_START AND ce.created_at < :RANGE_END) AS learning_items_count,
  (SELECT count(DISTINCT e.development_pathway_id) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND e.assigned_at >= :RANGE_START AND e.assigned_at < :RANGE_END) AS pathways_count,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND e.assigned_at >= :RANGE_START AND e.assigned_at < :RANGE_END) AS pathway_enrollments,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND e.completed_at IS NOT NULL
       AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END) AS pathway_completions,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id = :ENV_ID
       AND e.assigned_at >= :RANGE_START AND e.assigned_at < :RANGE_END) AS pathway_company_enrollments,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id = :ENV_ID AND e.completed_at IS NOT NULL
       AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END) AS pathway_company_completions,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id IS DISTINCT FROM :ENV_ID
       AND e.assigned_at >= :RANGE_START AND e.assigned_at < :RANGE_END) AS pathway_lumofy_enrollments,
  (SELECT count(*) FROM public.development_pathways_developmentpathwayenrollment e
     JOIN public.users_lumofyuser u ON e.user_id = u.id
     JOIN public.development_pathways_developmentpath p ON e.development_pathway_id = p.id
     WHERE u.environment_id = :ENV_ID AND p.environment_id IS DISTINCT FROM :ENV_ID AND e.completed_at IS NOT NULL
       AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END) AS pathway_lumofy_completions,
  (SELECT count(*) FROM public.quiz_maker_quiz
     WHERE environment_id = :ENV_ID AND created_at >= :RANGE_START AND created_at < :RANGE_END) AS quizzes_generated,
  (
    (SELECT count(*) FROM public.quiz_maker_quizenrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.created_at >= :RANGE_START AND e.created_at < :RANGE_END)
    + (SELECT count(*) FROM public.development_pathways_developmentpathwayquizenrollment d
       JOIN public.users_lumofyuser u ON d.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND d.created_at >= :RANGE_START AND d.created_at < :RANGE_END)
  ) AS quiz_enrollments,
  (
    (SELECT count(*) FROM public.quiz_maker_quizenrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.status = 'COMPLETED'
         AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END)
    + (SELECT count(*) FROM public.development_pathways_developmentpathwayquizenrollment d
       JOIN public.users_lumofyuser u ON d.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND d.status = 'COMPLETED'
         AND d.completed_at >= :RANGE_START AND d.completed_at < :RANGE_END)
  ) AS quiz_completions,
  (SELECT count(*) FROM public.live_sessions_livesession
     WHERE environment_id = :ENV_ID AND created_at >= :RANGE_START AND created_at < :RANGE_END) AS sessions_created,
  (
    (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.users_lumofyuser u ON e.internal_user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.created_at >= :RANGE_START AND e.created_at < :RANGE_END)
    + (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.talent_assessments_assessmentexternaluser x ON e.external_user_id = x.id
       WHERE x.environment_id = :ENV_ID AND e.created_at >= :RANGE_START AND e.created_at < :RANGE_END)
  ) AS talent_assessment_enrollments,
  (
    (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.users_lumofyuser u ON e.internal_user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.status = 'COMPLETED'
         AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END)
    + (SELECT count(*) FROM public.talent_assessments_assessmentenrollment e
       JOIN public.talent_assessments_assessmentexternaluser x ON e.external_user_id = x.id
       WHERE x.environment_id = :ENV_ID AND e.status = 'COMPLETED'
         AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END)
  ) AS talent_assessment_completed,
  (SELECT count(*) FROM public.skills_system_competencyassessment ca
     JOIN public.users_lumofyuser u ON ca.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ca.created_at >= :RANGE_START AND ca.created_at < :RANGE_END) AS ai_assessment_enrollments,
  (SELECT count(*) FROM public.skills_system_competencyassessment ca
     JOIN public.users_lumofyuser u ON ca.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND ca.status = 'EVALUATED'
       AND ca.completed_at >= :RANGE_START AND ca.completed_at < :RANGE_END) AS ai_assessment_completed,
  (SELECT count(*) FROM public.mappings_competence
     WHERE environment_id = :ENV_ID AND deleted_at IS NULL
       AND created_at >= :RANGE_START AND created_at < :RANGE_END) AS competencies_created,
  (SELECT count(*) FROM public.mappings_competence
     WHERE environment_id = :ENV_ID AND deleted_at IS NULL
       AND created_at >= :RANGE_START AND created_at < :RANGE_END
       AND ( (ai_generation_info #>> array['description']::text[])::boolean IS TRUE
          OR (ai_generation_info #>> array['levels']::text[])::boolean IS TRUE
          OR (ai_generation_info #>> array['synonyms']::text[])::boolean IS TRUE )) AS competencies_ai_generated,
  (SELECT count(*) FROM public.reviews_enpsreviewresponse rr
     JOIN public.users_lumofyuser u ON rr.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND rr.created_at >= :RANGE_START AND rr.created_at < :RANGE_END) AS enps_responses,
  (SELECT count(*) FROM public.reviews_customreviewresponse rr
     JOIN public.users_lumofyuser u ON rr.user_id = u.id
     WHERE u.environment_id = :ENV_ID AND rr.created_at >= :RANGE_START AND rr.created_at < :RANGE_END) AS survey_responses,
  -- PM cycles: same performance_cycles_* source as SNAPSHOT_SQL (the legacy
  -- performance_management_cycle fallback was dropped upstream 2026-09-30),
  -- period-bound. "Completed" is reinterpreted from "already past today" to
  -- "ends within this period" (performance_cycles_cycleend.end_date).
  (SELECT count(*) FROM public.performance_cycles_cycle
     WHERE environment_id = :ENV_ID AND created_at >= :RANGE_START AND created_at < :RANGE_END) AS pm_cycles_configured,
  (SELECT count(DISTINCT c.id)
     FROM public.performance_cycles_cycle c
     JOIN public.performance_cycles_step s ON s.cycle_id = c.id
     JOIN public.performance_cycles_cycleend ce ON ce.step_ptr_id = s.id
    WHERE c.environment_id = :ENV_ID
      AND c.creation_status = 'PUBLISHED'
      AND ce.end_date >= :RANGE_START AND ce.end_date < :RANGE_END) AS pm_cycles_completed
`.trim();

/** Same category/provider split as LEARNING_SPLIT_SQL, bounded to enrollments
 *  CREATED within [:RANGE_START, :RANGE_END). */
export const PERIOD_LEARNING_SPLIT_SQL = `
WITH learn AS MATERIALIZED (
  SELECT ce.id, ce.content_item_id AS item_id,
    CASE WHEN ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO') THEN 'global'
         WHEN ci.content_type = 'DOCEBO' OR (ci.content_type = 'COURSE_BUILDER' AND ci.environment_id IS DISTINCT FROM :ENV_ID) THEN 'lumofy'
         ELSE 'company' END AS category,
    CASE WHEN ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO') THEN ci.content_type END AS provider,
    (ce.status = 'COMPLETED') AS completed
  FROM public.learning_contentitemenrollment ce
    JOIN public.users_lumofyuser u ON ce.user_id = u.id
    JOIN public.learning_contentitem ci ON ce.content_item_id = ci.id
  WHERE u.environment_id = :ENV_ID AND ce.created_at >= :RANGE_START AND ce.created_at < :RANGE_END
)
SELECT 'category' AS kind, category AS label, count(*) AS enrollments, count(*) FILTER (WHERE completed) AS completions, count(DISTINCT item_id) AS items
  FROM learn GROUP BY category
UNION ALL
SELECT 'provider', provider, count(*), count(*) FILTER (WHERE completed), count(DISTINCT item_id)
  FROM learn WHERE category = 'global' AND provider IS NOT NULL GROUP BY provider
ORDER BY 1, 3 DESC
`.trim();

/** Active-user trend within [:RANGE_START, :RANGE_END), bucketed at :GRAIN
 *  ('day' | 'week' | 'month' — chosen by period length in the app layer:
 *  week/month → day, quarter → week, year → month, so the chart stays legible
 *  and hoverable at any period). Each bucket's value is its OWN distinct-user
 *  count — never a sum of finer buckets (that would double-count anyone active
 *  on more than one day), exactly like the 12-month TREND_SQL. :GRAIN is
 *  substituted with a validated literal ('day'/'week'/'month') — see index.ts,
 *  same injection-safety contract as :ENV_ID/:RANGE_*. */
export const PERIOD_TREND_SQL = `
SELECT date_trunc(:GRAIN, ul.date)::date AS bucket, count(DISTINCT ul.user_id) AS value
  FROM public.users_userlogin ul JOIN public.users_lumofyuser u ON ul.user_id = u.id
  WHERE u.environment_id = :ENV_ID AND ul.date >= :RANGE_START AND ul.date < :RANGE_END
    AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false
  GROUP BY 1
  ORDER BY 1
`.trim();
