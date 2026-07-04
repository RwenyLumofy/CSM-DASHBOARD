import { cn } from "@/lib/cn";

type AvatarTone = "sirius" | "aurora" | "nova" | "eclipse" | "stellar";

const TONES: Record<AvatarTone, string> = {
  sirius: "bg-sirius",
  aurora: "bg-[#2DB47A]",
  nova: "bg-[#D14B6B]",
  eclipse: "bg-eclipse",
  stellar: "bg-[#C99A14]",
};

/** Deterministically pick a tone from a string so avatars are stable. */
export function toneForKey(key: string): AvatarTone {
  const tones: AvatarTone[] = ["sirius", "aurora", "nova", "eclipse", "stellar"];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

export function Avatar({
  initials,
  size = 36,
  tone,
}: {
  initials: string;
  size?: number;
  tone?: AvatarTone;
}) {
  const resolved = tone ?? toneForKey(initials);
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-pill font-display font-semibold text-white", TONES[resolved])}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
    >
      {initials}
    </div>
  );
}
