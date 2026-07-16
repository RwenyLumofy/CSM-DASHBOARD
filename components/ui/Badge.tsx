import { cn } from "@/lib/cn";

export type BadgeTone = "sirius" | "aurora" | "stellar" | "nova" | "eclipse" | "cosmos" | "halo" | "neutral";

/* Tone → the semantic status token trio (see globals.css "Status"). These were
   hardcoded light-mode hex, which [data-theme="dark"] cannot re-theme — so
   every Badge stayed on a pale mint/pink chip on the dark canvas. Routing them
   through the tokens fixes dark mode and keeps one source of truth for the
   colours. Rendering is unchanged in light mode: the token values ARE the hex
   that used to be inlined here. */
const TONES: Record<BadgeTone, string> = {
  sirius: "bg-info-bg text-info-fg",
  aurora: "bg-success-bg text-success-fg",
  stellar: "bg-warning-bg text-warning-fg",
  nova: "bg-danger-bg text-danger-fg",
  eclipse: "bg-eclipse-bg text-eclipse-fg",
  cosmos: "bg-cosmos text-white",
  halo: "bg-halo text-cosmos",
  neutral: "bg-bg-muted text-fg-muted",
};

const DOTS: Record<BadgeTone, string> = {
  sirius: "bg-info",
  aurora: "bg-success",
  stellar: "bg-warning",
  nova: "bg-danger",
  eclipse: "bg-eclipse",
  cosmos: "bg-white",
  halo: "bg-neutral-500",
  neutral: "bg-neutral-500",
};

export function Badge({
  tone = "sirius",
  dot = false,
  children,
  className,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-body text-[11px] font-semibold leading-none",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-pill", DOTS[tone])} />}
      {children}
    </span>
  );
}
