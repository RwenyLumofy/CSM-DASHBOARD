/* Resolve the signed-in user as an "actor" (email + display name) for stamping
   authorship on things like saved templates. Kept out of the action file so it
   can be reused by the Settings template actions too. */

import "server-only";
import { getCurrentUserEmail } from "@/lib/auth";
import { getAppUsers } from "@/lib/data";

export async function getCurrentActor(): Promise<{ email: string | null; name: string | null }> {
  const email = await getCurrentUserEmail();
  if (!email) return { email: null, name: null };
  try {
    const users = await getAppUsers();
    const u = users.find((x) => x.email.toLowerCase() === email);
    return { email, name: u?.name ?? null };
  } catch {
    return { email, name: null };
  }
}
