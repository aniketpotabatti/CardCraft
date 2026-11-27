import { useState } from "react";
import { shaderNames, shaderValue } from "../../model/effects";
import type { ShaderPreset } from "../../model/types";
import { Button, Input } from "../../app/ui";

const previews = new Map<ShaderPreset, string>();

function preview(preset: ShaderPreset) {
  const saved = previews.get(preset);
  if (saved) return saved;
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 40;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const value = shaderValue(preset, x / canvas.width, y / canvas.height);
    const offset = (y * canvas.width + x) * 4;
    image.data.set([14 + 105 * value, 23 + 185 * value, 43 + 192 * value, 255], offset);
  }
  ctx.putImageData(image, 0, 0);
  const imageUrl = canvas.toDataURL();
  previews.set(preset, imageUrl);
  return imageUrl;
}

export function ShaderPresets({ value, onChange }: { value: ShaderPreset; onChange: (preset: ShaderPreset) => void }) {
  const [search, setSearch] = useState("");
  const matches = (Object.keys(shaderNames) as ShaderPreset[]).filter(id => shaderNames[id].toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="grid gap-2">
    <Input aria-label="Search shaders" placeholder="Search shaders" value={search} onChange={event => setSearch(event.target.value)} />
    <div className="grid grid-cols-2 gap-1">
      {matches.map(id => <Button key={id} type="button" aria-pressed={value === id}
        className="h-auto flex-col p-1 aria-pressed:border-sky-500" onClick={() => onChange(id)}>
        <img className="h-7 w-full rounded object-fill" alt="" src={preview(id)} />
        {shaderNames[id]}
      </Button>)}
    </div>
    {!matches.length && <p>No shaders match your search.</p>}
  </div>;
}
