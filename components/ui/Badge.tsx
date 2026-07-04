import { cn } from "@/lib/cn";

export type BadgeTone = "sirius" | "aurora" | "stellar" | "nova" | "eclipse" | "cosmos" | "halo" | "neutral";

const TONES: Record<BadgeTone, string> = {
  sirius: "bg-sirius-50 text-sirius-600",
  aurora: "bg-[#E6F9EF] text-[#1E8F61]",
  stellar: "bg-[#FBF6E0] text-[#8A6A0A]",
  nova: "bg-[#FBE7ED] text-[#B23A57]",
  eclipse: "bg-[#F0E6FF] text-[#6E3FCC]",
  cosmos: "bg-cosmos text-white",
  halo: "bg-halo text-cosmos",
  neutral: "bg-bg-muted text-fg-muted",
};

const DOTS: Record<BadgeTone, string> = {
  sirius: "bg-sirius",
  aurora: "bg-[#2DB47A]",
  stellar: "bg-[#C99A14]",
  nova: "bg-[#D14B6B]",
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
