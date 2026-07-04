import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a subtle hover lift (for clickable cards). */
  interactive?: boolean;
  padded?: boolean;
}

/** The dominant compositional unit: surface + 1px border + 16px radius. */
export function Card({ interactive = false, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-sm transition-all duration-[140ms] [transition-timing-function:var(--ease-standard)]",
        padded && "p-6",
        interactive && "hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow mb-3">{children}</div>;
}
