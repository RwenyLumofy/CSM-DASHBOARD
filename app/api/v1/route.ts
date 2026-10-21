import { apiJson, withApiKey } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection check: confirms the key works and lists what it can read. */
export const GET = withApiKey(async (_req, { caller }) =>
  apiJson({
    api: "signal",
    version: "v1",
    key: { name: caller.keyName },
    endpoints: [
      "GET /api/v1/accounts",
      "GET /api/v1/accounts/{id}",
      "GET /api/v1/renewals",
      "GET /api/v1/tasks",
      "GET /api/v1/expansion",
    ],
    docs: "docs/product/integrations/api-v1.md",
  }),
);
