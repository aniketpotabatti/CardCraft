import { pageName } from "../../model/names";
import { useRef, useState } from "react";
import { ArrowUpRight, Move } from "lucide-react";
import { SlidePreview } from "../panels/SlidePreview";
import { useEditorStore } from "../../model/store";

export function BoardView({ zoom, onOpenPage }: { zoom: number; onOpenPage: () => void }) {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedSlideId);
  const selectSlide = useEditorStore((state) => state.selectSlide);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  return <div
    className="relative h-full w-full overflow-hidden bg-[var(--bg-app)]"
    onPointerDown={(event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (!dragStart.current) return;
      setPan({ x: dragStart.current.panX + event.clientX - dragStart.current.x, y: dragStart.current.panY + event.clientY - dragStart.current.y });
    }}
    onPointerUp={() => { dragStart.current = null; }}
    onPointerCancel={() => { dragStart.current = null; }}
    onWheel={(event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const store = useEditorStore.getState();
      store.setZoom(store.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
    }}
  >
    <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-md border border-[var(--border-base)] bg-[var(--bg-surface)]/90 px-2.5 py-1.5 text-[10px] text-[var(--text-muted)] shadow-sm backdrop-blur-sm">
      <Move className="size-3" /> Infinite canvas · drag to pan · Ctrl/⌘ + scroll to zoom
    </div>
    <div className="absolute left-1/2 top-1/2 grid w-max grid-cols-2 gap-x-12 gap-y-12 p-12 transition-transform duration-100" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`, transformOrigin: "center" }}>
      {project.slides.map((slide, index) => {
        const selected = slide.id === selectedId;
        const width = slide.width > slide.height ? 300 : 220;
        const label = pageName(slide, index);
        return <article key={slide.id} className="w-[220px]" style={{ width }}>
          <button type="button" onClick={() => selectSlide(slide.id)} onDoubleClick={() => { selectSlide(slide.id); onOpenPage(); }} aria-pressed={selected} className={`group relative block w-full overflow-hidden rounded-lg border bg-[var(--bg-surface)] p-1.5 text-left shadow-lg transition ${selected ? "border-sky-400 ring-2 ring-sky-400/30" : "border-[var(--border-strong)] hover:border-sky-400/60"}`}>
            <SlidePreview slide={slide} className="w-full rounded" style={{ aspectRatio: `${slide.width} / ${slide.height}` }} />
            <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-md bg-black/65 text-white opacity-0 transition group-hover:opacity-100" aria-hidden="true"><ArrowUpRight className="size-4" /></span>
          </button>
          <div className="mt-2 flex items-baseline justify-between gap-2 px-1">
            <span className={`truncate text-[11px] ${selected ? "font-semibold text-sky-300" : "text-[var(--text-secondary)]"}`}>{index + 1}. {label}</span>
            <span className="shrink-0 text-[9px] text-[var(--text-muted)]">{slide.width}×{slide.height}</span>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
