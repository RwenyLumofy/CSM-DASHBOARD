import { apiError, apiJson, todayUtc, withApiKey } from "@/lib/api/http";
import { readAccounts } from "@/lib/api/read";
import { filterAccounts, paginate, parseList, parsePaging } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["onboarding", "active", "renewal", "churned"] as const;
const SEGMENTS = ["enterprise", "mid_market", "smb"] as const;

/** Every account, sorted by name. Filters: status, segment (comma lists),
 *  csm_email, health_tier, renewing_within_days, q (name/domain). */
export const GET = withApiKey(async (req) => {
  const params = new URL(req.url).searchParams;
  const paging = parsePaging(params);
  if (typeof paging === "string") return apiError(400, "invalid_parameter", paging);
  const status = parseList(params, "status", STATUSES);
  if (typeof status === "string") return apiError(400, "invalid_parameter", status);
  const segment = parseList(params, "segment", SEGMENTS);
  if (typeof segment === "string") return apiError(400, "invalid_parameter", segment);

  let renewingWithinDays: number | undefined;
  const rawDays = params.get("renewing_within_days");
  if (rawDays != null) {
    renewingWithinDays = Number(rawDays);
    if (!Number.isInteger(renewingWithinDays) || renewingWithinDays < 0 || renewingWithinDays > 3650)
      return apiError(400, "invalid_parameter", "renewing_within_days must be an integer from 0 to 3650.");
  }

  const accounts = filterAccounts(await readAccounts(todayUtc()), {
    status,
    segment,
    csmEmail: params.get("csm_email") ?? undefined,
    healthTier: params.get("health_tier") ?? undefined,
    renewingWithinDays,
    q: params.get("q") ?? undefined,
  });
  return apiJson(paginate(accounts, paging.limit, paging.offset));
});
