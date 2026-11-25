import { useEffect, useRef, useState } from "react";
import { drawingBounds, isInk, isOutline, vectorPath, type DrawingTool, type Point } from "../../model/drawing";
import { useEditorStore } from "../../model/store";

export interface StrokeStyle { color: string; weight: number }

export function DrawingSurface({ tool, scale, style }: { tool: DrawingTool; scale: number; style: StrokeStyle }) {
  const [samples, setSamples] = useState<Point[]>([]);
  const [modifiers, setModifiers] = useState({ shift: false, alt: false });
  const live = useRef<Point[]>([]);
  const pen = tool === "pen";
  const update = (points: Point[]) => { live.current = points; setSamples(points); };
  function finish(points: Point[], shift = false, alt = false) {
    if (!points.length) return;
    const bounds = drawingBounds(tool, points, shift, alt);
    useEditorStore.getState().addShape(tool, { ...bounds, ...(isOutline(tool) ? { stroke: style.color, strokeWidth: style.weight } : {}) });
    update([]);
    if (!isInk(tool)) useEditorStore.getState().setActiveTool("move");
  }
  useEffect(() => {
    if (!pen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" && live.current.length > 1 && !(e.target as HTMLElement)?.closest("input,textarea,select")) {
        e.preventDefault(); finish(live.current);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pen, style]);
  function at(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }
  const bounds = samples.length ? drawingBounds(tool, samples, modifiers.shift, modifiers.alt) : undefined;
  const path = bounds && vectorPath({ ...bounds, shape: tool, strokeWidth: style.weight });
  return <svg aria-label={tool + " drawing surface"} className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
    onPointerDown={e => {
      if (e.button !== 0) return;
      const point = at(e);
      if (pen) {
        const last = live.current.at(-1);
        if (!last || last.x !== point.x || last.y !== point.y) update([...live.current, point]);
      } else {
        e.currentTarget.setPointerCapture(e.pointerId);
        update([point]);
      }
    }}
    onDoubleClick={() => { if (pen && live.current.length > 1) finish(live.current); }}
    onPointerMove={e => {
      if (pen || !e.currentTarget.hasPointerCapture(e.pointerId) || !live.current.length) return;
      setModifiers({ shift: e.shiftKey, alt: e.altKey });
      update(isInk(tool) ? [...live.current, at(e)] : [live.current[0], at(e)]);
    }}
    onPointerCancel={() => update([])}
    onPointerUp={e => {
      if (pen || !live.current.length || e.button !== 0) return;
      finish(isInk(tool) ? [...live.current, at(e)] : [live.current[0], at(e)], e.shiftKey, e.altKey);
    }}>
    {bounds && <g transform={`scale(${scale}) translate(${bounds.x} ${bounds.y})`} fill={isOutline(tool) ? "none" : "#38bdf8"} stroke={isOutline(tool) ? style.color : "#0c8ce9"} strokeWidth={isOutline(tool) ? style.weight : 1 / scale} strokeLinecap="round" strokeLinejoin="round">
      {path ? <path d={path} /> : tool === "ellipse" ? <ellipse cx={bounds.width / 2} cy={bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} /> : <rect width={bounds.width} height={bounds.height} />}
    </g>}
  </svg>;
}
