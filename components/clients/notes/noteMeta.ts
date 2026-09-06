/* Presentation for a note's channel. The domain list lives in
   lib/notes/types.ts; this only says how each value looks and what the
   composer should ask for once it is chosen. */

import { Calendar, MessageSquare, Phone, StickyNote, type LucideIcon } from "lucide-react";
import type { NoteType } from "@/lib/notes/types";

export interface NoteTypeMeta {
  id: NoteType;
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the chip, from the status token trio. */
  chip: string;
  /** The left rule on the row. */
  stripe: string;
  /** Whether this happened at a time worth recording — a plain note did not. */
  event: boolean;
  /** Only a meeting has a synced client_meetings row to point at. */
  linkable: boolean;
}

export const NOTE_TYPE_META: NoteTypeMeta[] = [
  { id: "meeting", label: "Meeting", icon: Calendar, chip: "bg-eclipse-bg text-eclipse-fg", stripe: "bg-eclipse", event: true, linkable: true },
  { id: "call", label: "Call", icon: Phone, chip: "bg-info-bg text-info-fg", stripe: "bg-sirius", event: true, linkable: false },
  { id: "message", label: "Message", icon: MessageSquare, chip: "bg-success-bg text-success-fg", stripe: "bg-success", event: true, linkable: false },
  { id: "note", label: "Note", icon: StickyNote, chip: "bg-bg-muted text-fg-muted", stripe: "bg-border-strong", event: false, linkable: false },
];

const BY_ID = new Map(NOTE_TYPE_META.map((m) => [m.id, m]));

/** Never throws on an unexpected value — a note whose type came from anywhere
 *  but this app still has to render. */
export function noteMeta(type: string): NoteTypeMeta {
  return BY_ID.get(type as NoteType) ?? BY_ID.get("note")!;
}
