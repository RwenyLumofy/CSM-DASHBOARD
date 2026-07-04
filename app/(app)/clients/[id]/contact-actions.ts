"use server";

/* Manual contact entry from the client profile — any user who can view the
   client may add one. These never carry a hubspotContactId, so a later
   HubSpot sync never touches, overwrites, or removes them. */

import { getClientById, addManualContact, removeManualContact } from "@/lib/data";
import type { Contact } from "@/lib/types";

export interface ContactActionResult {
  ok: boolean;
  error?: string;
}

async function guard(clientId: string): Promise<ContactActionResult | null> {
  const client = await getClientById(clientId);
  if (!client) return { ok: false, error: "Not found or you don't have access to this account." };
  return null;
}

export async function addContactAction(
  clientId: string,
  input: { firstName: string; lastName: string; email: string; phone: string; jobTitle: string },
): Promise<ContactActionResult & { contact?: Contact }> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  if (!firstName && !lastName && !email) {
    return { ok: false, error: "Enter at least a name or an email." };
  }
  try {
    const contact = await addManualContact({
      clientId,
      firstName: firstName || null,
      lastName: lastName || null,
      email: email || null,
      phone: input.phone.trim() || null,
      jobTitle: input.jobTitle.trim() || null,
    });
    return { ok: true, contact };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteContactAction(clientId: string, contactId: string): Promise<ContactActionResult> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  try {
    await removeManualContact(clientId, contactId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
