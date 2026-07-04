"use server";

import { revalidatePath } from "next/cache";
import { recordArrEvent } from "@/lib/data";
import type { ArrEventInput } from "@/lib/types";

/** Record an in-app ARR change (renewal / expansion / contraction / churn). */
export async function recordArrAction(input: ArrEventInput): Promise<{ ok: boolean; error?: string }> {
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
