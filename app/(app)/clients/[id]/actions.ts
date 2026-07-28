"use server";

import { revalidatePath } from "next/cache";
import { recordArrEvent } from "@/lib/data";
import { denyClientWrite } from "@/lib/auth";
import type { ArrEventInput } from "@/lib/types";

/** Record an in-app ARR change (renewal / expansion / contraction / churn).
 *
 *  Gated on canEditClient. recordArrEvent only ever checked visibility
 *  (getClientById -> canSeeClient), so the read-only `guest` tier could write
 *  ARR events — the most commercially sensitive mutation on the profile. */
export async function recordArrAction(input: ArrEventInput): Promise<{ ok: boolean; error?: string }> {
  const denied = await denyClientWrite(input.clientId);
  if (denied) return { ok: false, error: denied };
  try {
    await recordArrEvent(input);
    revalidatePath(`/clients/${input.clientId}`);
    revalidatePath("/clients");
    revalidatePath("/reports");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
