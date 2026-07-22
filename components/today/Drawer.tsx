"use client";

/* Today page — reusable right-side drawer shell. Mirrors Signal's existing
   drawer pattern (fixed overlay + right panel) with focus handling: focus moves
   in on open, Esc closes, focus returns to the trigger on close. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/cn";

const DEFAULT_PX: Record<"md" | "lg" | "xl", number> = { md: 440, lg: 560, xl: 720 };
const MIN_PX = 380;
const clampMax = () => Math.min(1100, (typeof window !== "undefined" ? window.innerWidth : 1200) - 32);

export function Drawer({ title, subtitle, eyebrow, onClose, children, footer, width = "lg", headerAccessory, resizable = false }: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg" | "xl";
  headerAccessory?: ReactNode;
  /** When true, the panel gets a left-edge drag handle + expand toggle. */
  resizable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // null until the client mounts (avoids SSR width mismatch); then px width.
  const [w, setW] = useState<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  useEffect(() => { if (resizable) setW((cur) => cur ?? DEFAULT_PX[width]); }, [resizable, width]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      setW(Math.min(Math.max(window.innerWidth - ev.clientX, MIN_PX), clampMax()));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const isWide = resizable && w != null && w > DEFAULT_PX[width] + 40;
  const toggleWide = () => setW(isWide ? DEFAULT_PX[width] : clampMax());

  const widthCls = width === "xl" ? "sm:w-[720px]" : width === "md" ? "sm:w-[440px]" : "sm:w-[560px]";

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="pm-overlay-in absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        className={cn("pm-slide-in relative flex h-full w-full flex-col bg-surface shadow-2xl", !(resizable && w) && widthCls)}
        style={resizable && w ? { width: w, maxWidth: "100vw" } : undefined}>
        {resizable && (
          <div onPointerDown={startDrag} onDoubleClick={toggleWide} role="separator" aria-orientation="vertical" aria-label="Resize drawer" title="Drag to resize · double-click to expand"
            className="group absolute inset-y-0 left-0 z-10 hidden w-2 cursor-ew-resize sm:block">
            <div className="absolute inset-y-0 left-0 w-0.5 bg-transparent transition-colors group-hover:bg-sirius/60" />
          </div>
        )}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="mb-1 font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">{eyebrow}</div>}
            <div className="font-display text-[17px] font-semibold text-fg">{title}</div>
            {subtitle && <div className="mt-0.5 font-body text-[12.5px] text-fg-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerAccessory}
            {resizable && (
              <button onClick={toggleWide} aria-label={isWide ? "Collapse width" : "Expand width"} title={isWide ? "Collapse" : "Expand"} className="hidden size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg sm:grid">
                {isWide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
