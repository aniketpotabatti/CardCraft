import { beginSliderDrag, applySliderChange } from "../model/slider-history";
import * as Slider from "@radix-ui/react-slider";
import { type ReactNode } from "react";

interface FigmaScrubberProps {
  label?: string;
  icon?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  className?: string;
  disabled?: boolean;
  allowNumericEntry?: boolean;
}

export function FigmaScrubber({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  className = "",
  disabled = false,
  allowNumericEntry = false,
}: FigmaScrubberProps) {
  const displayVal = step < 1 ? Number(value.toFixed(2)) : Math.round(value);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {(label || icon) && (
        <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
          <div className="flex items-center gap-1.5">
            {icon && <span className="text-[var(--text-secondary)]">{icon}</span>}
            {label && <span>{label}</span>}
          </div>
          {allowNumericEntry ? <label className="flex items-center gap-1 text-xs tabular-nums text-[var(--text-main)]">
            <input key={value} type="number" aria-label={label} min={min} step="any"
              disabled={disabled} defaultValue={value}
              className="w-16 rounded border border-[var(--border-base)] bg-[var(--bg-input)] px-1 text-right focus-visible:outline-[var(--focus-ring)]"
              onBlur={({ currentTarget }) => {
                const next = currentTarget.valueAsNumber;
                if (Number.isFinite(next) && next >= min && next !== value) onChange(next);
                else currentTarget.value = String(value);
              }}
              onKeyDown={event => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  event.currentTarget.value = String(value);
                  event.currentTarget.blur();
                } else if (event.key === "Enter") event.currentTarget.blur();
              }} />
            {unit}
          </label> : <span className="tabular-nums font-mono text-xs text-[var(--text-main)]">
            {displayVal}
            {unit}
          </span>}
        </div>
      )}
      <div className={`group relative flex h-7 items-center rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-2 transition-colors hover:border-[var(--border-strong)] ${disabled ? "opacity-[var(--disabled-opacity)] pointer-events-none" : ""}`}>
        <Slider.Root
          onPointerDownCapture={beginSliderDrag}
          className="relative flex h-5 w-full touch-none select-none items-center"
          value={[Math.min(value, max)]}
          min={min}
          max={max}
          disabled={disabled}
          step={step}
          onValueChange={([next]) => applySliderChange(() => onChange(next))}
        >
          <Slider.Track className={`relative h-1.5 grow rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden ${disabled ? "opacity-[var(--disabled-opacity)]" : ""}`}>
            <Slider.Range className="absolute h-full bg-[var(--border-focus)] rounded-full" />
          </Slider.Track>
          <Slider.Thumb
            className={`block size-3.5 rounded-full bg-white shadow-md ring-1 ring-black/20 transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${disabled ? "opacity-[var(--disabled-opacity)] pointer-events-none" : ""}`}
            aria-label={label ?? "Slider"}
          />
        </Slider.Root>
      </div>
    </div>
  );
}
