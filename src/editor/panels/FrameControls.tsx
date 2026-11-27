import { useState } from "react";
import { ASPECT_PRESETS } from "../../model/presets";
import type { LayoutGuide } from "../../model/types";
import { Button, Input, Toggle } from "../../app/ui";

const presets = [
  { label: "Mobile", width: 402, height: 874 },
  { label: "Tablet", width: 768, height: 1024 },
  { label: "Desktop", width: 1440, height: 900 },
  ...ASPECT_PRESETS,
];

export function FramePresets({ onResize }: { onResize: (width: number, height: number) => void }) {
  const [search, setSearch] = useState("");
  return <details>
    <summary className="cursor-pointer text-xs">Frame size presets</summary>
    <div className="mt-2 grid gap-1">
      <Input aria-label="Search frame sizes" placeholder="Search sizes" value={search} onChange={event => setSearch(event.target.value)} />
      {presets.filter(({ label, width, height }) => `${label} ${width} × ${height}`.toLowerCase().includes(search.trim().toLowerCase())).map(({ label, width, height }) =>
        <Button key={label} onClick={() => onResize(width, height)}>{label} · {width} × {height}</Button>)}
    </div>
  </details>;
}

export function GuideControls({ guides, onChange }: { guides: LayoutGuide[]; onChange: (guides: LayoutGuide[]) => void }) {
  const patch = (id: string, change: Partial<LayoutGuide>) => onChange(guides.map(guide => guide.id === id ? { ...guide, ...change } : guide));
  return <div className="grid gap-2">
    {guides.map((guide, index) => <fieldset key={guide.id} className="grid gap-2 rounded border border-[var(--border-base)] p-2 text-xs">
      <legend>Guide {index + 1}</legend>
      <select aria-label="Guide type" value={guide.type} onChange={event => patch(guide.id, { type: event.target.value as LayoutGuide["type"] })}>
        <option value="grid">Grid</option><option value="rows">Rows</option><option value="columns">Columns</option>
      </select>
      {(guide.type === "grid" ? [["size", "Size", 1, 10000]] as const : [["count", "Count", 1, 100], ["margin", "Margin", 0, 100000], ["gutter", "Gutter", 0, 100000]] as const).map(([key, label, min, max]) =>
        <label key={key} className="grid grid-cols-2 items-center gap-2">{label}
          <Input type="number" min={min} max={max} value={guide[key]} onChange={event => patch(guide.id, { [key]: Math.min(max, Math.max(min, Math.round(Number(event.target.value)))) })} />
        </label>)}
      <label className="flex items-center justify-between">Color<input type="color" value={guide.color} onChange={event => patch(guide.id, { color: event.target.value })} /></label>
      <label className="grid grid-cols-2 items-center gap-2">Opacity (%)<Input type="number" min={0} max={100} value={Math.round(guide.opacity * 100)} onChange={event => patch(guide.id, { opacity: Math.min(100, Math.max(0, Number(event.target.value))) / 100 })} /></label>
      <Toggle label="Show guide" checked={guide.visible} onCheckedChange={visible => patch(guide.id, { visible })} />
      <Button onClick={() => onChange(guides.filter(item => item.id !== guide.id))}>Remove guide</Button>
    </fieldset>)}
    <Button disabled={guides.length >= 32} onClick={() => onChange([...guides, { id: crypto.randomUUID(), type: "grid", size: 10, count: 4, margin: 0, gutter: 8, color: "#ff0000", opacity: 0.1, visible: true }])}>Add guide</Button>
  </div>;
}
