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
   - "Learning" spans TWO co-equal tables: learning_items_enrollment (authored
     items) and learning_contentitemenrollment (content catalog incl. Go1). The
     same enrollment is mirror-written to both (shared primary key), so they are
     combined with UNION (dedupe by id), never summed — a naive sum double-counts
     by up to ~67% on tenants that use both. The item catalog behaves the same
     way (learning_items_learningitem mirrors into learning_contentitem).
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
  -- Learning enrollments = UNION (dedup by id) of authored-item + content-item
  -- enrollments; the two tables mirror the same enrollment on a shared id.
  (SELECT count(*) FROM (
     SELECT e.id FROM public.learning_items_enrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.is_active = true
     UNION
     SELECT ce.id FROM public.learning_contentitemenrollment ce
       JOIN public.users_lumofyuser u ON ce.user_id = u.id
       WHERE u.environment_id = :ENV_ID
   ) x) AS learning_enrollments,
  (SELECT count(*) FROM (
     SELECT e.id FROM public.learning_items_enrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.is_active = true AND e.status = 'COMPLETED'
     UNION
     SELECT ce.id FROM public.learning_contentitemenrollment ce
       JOIN public.users_lumofyuser u ON ce.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND ce.status = 'COMPLETED'
   ) x) AS learning_completions,
  -- Distinct learning items the company's people have actually ENROLLED in,
  -- across every source (own-built + Lumofy library + external providers).
  -- (NOT the count of items authored in this env — that's misleadingly ~0-1
  -- for library-consuming tenants whose content lives in shared catalogs.)
  (SELECT count(*) FROM (
     SELECT DISTINCT ce.content_item_id::text AS item FROM public.learning_contentitemenrollment ce
       JOIN public.users_lumofyuser u ON ce.user_id = u.id WHERE u.environment_id = :ENV_ID
     UNION
     SELECT DISTINCT e.learning_item_id::text FROM public.learning_items_enrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id WHERE u.environment_id = :ENV_ID AND e.is_active = true
   ) x) AS learning_items_count,
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
  -- ── Performance Management (prefer newer table, else older) ──────────
  (SELECT CASE
     WHEN (SELECT count(*) FROM public.performance_cycles_cycle WHERE environment_id = :ENV_ID) > 0
       THEN (SELECT count(*) FROM public.performance_cycles_cycle WHERE environment_id = :ENV_ID)
     ELSE (SELECT count(*) FROM public.performance_management_cycle WHERE environment_id = :ENV_ID)
   END) AS pm_cycles_configured,
  -- Completed must read the SAME generation the configured CASE selected,
  -- else a tenant migrated to the newer system always shows 0 completed.
  (SELECT CASE
     WHEN (SELECT count(*) FROM public.performance_cycles_cycle WHERE environment_id = :ENV_ID) > 0
       THEN (SELECT count(DISTINCT c.id)
               FROM public.performance_cycles_cycle c
               JOIN public.performance_cycles_step s ON s.cycle_id = c.id
               JOIN public.performance_cycles_cycleend ce ON ce.step_ptr_id = s.id
              WHERE c.environment_id = :ENV_ID
                AND c.creation_status = 'PUBLISHED'
                AND ce.end_date < CURRENT_DATE)
     ELSE (SELECT count(*) FROM public.performance_management_cycle
             WHERE environment_id = :ENV_ID AND status IN ('ENDED', 'RELEASED'))
   END) AS pm_cycles_completed,
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
  -- learning enrollments: dedup mirrored (items|content) rows by id, bucket by created_at
  SELECT 'learning_enrollments', date_trunc('month', d), count(*)
    FROM (
      SELECT id, min(d) AS d FROM (
        SELECT e.id, e.created_at AS d FROM public.learning_items_enrollment e
          JOIN public.users_lumofyuser u ON e.user_id = u.id WHERE u.environment_id = :ENV_ID AND e.is_active = true
        UNION ALL
        SELECT ce.id, ce.created_at AS d FROM public.learning_contentitemenrollment ce
          JOIN public.users_lumofyuser u ON ce.user_id = u.id WHERE u.environment_id = :ENV_ID
      ) a GROUP BY id
    ) dedup
    WHERE d >= date_trunc('month', now()) - INTERVAL '11 month'
    GROUP BY 1, 2
  UNION ALL
  SELECT 'learning_completions', date_trunc('month', d), count(*)
    FROM (
      SELECT id, min(d) AS d FROM (
        SELECT e.id, e.completed_at AS d FROM public.learning_items_enrollment e
          JOIN public.users_lumofyuser u ON e.user_id = u.id
          WHERE u.environment_id = :ENV_ID AND e.is_active = true AND e.status = 'COMPLETED' AND e.completed_at IS NOT NULL
        UNION ALL
        SELECT ce.id, ce.completed_at AS d FROM public.learning_contentitemenrollment ce
          JOIN public.users_lumofyuser u ON ce.user_id = u.id
          WHERE u.environment_id = :ENV_ID AND ce.status = 'COMPLETED' AND ce.completed_at IS NOT NULL
      ) a GROUP BY id
    ) dedup
    WHERE d >= date_trunc('month', now()) - INTERVAL '11 month'
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
 *     env == this env), plus its own authored learning items.
 *   • lumofy  — Lumofy-curated library: DOCEBO content, and course-builder content
 *     authored in a shared "Lumofy Content Team" environment (env != this env).
 *   • global  — external marketplaces (Go1 / Coursera / edX …): content_type not
 *     in (COURSE_BUILDER, DOCEBO), which carry a NULL environment_id.
 *
 * Classification is by content_type (authoritative, on learning_contentitem).
 * Legacy enrollments that live ONLY in the old learning_items table (no content
 * catalog row, no content_type) are classified by their source ENVIRONMENT name:
 * a "Go1 …" env (or a null source env) = global; any other non-own env = Lumofy;
 * the client's own env = company. A MATERIALIZED CTE dedupes the two enrollment
 * tables by id (they mirror each other) so nothing is double-counted; priority
 * global > lumofy > company resolves any mixed signal on a shared id.
 */
