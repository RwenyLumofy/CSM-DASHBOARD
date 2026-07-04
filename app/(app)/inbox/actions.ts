"use server";

/* Inbox / notifications mutations — all scoped server-side to the signed-in
   user's email, so a user can only touch their own notifications. */

import { markAllNotificationsRead, markNotificationRead, setActionItemStatus } from "@/lib/data";

export async function markReadAction(id: string): Promise<{ ok: boolean }> {
  try {
    await markNotificationRead(id);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function markAllReadAction(): Promise<{ ok: boolean }> {
  try {
    await markAllNotificationsRead();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function resolveActionAction(id: string): Promise<{ ok: boolean }> {
  try {
    await setActionItemStatus(id, "done");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function reopenActionAction(id: string): Promise<{ ok: boolean }> {
  try {
    await setActionItemStatus(id, "open");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
