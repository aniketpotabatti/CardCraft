import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Minus, Plus, Maximize } from "lucide-react";

interface ZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  className?: string;
}

const PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function ZoomControl({ zoom, onZoomChange, className = "" }: ZoomControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const currentPercent = Math.round(zoom * 100);

  return (
    <div ref={containerRef} className={`relative flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Canvas zoom settings"
        aria-label={`Canvas zoom ${currentPercent}%`}
        className="flex h-6 items-center gap-1 rounded-md border border-[var(--border-base)] bg-[var(--bg-surface)] px-1.5 text-[10px] font-mono font-medium text-[var(--text-secondary)] shadow-xs transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        <span className="tabular-nums">{currentPercent}%</span>
        <ChevronDown className={`size-3 text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Zoom presets"
          className="ui-popover absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-1 text-xs text-[var(--text-main)] shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="grid gap-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onZoomChange(Math.min(3, Number((zoom + 0.1).toFixed(1))));
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="size-3 text-[var(--text-muted)]" /> Zoom in
              </span>
              <kbd className="text-[9px] font-mono text-[var(--text-muted)]">+</kbd>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onZoomChange(Math.max(0.2, Number((zoom - 0.1).toFixed(1))));
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
            >
              <span className="flex items-center gap-1.5">
                <Minus className="size-3 text-[var(--text-muted)]" /> Zoom out
              </span>
              <kbd className="text-[9px] font-mono text-[var(--text-muted)]">-</kbd>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onZoomChange(1.0);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
            >
              <span className="flex items-center gap-1.5">
                <Maximize className="size-3 text-[var(--text-muted)]" /> Zoom to 100%
              </span>
              <kbd className="text-[9px] font-mono text-[var(--text-muted)]">100%</kbd>
            </button>
          </div>

          <div className="my-1 border-t border-[var(--border-base)]" />

          <div className="grid gap-0.5">
            {PRESETS.map((preset) => {
              const presetPercent = Math.round(preset * 100);
              const isSelected = Math.abs(zoom - preset) < 0.04;
              return (
                <button
                  key={preset}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onZoomChange(preset);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] transition ${
                    isSelected
                      ? "bg-sky-500/10 font-semibold text-sky-600 dark:text-sky-400"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <span>{presetPercent}%</span>
                  {isSelected && <Check className="size-3 text-sky-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

