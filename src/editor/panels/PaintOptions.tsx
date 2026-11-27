import { ShaderPresets } from "./ShaderPresets";
import { useState } from "react";
import { Button, Input } from "../../app/ui";
import { imageAdjustments, makeGradient } from "../../model/paints";
import type { GradientKind, Paint, ShapeLayer } from "../../model/types";
import type { AssetInfo } from "../../model/store";
import { ingestImage, ingestVideo } from "../../lib/image-ingest";

export function PaintOptions({ paint, onPatch, assets, registerAsset, sources }: {
  paint: Paint;
  onPatch: (patch: Partial<Paint>) => void;
  assets: Record<string, AssetInfo>;
  registerAsset: (id: string, info: AssetInfo) => void;
  sources: ShapeLayer[];
}) {
  const [message, setMessage] = useState("");
  const kind = paint.kind ?? "solid";
  const gradient = paint.gradient;
  const crop = paint.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
  const pattern = paint.pattern;
  const patchGradient = (patch: Partial<NonNullable<Paint["gradient"]>>) => {
    if (gradient) onPatch({ gradient: { ...gradient, ...patch } });
  };
  const number = (label: string, value: number, min: number, max: number, step: number, update: (value: number) => void) =>
    <label className="grid grid-cols-2 items-center gap-2">{label}
      <Input type="number" min={min} max={max} step={step} value={value} onChange={e => {
        const number = e.target.valueAsNumber;
        if (Number.isFinite(number)) update(Math.max(min, Math.min(max, number)));
      }} />
    </label>;
  const importMedia = async (file: File, mime: "image" | "video") => {
    setMessage("Loading media…");
    try {
      const media = await (mime === "video" ? ingestVideo(file) : ingestImage(file));
      registerAsset(media.id, { name: file.name, url: media.previewUrl, width: media.width, height: media.height });
      if ("videoAssetId" in media && typeof media.videoAssetId === "string") {
        registerAsset(media.videoAssetId, { name: file.name, url: URL.createObjectURL(file) });
        onPatch({ assetId: media.videoAssetId, posterId: media.id });
      } else onPatch({ assetId: media.id, posterId: undefined });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load media.");
    }
  };
  return <div className="grid gap-2 border-b border-[var(--border-base)] p-3 text-xs">
    <label className="grid grid-cols-2 items-center gap-2">Paint type
      <select value={kind} onChange={e => {
        const kind = e.target.value as NonNullable<Paint["kind"]>;
        onPatch({ kind,
          ...(kind === "gradient" ? { gradient: gradient ?? makeGradient(paint.color) } : {}),
          ...(kind === "pattern" ? { pattern: pattern ?? { sourceId: "", scale: 1, gapX: 0, gapY: 0, angle: 0, align: "start" } } : {}),
          ...(kind !== paint.kind && (kind === "image" || kind === "video") ? { assetId: undefined, posterId: undefined } : {}),
        });
      }}>
        <option value="solid">Solid</option><option value="gradient">Gradient</option>
        <option value="image">Image</option><option value="video">Video</option><option value="pattern">Pattern</option><option value="shader">Shader</option>
      </select>
    </label>
    {kind === "shader" && <ShaderPresets value={paint.shader ?? "waves"} onChange={shader => onPatch({ shader })} />}
    {kind === "gradient" && gradient && <>
      <div className="flex items-center justify-between gap-1">
        <select aria-label="Gradient geometry" value={gradient.type} onChange={e => patchGradient({ type: e.target.value as GradientKind })}>
          <option value="linear">Linear</option><option value="radial">Radial</option><option value="angular">Angular</option><option value="diamond">Diamond</option>
        </select>
        <Button onClick={() => patchGradient({ stops: gradient.stops.map(stop => ({ ...stop, position: 1 - stop.position })).reverse() })}>Reverse stops</Button>
      </div>
      {number("Gradient angle", gradient.angle, -360, 360, 1, angle => patchGradient({ angle }))}
      {[...gradient.stops].sort((a, b) => a.position - b.position).map((stop, index) => {
        const patchStop = (patch: Partial<typeof stop>) => patchGradient({ stops: gradient.stops.map(item => item.id === stop.id ? { ...item, ...patch } : item) });
        return <fieldset className="grid gap-1 rounded border border-[var(--border-base)] p-2" key={stop.id}>
          <legend>Stop {index + 1}</legend>
          {number("Position (%)", Math.round(stop.position * 100), 0, 100, 1, position => patchStop({ position: position / 100 }))}
          {number("Stop opacity (%)", Math.round(stop.opacity * 100), 0, 100, 1, opacity => patchStop({ opacity: opacity / 100 }))}
          <div className="flex justify-between gap-2">
            <input type="color" aria-label={`Stop ${index + 1} color`} value={stop.color} onChange={e => patchStop({ color: e.target.value })} />
            <Button disabled={gradient.stops.length <= 2} onClick={() => patchGradient({ stops: gradient.stops.filter(item => item.id !== stop.id) })}>Remove</Button>
          </div>
        </fieldset>;
      })}
      <Button disabled={gradient.stops.length >= 32} onClick={() => patchGradient({ stops: [...gradient.stops, { id: crypto.randomUUID(), position: 0.5, color: paint.color, opacity: 1 }] })}>Add stop</Button>
    </>}
    {(kind === "image" || kind === "video") && <>
      {kind === "image" && <label className="grid gap-1">Project image
        <select value={paint.assetId ?? ""} onChange={e => onPatch({ assetId: e.target.value || undefined })}>
          <option value="">Choose an image</option>
          {Object.entries(assets).filter(([, asset]) => asset.width && asset.height).map(([id, asset]) => <option key={id} value={id}>{asset.name ?? id}</option>)}
        </select>
      </label>}
      <label className="grid gap-1">Upload {kind}
        <input type="file" accept={`${kind}/*`} onChange={e => {
          const file = e.target.files?.[0];
          if (file) void importMedia(file, kind);
          e.target.value = "";
        }} />
      </label>
      {message && <p role="status">{message}</p>}
      <label className="grid grid-cols-2 items-center gap-2">Fit
        <select value={paint.fit ?? "cover"} onChange={e => onPatch({ fit: e.target.value as Paint["fit"] })}>
          <option value="cover">Fill</option><option value="contain">Fit inside</option>
        </select>
      </label>
      {number("Crop X (%)", Math.round(crop.x * 100), 0, 100, 1, x => onPatch({ crop: { ...crop, x: x / 100 } }))}
      {number("Crop Y (%)", Math.round(crop.y * 100), 0, 100, 1, y => onPatch({ crop: { ...crop, y: y / 100 } }))}
      {number("Crop zoom (%)", Math.round(crop.zoom * 100), 100, 400, 1, zoom => onPatch({ crop: { ...crop, zoom: zoom / 100 } }))}
      {kind === "image" && <details>
        <summary className="cursor-pointer">Image adjustments</summary>
        <div className="mt-2 grid gap-1">
          {imageAdjustments.map(key => <div key={key}>{number(key[0].toUpperCase() + key.slice(1), paint.adjustments?.[key] ?? 0, -100, 100, 1,
            value => onPatch({ adjustments: { ...paint.adjustments, [key]: value } }))}</div>)}
          <Button onClick={() => onPatch({ adjustments: {} })}>Reset adjustments</Button>
        </div>
      </details>}
    </>}
    {kind === "pattern" && pattern && <>
      <label className="grid gap-1">Source shape
        <select value={pattern.sourceId} onChange={e => onPatch({ pattern: { ...pattern, sourceId: e.target.value } })}>
          <option value="">Choose a shape</option>
          {sources.map(item => <option key={item.id} value={item.id}>{item.name ?? item.shape}</option>)}
        </select>
      </label>
      {number("Tile scale (%)", Math.round(pattern.scale * 100), 1, 400, 1, scale => onPatch({ pattern: { ...pattern, scale: scale / 100 } }))}
      {number("Spacing X", pattern.gapX, 0, 1000, 1, gapX => onPatch({ pattern: { ...pattern, gapX } }))}
      {number("Spacing Y", pattern.gapY, 0, 1000, 1, gapY => onPatch({ pattern: { ...pattern, gapY } }))}
      {number("Direction (°)", pattern.angle, -360, 360, 1, angle => onPatch({ pattern: { ...pattern, angle } }))}
      <label className="grid grid-cols-2 items-center gap-2">Alignment
        <select value={pattern.align} onChange={e => onPatch({ pattern: { ...pattern, align: e.target.value as typeof pattern.align } })}>
          <option value="start">Start</option><option value="center">Center</option><option value="end">End</option>
        </select>
      </label>
    </>}
  </div>;
}
