import Image from "next/image";
import { cn } from "@/lib/cn";

type LogoKind = "primary-horizontal" | "primary-vertical" | "mark" | "mono-horizontal" | "mono-vertical";

const SRC: Record<LogoKind, { src: string; w: number; h: number }> = {
  "primary-horizontal": { src: "/brand/logo-primary-horizontal.png", w: 480, h: 132 },
  "primary-vertical": { src: "/brand/logo-primary-vertical.png", w: 320, h: 320 },
  mark: { src: "/brand/logo-mono-vertical-black.png", w: 320, h: 320 },
  "mono-horizontal": { src: "/brand/logo-mono-horizontal-white.png", w: 480, h: 132 },
  "mono-vertical": { src: "/brand/logo-mono-vertical-white.png", w: 320, h: 320 },
};

/** Renders an official Lumofy lockup. Height drives size; width is auto. */
export function Logo({ kind = "primary-horizontal", height = 26, className }: { kind?: LogoKind; height?: number; className?: string }) {
  const { src, w, h } = SRC[kind];
  return (
    <Image
      src={src}
      alt="Lumofy"
      width={w}
      height={h}
      priority
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}