export const LEARNING_SPLIT_SQL = `
WITH learn AS MATERIALIZED (
  SELECT id,
    CASE WHEN bool_or(is_global) THEN 'global' WHEN bool_or(is_lumofy) THEN 'lumofy' ELSE 'company' END AS category,
    COALESCE(max(provider) FILTER (WHERE from_content AND provider IS NOT NULL), max(provider)) AS provider,
    max(item_id::text) AS item_id,
    bool_or(completed) AS completed
  FROM (
    -- Modern content-catalog enrollments (authoritative content_type)
    SELECT ce.id, true AS from_content, ce.content_item_id AS item_id,
      (ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO')) AS is_global,
      (ci.content_type = 'DOCEBO' OR (ci.content_type = 'COURSE_BUILDER' AND ci.environment_id IS DISTINCT FROM :ENV_ID)) AS is_lumofy,
      CASE WHEN ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO') THEN ci.content_type END AS provider,
      (ce.status = 'COMPLETED') AS completed
    FROM public.learning_contentitemenrollment ce
      JOIN public.users_lumofyuser u ON ce.user_id = u.id
      JOIN public.learning_contentitem ci ON ce.content_item_id = ci.id
    WHERE u.environment_id = :ENV_ID
    UNION ALL
    -- Legacy authored-item enrollments (no content_type → classify by source env)
    SELECT e.id, false AS from_content, e.learning_item_id AS item_id,
      (ev.name_en_us ILIKE '%Go1%' OR li.environment_id IS NULL) AS is_global,
      (li.environment_id IS DISTINCT FROM :ENV_ID AND NOT (ev.name_en_us ILIKE '%Go1%' OR li.environment_id IS NULL)) AS is_lumofy,
      CASE WHEN (ev.name_en_us ILIKE '%Go1%' OR li.environment_id IS NULL) THEN 'GO1' END AS provider,
      (e.status = 'COMPLETED') AS completed
    FROM public.learning_items_enrollment e
      JOIN public.users_lumofyuser u ON e.user_id = u.id
      JOIN public.learning_items_learningitem li ON e.learning_item_id = li.id
      LEFT JOIN public.environments_environment ev ON li.environment_id = ev.id
    WHERE u.environment_id = :ENV_ID AND e.is_active = true
  ) rows GROUP BY id
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
  (SELECT count(*) FROM (
     SELECT e.id FROM public.learning_items_enrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.is_active = true
         AND e.created_at >= :RANGE_START AND e.created_at < :RANGE_END
     UNION
     SELECT ce.id FROM public.learning_contentitemenrollment ce
       JOIN public.users_lumofyuser u ON ce.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND ce.created_at >= :RANGE_START AND ce.created_at < :RANGE_END
   ) x) AS learning_enrollments,
  (SELECT count(*) FROM (
     SELECT e.id FROM public.learning_items_enrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.is_active = true AND e.status = 'COMPLETED'
         AND e.completed_at >= :RANGE_START AND e.completed_at < :RANGE_END
     UNION
     SELECT ce.id FROM public.learning_contentitemenrollment ce
       JOIN public.users_lumofyuser u ON ce.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND ce.status = 'COMPLETED'
         AND ce.completed_at >= :RANGE_START AND ce.completed_at < :RANGE_END
   ) x) AS learning_completions,
  -- Distinct items with at least one enrollment CREATED within the period.
  (SELECT count(*) FROM (
     SELECT DISTINCT ce.content_item_id::text AS item FROM public.learning_contentitemenrollment ce
       JOIN public.users_lumofyuser u ON ce.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND ce.created_at >= :RANGE_START AND ce.created_at < :RANGE_END
     UNION
     SELECT DISTINCT e.learning_item_id::text FROM public.learning_items_enrollment e
       JOIN public.users_lumofyuser u ON e.user_id = u.id
       WHERE u.environment_id = :ENV_ID AND e.is_active = true
         AND e.created_at >= :RANGE_START AND e.created_at < :RANGE_END
   ) x) AS learning_items_count,
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
  -- PM cycles: same newer/legacy branch-selector as SNAPSHOT_SQL (an account-
  -- level, not period-level, fact — whichever system has ANY rows lifetime is
  -- the one in use), but each branch's own COUNT is period-bound. "Completed"
  -- is reinterpreted from "already past today" to "ends within this period"
  -- (newer: performance_cycles_cycleend.end_date) or the legacy table's own
  -- ended_at, both schema-verified.
  (SELECT CASE
     WHEN (SELECT count(*) FROM public.performance_cycles_cycle WHERE environment_id = :ENV_ID) > 0
       THEN (SELECT count(*) FROM public.performance_cycles_cycle
               WHERE environment_id = :ENV_ID AND created_at >= :RANGE_START AND created_at < :RANGE_END)
     ELSE (SELECT count(*) FROM public.performance_management_cycle
             WHERE environment_id = :ENV_ID AND created_at >= :RANGE_START AND created_at < :RANGE_END)
   END) AS pm_cycles_configured,
  (SELECT CASE
     WHEN (SELECT count(*) FROM public.performance_cycles_cycle WHERE environment_id = :ENV_ID) > 0
       THEN (SELECT count(DISTINCT c.id)
               FROM public.performance_cycles_cycle c
               JOIN public.performance_cycles_step s ON s.cycle_id = c.id
               JOIN public.performance_cycles_cycleend ce ON ce.step_ptr_id = s.id
              WHERE c.environment_id = :ENV_ID
                AND c.creation_status = 'PUBLISHED'
                AND ce.end_date >= :RANGE_START AND ce.end_date < :RANGE_END)
     ELSE (SELECT count(*) FROM public.performance_management_cycle
             WHERE environment_id = :ENV_ID AND status IN ('ENDED', 'RELEASED')
               AND ended_at >= :RANGE_START AND ended_at < :RANGE_END)
   END) AS pm_cycles_completed
`.trim();

