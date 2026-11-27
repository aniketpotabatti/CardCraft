import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "../../app/ui";
import { effectFields, effectNames, newEffect, shaderNames } from "../../model/effects";
import type { EffectKind, LayerEffect } from "../../model/types";
import { ShaderPresets } from "./ShaderPresets";

function summary(effect: LayerEffect) {
  switch (effect.kind) {
    case "drop-shadow":
    case "inner-shadow": return `${effect.x}, ${effect.y} · ${effect.blur} px`;
    case "layer-blur":
    case "background-blur": return effect.progressive ? `${effect.start} → ${effect.end} px` : `${effect.blur} px`;
    case "noise": return `${effect.noiseMode} · ${Math.round(effect.density * 100)}%`;
    case "glass": return `${effect.refraction}% refraction`;
    case "shader": return shaderNames[effect.shader];
  }
}

export function EffectControls({ effects, onChange, disabled = false }: {
  effects: LayerEffect[]; onChange: (effects: LayerEffect[]) => void; disabled?: boolean;
}) {
  const [kind, setKind] = useState<EffectKind>("drop-shadow");
  const update = (id: string, change: Partial<LayerEffect>) => onChange(effects.map(effect => effect.id === id ? { ...effect, ...change } : effect));
  function move(index: number, offset: number) {
    const next = effects.slice();
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    // The older native shadow already sits below the other effects.
    onChange(next.map((effect, i) => effect.legacy && i !== 0 ? { ...effect, legacy: false } : effect));
  }
  return <div className="grid gap-2">
    {effects.map((effect, index) => {
      const title = effectNames[effect.kind];
      const label = `${title} ${effects.slice(0, index + 1).filter(item => item.kind === effect.kind).length}`;
      return <div key={effect.id} className="flex items-center gap-1 rounded border border-[var(--border-base)] px-1">
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 items-start gap-0 flex-col py-1 px-1"
              disabled={disabled} aria-label={`Edit ${label}`}>
              <span>{title}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{summary(effect)}</span>
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="left" sideOffset={8} collisionPadding={10} aria-label={`${label} settings`}
              className="z-[125] grid w-64 max-h-[85vh] gap-2 overflow-y-auto rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] p-3 text-xs shadow-xl">
              <strong>{title}</strong>
              <EffectSettings effect={effect} patch={change => update(effect.id, { ...change, legacy: false })} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {effects.length > 1 && <>
          <button type="button" aria-label={`Move ${label} earlier`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3" /></button>
          <button type="button" aria-label={`Move ${label} later`} disabled={disabled || index === effects.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3" /></button>
        </>}
        <button type="button" aria-label={`${effect.visible ? "Hide" : "Show"} ${label}`} disabled={disabled} onClick={() => update(effect.id, { visible: !effect.visible })}>
          {effect.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
        <button type="button" aria-label={`Remove ${label}`} disabled={disabled} onClick={() => onChange(effects.filter(item => item.id !== effect.id))}><Trash2 className="size-3.5" /></button>
      </div>;
    })}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
      <select aria-label="Effect type" className="rounded bg-[var(--bg-input)] p-1 text-xs" value={kind} disabled={disabled}
        onChange={event => setKind(event.target.value as EffectKind)}>
        {Object.entries(effectNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <Button type="button" title="Add effect" aria-label="Add effect" disabled={disabled || effects.length >= 20}
        onClick={() => onChange([...effects, newEffect(kind)])}><Plus className="size-3.5" /></Button>
    </div>
  </div>;
}

function EffectSettings({ effect, patch }: { effect: LayerEffect; patch: (change: Partial<LayerEffect>) => void }) {
  const number = (key: keyof typeof effectFields, label: string, percent = false) => {
    const factor = percent ? 100 : 1;
    const [min, max] = effectFields[key];
    return <label className="grid grid-cols-2 items-center gap-2">{label}
      <Input type="number" min={min * factor} max={max * factor} step="any" value={Math.round(effect[key] * factor * 100) / 100}
        onChange={event => {
          const value = event.currentTarget.valueAsNumber / factor;
          if (Number.isFinite(value)) patch({ [key]: Math.max(min, Math.min(max, value)) });
        }} />
    </label>;
  };
  const color = (key: "color" | "color2", label: string) => <label className="flex items-center justify-between">{label}
    <input type="color" value={effect[key]} onChange={event => patch({ [key]: event.currentTarget.value })} />
  </label>;
  return <>
    {(effect.kind === "drop-shadow" || effect.kind === "inner-shadow") && <>
      {number("x", "Offset X")}{number("y", "Offset Y")}{number("blur", "Blur")}{number("spread", "Spread")}{color("color", "Shadow color")}
    </>}
    {(effect.kind === "layer-blur" || effect.kind === "background-blur") && <>
      <label className="grid grid-cols-2 items-center gap-2">Blur mode
        <select value={effect.progressive ? "progressive" : "uniform"} onChange={event => patch({ progressive: event.target.value === "progressive" })}>
          <option value="uniform">Uniform</option><option value="progressive">Progressive</option>
        </select>
      </label>
      {effect.progressive ? <>{number("start", "Start blur")}{number("end", "End blur")}{number("angle", "Direction")}</> : number("blur", "Blur")}
    </>}
    {effect.kind === "noise" && <>
      <label className="grid grid-cols-2 items-center gap-2">Noise mode
        <select value={effect.noiseMode} onChange={event => patch({ noiseMode: event.target.value as LayerEffect["noiseMode"] })}>
          <option value="mono">Mono</option><option value="duo">Duo</option><option value="multi">Multi</option>
        </select>
      </label>
      {number("sizeX", "Size X")}{number("sizeY", "Size Y")}{number("density", "Density (%)", true)}
      {effect.noiseMode !== "multi" && color("color", "Noise color")}
      {effect.noiseMode === "duo" && color("color2", "Second color")}
    </>}
    {effect.kind === "glass" && <>
      {number("angle", "Light angle")}{number("intensity", "Light intensity")}
      {number("refraction", "Refraction")}{number("depth", "Depth")}
      {number("dispersion", "Dispersion")}{number("frost", "Frost")}{number("splay", "Splay")}
    </>}
    {effect.kind === "shader" && <ShaderPresets value={effect.shader} onChange={shader => patch({ shader })} />}
    {effect.kind !== "layer-blur" && number("opacity", "Opacity (%)", true)}
  </>;
}
