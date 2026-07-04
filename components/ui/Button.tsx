import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "dark";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sirius text-white border border-sirius hover:bg-accent-hover active:bg-accent-pressed",
  secondary: "bg-transparent text-fg border border-border-strong hover:bg-accent-soft hover:border-sirius-200",
  ghost: "bg-transparent text-sirius border border-transparent hover:bg-accent-soft",
  dark: "bg-cosmos text-white border border-cosmos hover:bg-neutral-800",
};

const SIZES: Record<Size, string> = {
  sm: "px-3.5 py-2 text-[13px] rounded-[10px] gap-1.5",
  md: "px-[18px] py-[11px] text-sm rounded-md gap-2",
  lg: "px-6 py-3.5 text-[15px] rounded-[14px] gap-2",
};

const ICON_SIZE: Record<Size, number> = { sm: 16, md: 18, lg: 19 };

interface BaseProps {
  variant?: Variant;
  size?: Size;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ButtonProps = BaseProps &
  (
    | ({ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  );

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", iconLeft: IconLeft, iconRight: IconRight, fullWidth, className, children, ...rest } = props;
  const cls = cn(
    "inline-flex items-center justify-center font-body font-semibold cursor-pointer whitespace-nowrap transition-all duration-[140ms] [transition-timing-function:var(--ease-standard)] disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
  const iconSize = ICON_SIZE[size];
  const inner = (
    <>
      {IconLeft && <IconLeft size={iconSize} strokeWidth={1.75} />}
      {children}
      {IconRight && <IconRight size={iconSize} strokeWidth={1.75} />}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const { href, ...anchorRest } = rest as React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    return (
      <Link href={props.href} className={cls} {...anchorRest}>
        {inner}
      </Link>
    );
  }

  return (
    <button className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  );
}
