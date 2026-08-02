"use server";

/* Inbox / notifications mutations — all scoped server-side to the signed-in
   user's email, so a user can only touch their own notifications. */

import {
  getMyNotifications, getMyUnreadCount,
  markAllNotificationsRead, markNotificationRead, setActionItemStatus,
} from "@/lib/data";
import type { Notification } from "@/lib/types";

/**
 * The bell's own read, so it can catch up without a page navigation.
 *
 * Notifications were server-rendered once per navigation, which meant somebody
 * sitting on an account page for an hour never saw that they had been mentioned
 * — the badge only moved when they happened to click elsewhere. Both values
 * come from the same call so the count and the list cannot disagree.
 *
 * Already scoped to the signed-in user inside lib/data; there is no caller-
 * supplied email to spoof.
 */
export async function pollNotificationsAction(): Promise<{ items: Notification[]; unread: number }> {
  try {
    const [items, unread] = await Promise.all([getMyNotifications(20), getMyUnreadCount()]);
    return { items, unread };
  } catch {
    // A failed poll must leave the bell showing what it already had rather than
    // blanking it — an empty list reads as "you're all caught up", which is a
    // lie the user would act on.
    return { items: [], unread: -1 };
  }
}

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
