import { apiError, apiJson, withApiKey } from "@/lib/api/http";
import { EXPANSION_OUTCOMES, EXPANSION_STAGES, readExpansion } from "@/lib/api/read";
import { paginate, parseList, parsePaging } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Expansion opportunities, most recently active first. Filters: stage
 *  (comma list), outcome, account_id, owner_email. */
export const GET = withApiKey(async (req) => {
  const params = new URL(req.url).searchParams;
  const paging = parsePaging(params);
  if (typeof paging === "string") return apiError(400, "invalid_parameter", paging);
  const stage = parseList(params, "stage", EXPANSION_STAGES);
  if (typeof stage === "string") return apiError(400, "invalid_parameter", stage);
  const outcome = params.get("outcome") ?? undefined;
  if (outcome && !(EXPANSION_OUTCOMES as readonly string[]).includes(outcome))
    return apiError(400, "invalid_parameter", `outcome must be one of: ${EXPANSION_OUTCOMES.join(", ")}.`);

  const rows = await readExpansion({
    stage,
    outcome,
    accountId: params.get("account_id") ?? undefined,
    ownerEmail: params.get("owner_email") ?? undefined,
  });
  return apiJson(paginate(rows, paging.limit, paging.offset));
});
