import { useEffect, useRef, useState } from "react";
import { Button, Input } from "../../app/ui";
import { isOutline } from "../../model/drawing";
import { brushNames, defaultStrokeStyle, strokeGeometry } from "../../model/stroke-style";
import { useEditorStore } from "../../model/store";
import type { ShapeLayer, StrokeStyle } from "../../model/types";

const profiles = { Uniform: [1, 1, 1], "Taper start": [0.08, 0.8, 1], "Taper end": [1, 0.8, 0.08], "Taper both": [0.08, 1, 0.08] } satisfies Record<string, StrokeStyle["profile"]>;

const sample: ShapeLayer = {
  type: "shape", shape: "brush", id: "brush-sample", x: 0, y: 0, width: 88, height: 14, rotation: 0,
  fill: "#000000", cornerRadius: 0, strokeWidth: 10,
  points: [{ x: 0, y: 0.8 }, { x: 0.26, y: 0.2 }, { x: 0.6, y: 0.4 }, { x: 1, y: 0.63 }],
};

export function VectorStrokeControls({ layer, onChange }: { layer: ShapeLayer; onChange: (style: StrokeStyle) => void }) {
  const style = layer.strokeStyle ?? defaultStrokeStyle;
  const brushTrigger = useRef<HTMLButtonElement>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const openPath = isOutline(layer.shape);
  const profiled = style.profile.some(value => value !== 1);
  const preview = useEditorStore(state => state.brushPreview);
  const previewBrush = (brush?: StrokeStyle["brush"]) => {
    useEditorStore.setState({ brushPreview: brush ? { layerId: layer.id, brush } : undefined });
  };
  useEffect(() => () => {
    if (useEditorStore.getState().brushPreview?.layerId === layer.id) useEditorStore.setState({ brushPreview: undefined });
  }, [layer.id]);
  const patch = (change: Partial<StrokeStyle>) => onChange({ ...style, ...change });
  const select = (label: string, value: string, choices: Record<string, string>, change: (value: string) => void, disabled = false) =>
    <label className="grid grid-cols-2 items-center gap-2">{label}
      <select aria-label={label} className="min-w-0 rounded bg-[var(--bg-input)] p-1" value={value} onChange={event => change(event.target.value)} disabled={disabled}>
        {Object.entries(choices).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>;
  const number = (label: string, value: number, min: number, max: number, change: (value: number) => void) =>
    <label className="grid grid-cols-2 items-center gap-2">{label}
      <Input type="number" min={min} max={max} value={value} onChange={event => {
        const number = event.target.valueAsNumber;
        if (Number.isFinite(number)) change(Math.min(max, Math.max(min, number)));
      }} />
    </label>;
  const closeBrushBrowser = () => { previewBrush(); setBrowserOpen(false); };
  return <fieldset disabled={layer.locked} onKeyDown={event => {
    if (event.key !== "Escape" || !browserOpen) return;
    event.stopPropagation();
    closeBrushBrowser();
    brushTrigger.current?.focus();
  }} className="grid min-w-0 gap-2 border-t border-[var(--border-base)] pt-2 text-xs">
    {select("Stroke style", style.mode, { basic: "Basic", dynamic: "Dynamic", brush: "Brush" }, value => {
      closeBrushBrowser();
      patch({ mode: value as StrokeStyle["mode"] });
    })}
    {select("Stroke position", style.mode === "basic" && !openPath ? style.position : "center",
      { inside: "Inside", center: "Center", outside: "Outside" }, value => patch({ position: value as StrokeStyle["position"] }), openPath || style.mode !== "basic")}
    {(openPath || style.mode !== "basic") && <p className="text-[var(--text-muted)]">Center position only for {style.mode === "basic" ? "open paths" : style.mode + " strokes"}.</p>}
    {style.mode === "basic" && <>
      <fieldset disabled={profiled} className="grid gap-2">
        {select("Cap", style.cap, { butt: "Flat", round: "Round", square: "Square" }, value => patch({ cap: value as StrokeStyle["cap"] }))}
        {select("Join", style.join, { miter: "Miter", round: "Round", bevel: "Bevel" }, value => patch({ join: value as StrokeStyle["join"] }))}
        {number("Dash", style.dash, 0, 10000, dash => patch({ dash }))}
        {number("Gap", style.gap, 0, 10000, gap => patch({ gap }))}
      </fieldset>
      {profiled && <p className="text-[var(--text-muted)]">Uniform width enables caps, joins, and dashes.</p>}
      {openPath && <>
        {select("Start endpoint", style.start, { none: "None", arrow: "Arrow", dot: "Dot" }, value => patch({ start: value as StrokeStyle["start"] }))}
        {select("End endpoint", style.end, { none: "None", arrow: "Arrow", dot: "Dot" }, value => patch({ end: value as StrokeStyle["end"] }))}
      </>}
    </>}
    {style.mode === "dynamic" && <>
      {number("Frequency", style.frequency, 1, 100, frequency => patch({ frequency }))}
      {number("Wiggle (%)", Math.round(style.wiggle * 100), 0, 100, wiggle => patch({ wiggle: wiggle / 100 }))}
      {number("Smoothing (%)", Math.round(style.smoothing * 100), 0, 100, smoothing => patch({ smoothing: smoothing / 100 }))}
    </>}
    {style.mode === "brush" && <>
      <Button ref={brushTrigger} type="button" aria-expanded={browserOpen} onClick={() => browserOpen ? closeBrushBrowser() : setBrowserOpen(true)}>
        Browse brushes · {brushNames[style.brush]}
      </Button>
      {browserOpen && <div role="group" aria-label="Brush presets" className="grid gap-1 rounded border border-[var(--border-base)] p-1"
        onPointerLeave={() => previewBrush()}>
        {(Object.entries(brushNames) as [StrokeStyle["brush"], string][]).map(([brush, label]) => {
          const outline = strokeGeometry(sample, { ...defaultStrokeStyle, mode: "brush", brush }).outline;
          return <Button key={brush} type="button" aria-pressed={brush === style.brush}
            className={preview?.layerId === layer.id && preview.brush === brush ? "ring-1 ring-sky-500" : undefined}
            onPointerEnter={() => previewBrush(brush)} onFocus={() => previewBrush(brush)} onBlur={() => previewBrush()}
            onClick={() => { if (style.brush !== brush) patch({ brush }); closeBrushBrowser(); }}>
            <svg aria-hidden="true" viewBox="-4 -3 96 22" className="h-5 w-24"><path d={outline} fill="currentColor" fillRule="evenodd" /></svg>
            {label}
          </Button>;
        })}
      </div>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={style.reverse} onChange={event => patch({ reverse: event.target.checked })} />Reverse brush direction</label>
    </>}
    <fieldset className="grid gap-2">
      <legend className="mb-1">Width profile</legend>
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(profiles).map(([label, profile]) =>
          <Button key={label} type="button" aria-pressed={profile.every((value, index) => value === style.profile[index])}
            className="h-auto flex-col gap-0 px-1 py-1 aria-pressed:border-sky-500" onClick={() => patch({ profile })}>
            <svg aria-hidden="true" viewBox="0 0 64 12" className="h-3 w-14">
              <polygon fill="currentColor" points={profile.map((value, i) => `${i * 32},${6 - value * 5}`).concat(profile.map((value, i) => `${i * 32},${6 + value * 5}`).reverse()).join(" ")} />
            </svg>{label}
          </Button>)}
      </div>
      {(["Start", "Middle", "End"] as const).map((label, index) =>
        <div key={label}>{number(`${label} width (%)`, Math.round(style.profile[index] * 100), 0, 100, width => {
          const profile = [...style.profile] as StrokeStyle["profile"];
          profile[index] = width / 100;
          patch({ profile });
        })}</div>)}
    </fieldset>
  </fieldset>;
}
