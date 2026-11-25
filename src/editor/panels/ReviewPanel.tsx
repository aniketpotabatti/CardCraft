import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { activeSlide, useEditorStore } from "../../model/store";
import { isImageLayer, isTextLayer } from "../../model/types";
import { relativeLuminance } from "../../lib/luminance";
import { safeGuideBounds } from "../../model/safe-guides";

type ReviewIssue = { id: string; layerId?: string; title: string; detail: string; kind: "warning" | "info" };

export function ReviewPanel() {
  const slide = useEditorStore((state) => activeSlide(state));
  const assets = useEditorStore((state) => state.assets);
  const safeGuidePreset = useEditorStore((state) => state.safeGuidePreset);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  if (!slide) return null;

  const issues: ReviewIssue[] = [];
  const safeBounds = safeGuideBounds(safeGuidePreset, slide.width, slide.height);
  for (const layer of slide.layers) {
    if (layer.visible === false) continue;
    const height = isTextLayer(layer) ? layer.fontSize * layer.lineHeight : layer.height;
    if (layer.x < 0 || layer.y < 0 || layer.x + layer.width > slide.width || layer.y + height > slide.height) {
      issues.push({ id: `${layer.id}-bounds`, layerId: layer.id, title: "Outside page bounds", detail: "Part of this layer may be clipped in the export.", kind: "warning" });
    }
    if (isTextLayer(layer)) {
      if (layer.fontSize < 24) issues.push({ id: `${layer.id}-size`, layerId: layer.id, title: "Small text", detail: "Type below 24 px may be difficult to read in social feeds.", kind: "info" });
      const backgrounds = slide.background.kind === "solid" ? [slide.background.color] : slide.background.kind === "gradient" ? [slide.background.from, slide.background.to] : [];
      if (backgrounds.length) {
        const ratios = backgrounds.map((color) => contrastRatio(layer.color, color)).filter((ratio): ratio is number => ratio !== null);
        const ratio = ratios.length ? Math.min(...ratios) : null;
        const largeText = layer.fontSize >= 24 || (layer.fontSize >= 18.66 && layer.fontWeight >= 700);
        const target = largeText ? 3 : 4.5;
        if (ratio !== null && ratio < target) issues.push({ id: `${layer.id}-contrast`, layerId: layer.id, title: "Low text contrast", detail: `Approx. ${ratio.toFixed(1)}:1 against the page background; aim for ${target}:1 or higher.`, kind: "warning" });
      }
      if (layer.x < safeBounds.x || layer.y < safeBounds.y || layer.x + layer.width > safeBounds.x + safeBounds.width || layer.y + height > safeBounds.y + safeBounds.height) {
        issues.push({ id: `${layer.id}-safe`, layerId: layer.id, title: "Text near page edge", detail: `${safeBounds.label} may be crossed by this text.`, kind: "info" });
      }
    }
    if (isImageLayer(layer) && !assets[layer.assetId]) {
      issues.push({ id: `${layer.id}-asset`, layerId: layer.id, title: "Image asset unavailable", detail: "Re-upload or replace this image before exporting.", kind: "warning" });
    }
  }
  if (slide.background.kind === "image" && !assets[slide.background.assetId]) {
    issues.push({ id: "background-asset", title: "Background image unavailable", detail: "Re-upload or replace the page background before exporting.", kind: "warning" });
  }

  return <div className="flex h-full flex-col overflow-y-auto">
    <div className="border-b border-[var(--border-base)] px-3 py-3">
      <h3 className="text-xs font-semibold text-[var(--text-main)]">Design review</h3>
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">Quick checks for this page before export.</p>
    </div>
    <div className="grid gap-3 p-3">
      <div className={`flex items-center gap-2 rounded-lg border p-3 ${issues.some((item) => item.kind === "warning") ? "border-amber-500/25 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
        {issues.some((item) => item.kind === "warning") ? <AlertTriangle className="size-4 text-amber-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
        <div><p className="text-xs font-semibold text-[var(--text-main)]">{issues.length ? `${issues.length} review note${issues.length === 1 ? "" : "s"}` : "Page looks ready"}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{slide.width} × {slide.height} · {slide.layers.length} layers</p></div>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40 p-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-500" />
        <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">These are layout heuristics, not a formal accessibility certification. Use the selected text controls for background contrast guidance.</p>
      </div>
      {issues.length ? <div className="grid gap-1.5">{issues.map((issue) => <button key={issue.id} type="button" onClick={() => issue.layerId && selectLayer(issue.layerId)} className="flex items-start gap-2 rounded-lg border border-[var(--border-base)] p-2.5 text-left transition hover:border-sky-500/40 hover:bg-[var(--bg-surface-elevated)]">
        {issue.kind === "warning" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <span className="mt-1 size-2 shrink-0 rounded-full bg-sky-500" />}
        <span><span className="block text-[11px] font-medium text-[var(--text-main)]">{issue.title}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-[var(--text-muted)]">{issue.detail}</span></span>
      </button>)}</div> : <div className="rounded-lg border border-dashed border-[var(--border-base)] p-4 text-center text-[10px] text-[var(--text-muted)]">No clipping or missing image assets detected.</div>}
    </div>
  </div>;
}

function contrastRatio(foreground: string, background: string): number | null {
  const luminance = (value: string) => {
    const hex = value.trim().replace(/^#/, "");
    if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
    const full = hex.length === 3 ? [...hex].map((channel) => channel + channel).join("") : hex;
    const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
    return relativeLuminance(channels[0], channels[1], channels[2]);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

