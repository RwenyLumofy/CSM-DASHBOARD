import { apiError, apiJson, todayUtc, withApiKey } from "@/lib/api/http";
import { readAccounts } from "@/lib/api/read";
import { filterAccounts, paginate, parsePaging } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-churned accounts whose renewal date falls in the next `within_days`
 *  (default 90), soonest first. Overdue renewals are not included. */
export const GET = withApiKey(async (req) => {
  const params = new URL(req.url).searchParams;
  const paging = parsePaging(params);
  if (typeof paging === "string") return apiError(400, "invalid_parameter", paging);
  const days = params.get("within_days") == null ? 90 : Number(params.get("within_days"));
  if (!Number.isInteger(days) || days < 0 || days > 3650)
    return apiError(400, "invalid_parameter", "within_days must be an integer from 0 to 3650.");

  const accounts = filterAccounts(await readAccounts(todayUtc()), {
    renewingWithinDays: days,
    csmEmail: params.get("csm_email") ?? undefined,
  }).sort((a, b) => (a.days_to_renewal ?? 0) - (b.days_to_renewal ?? 0));
  return apiJson(paginate(accounts, paging.limit, paging.offset));
});
