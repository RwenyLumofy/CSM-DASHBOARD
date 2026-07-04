import { cn } from "@/lib/cn";

type ProgressTone = "sirius" | "aurora" | "stellar" | "nova" | "eclipse";

const TONES: Record<ProgressTone, string> = {
  sirius: "bg-sirius",
  aurora: "bg-[#2DB47A]",
  stellar: "bg-[#C99A14]",
  nova: "bg-[#D14B6B]",
  eclipse: "bg-eclipse",
};

export function Progress({
  value,
  tone = "sirius",
  className,
}: {
  value: number; // 0–100
  tone?: ProgressTone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-pill bg-bg-muted", className)}>
      <div
        className={cn("h-full rounded-pill transition-[width] duration-[360ms] [transition-timing-function:var(--ease-standard)]", TONES[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
