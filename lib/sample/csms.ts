import type { Csm } from "@/lib/types";

/**
 * CSMs keyed by the HubSpot `csm` property value (user IDs).
 * These are real Lumofy CSMs from HubSpot. The live sync replaces
 * these with actual owner names via the owners API.
 */
export const SAMPLE_CSMS: Record<string, Csm> = {
  "76961168": { id: "76961168", name: "Batool Momani", email: "bmomani@lumofy.com", initials: "BM" },
  "79667619": { id: "79667619", name: "Ali Abbas", email: "aabbas@lumofy.com", initials: "AA" },
  "83083504": { id: "83083504", name: "Zainab Ali", email: "zali@lumofy.com", initials: "ZA" },
  "92324750": { id: "92324750", name: "Sakina Asghar", email: "sasghar@lumofy.com", initials: "SA" },
};

export function csmById(id: string | null | undefined): Csm | null {
  if (!id) return null;
  return SAMPLE_CSMS[id] ?? null;
}
