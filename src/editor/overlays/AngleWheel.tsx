import { beginSliderDrag, applySliderChange } from "../../model/slider-history";
import { useRef } from "react";

export function AngleWheel({ angle, onChange }: { angle: number; onChange: (angle: number) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const update = (clientX: number, clientY: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = clientX - (box.left + box.width / 2);
    const y = clientY - (box.top + box.height / 2);
    applySliderChange(() => onChange((Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360));
  };
  const radians = (angle * Math.PI) / 180;
  const px = 32 + Math.cos(radians) * 22;
  const py = 32 + Math.sin(radians) * 22;
  return (
    <div className="flex items-center gap-3">
      <svg
        ref={svgRef}
        viewBox="0 0 64 64"
        className="size-16 touch-none cursor-crosshair rounded-full"
        role="slider"
        aria-label="Gradient angle"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={angle}
        tabIndex={0}
        onPointerDownCapture={beginSliderDrag}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => { if (event.buttons) update(event.clientX, event.clientY); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); onChange((angle + 1) % 360); }
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); onChange((angle + 359) % 360); }
        }}
      >
        <circle cx="32" cy="32" r="28" fill="var(--bg-input)" stroke="var(--border-strong)" strokeWidth="2" />
        <circle cx="32" cy="32" r="2" fill="var(--text-muted)" />
        <line x1="32" y1="32" x2={px} y2={py} stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />
        <circle cx={px} cy={py} r="5" fill="#0ea5e9" stroke="white" strokeWidth="2" />
      </svg>
      <div className="font-mono text-xs text-[var(--text-secondary)]">{angle}°</div>
    </div>
  );
}