/** Same category/provider split as LEARNING_SPLIT_SQL, bounded to enrollments
 *  CREATED within [:RANGE_START, :RANGE_END) — added at each source branch,
 *  before the dedup CTE, so the same-id dedup/classification logic is
 *  untouched. */
export const PERIOD_LEARNING_SPLIT_SQL = `
WITH learn AS MATERIALIZED (
  SELECT id,
    CASE WHEN bool_or(is_global) THEN 'global' WHEN bool_or(is_lumofy) THEN 'lumofy' ELSE 'company' END AS category,
    COALESCE(max(provider) FILTER (WHERE from_content AND provider IS NOT NULL), max(provider)) AS provider,
    max(item_id::text) AS item_id,
    bool_or(completed) AS completed
  FROM (
    SELECT ce.id, true AS from_content, ce.content_item_id AS item_id,
      (ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO')) AS is_global,
      (ci.content_type = 'DOCEBO' OR (ci.content_type = 'COURSE_BUILDER' AND ci.environment_id IS DISTINCT FROM :ENV_ID)) AS is_lumofy,
      CASE WHEN ci.content_type NOT IN ('COURSE_BUILDER','DOCEBO') THEN ci.content_type END AS provider,
      (ce.status = 'COMPLETED') AS completed
    FROM public.learning_contentitemenrollment ce
      JOIN public.users_lumofyuser u ON ce.user_id = u.id
      JOIN public.learning_contentitem ci ON ce.content_item_id = ci.id
    WHERE u.environment_id = :ENV_ID AND ce.created_at >= :RANGE_START AND ce.created_at < :RANGE_END
    UNION ALL
    SELECT e.id, false AS from_content, e.learning_item_id AS item_id,
      (ev.name_en_us ILIKE '%Go1%' OR li.environment_id IS NULL) AS is_global,
      (li.environment_id IS DISTINCT FROM :ENV_ID AND NOT (ev.name_en_us ILIKE '%Go1%' OR li.environment_id IS NULL)) AS is_lumofy,
      CASE WHEN (ev.name_en_us ILIKE '%Go1%' OR li.environment_id IS NULL) THEN 'GO1' END AS provider,
      (e.status = 'COMPLETED') AS completed
    FROM public.learning_items_enrollment e
      JOIN public.users_lumofyuser u ON e.user_id = u.id
      JOIN public.learning_items_learningitem li ON e.learning_item_id = li.id
      LEFT JOIN public.environments_environment ev ON li.environment_id = ev.id
    WHERE u.environment_id = :ENV_ID AND e.is_active = true
      AND e.created_at >= :RANGE_START AND e.created_at < :RANGE_END
  ) rows GROUP BY id
)
SELECT 'category' AS kind, category AS label, count(*) AS enrollments, count(*) FILTER (WHERE completed) AS completions, count(DISTINCT item_id) AS items
  FROM learn GROUP BY category
UNION ALL
SELECT 'provider', provider, count(*), count(*) FILTER (WHERE completed), count(DISTINCT item_id)
  FROM learn WHERE category = 'global' AND provider IS NOT NULL GROUP BY provider
ORDER BY 1, 3 DESC
`.trim();

/** Daily active-user series within [:RANGE_START, :RANGE_END) — the period
 *  filter's trend chart. Re-bucketed to week/month in the app layer for
 *  quarter/year views; each day's distinct-user count is exact as-is (unlike
 *  the scalar active_users total above, per-day counts are never summed to
 *  produce a period total — that would double-count anyone active on more
 *  than one day). */
export const PERIOD_TREND_SQL = `
SELECT date_trunc('day', ul.date)::date AS day, count(DISTINCT ul.user_id) AS value
  FROM public.users_userlogin ul JOIN public.users_lumofyuser u ON ul.user_id = u.id
  WHERE u.environment_id = :ENV_ID AND ul.date >= :RANGE_START AND ul.date < :RANGE_END
    AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false
  GROUP BY 1
  ORDER BY 1
`.trim();
