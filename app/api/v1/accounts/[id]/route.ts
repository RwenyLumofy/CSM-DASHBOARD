import { apiError, apiJson, todayUtc, withApiKey } from "@/lib/api/http";
import { readAccount } from "@/lib/api/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One account by Signal id (for HubSpot-sourced accounts, the HubSpot
 *  company id). */
export const GET = withApiKey<{ id: string }>(async (_req, { params }) => {
  const account = await readAccount(params.id, todayUtc());
  if (!account) return apiError(404, "not_found", `No account with id ${params.id}.`);
  return apiJson({ data: account });
});
