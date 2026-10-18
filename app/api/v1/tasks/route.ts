import { apiError, apiJson, withApiKey } from "@/lib/api/http";
import { readTasks, TASK_STATUSES } from "@/lib/api/read";
import { paginate, parsePaging } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tasks linked to an account, earliest due first. Filters: status (open | done),
 *  account_id, owner_email. */
export const GET = withApiKey(async (req) => {
  const params = new URL(req.url).searchParams;
  const paging = parsePaging(params);
  if (typeof paging === "string") return apiError(400, "invalid_parameter", paging);
  const status = params.get("status") ?? undefined;
  if (status && !(TASK_STATUSES as readonly string[]).includes(status))
    return apiError(400, "invalid_parameter", `status must be one of: ${TASK_STATUSES.join(", ")}.`);

  const tasks = await readTasks({
    status,
    accountId: params.get("account_id") ?? undefined,
    ownerEmail: params.get("owner_email") ?? undefined,
  });
  return apiJson(paginate(tasks, paging.limit, paging.offset));
});
