import { isOutline, vectorPath } from "./drawing";
import type { ShapeLayer, StrokeStyle } from "./types";

export const defaultStrokeStyle: StrokeStyle = {
  mode: "basic", cap: "round", join: "round", position: "center", start: "none", end: "none",
  dash: 0, gap: 0, profile: [1, 1, 1], frequency: 12, wiggle: 0.35, smoothing: 0.45,
  brush: "felt", reverse: false,
};

export const brushNames = { felt: "Felt", dry: "Dry ink", chisel: "Chisel" };

export function strokePosition(layer: ShapeLayer, style: StrokeStyle) {
  return style.mode === "basic" && !isOutline(layer.shape) ? style.position : "center";
}

export function strokeHasOutline(style: StrokeStyle) {
  return style.mode !== "basic" || style.profile.some(value => value !== 1);
}

export function strokePath(layer: ShapeLayer) {
  const { width: w, height: h } = layer;
  if (layer.shape === "ellipse") {
    return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${-w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
  }
  const r = Math.min(w / 2, h / 2, Math.max(0, layer.cornerRadius));
  return vectorPath(layer) ?? `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

const pair = (x: number, y: number) => `${+(x.toFixed(3))} ${+(y.toFixed(3))}`;

function samplePath(data: string, width: number) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", data);
  const length = path.getTotalLength();
  const count = Math.max(12, Math.min(2400, Math.ceil(length / Math.max(0.5, Math.min(3, width / 6)))));
  return Array.from({ length: count + 1 }, (_, i) => path.getPointAtLength(length * i / count));
}

export interface StrokeGeometry {
  path: string;
  outline: string;
  endpoints: string;
  markers: string[];
  pad: number;
}

const cache = new Map<string, StrokeGeometry>();

export function strokeGeometry(layer: ShapeLayer, style: StrokeStyle, width = layer.strokeWidth ?? 1): StrokeGeometry {
  const path = strokePath(layer);
  const position = strokePosition(layer, style);
  const closed = !isOutline(layer.shape);
  const key = JSON.stringify([path, style, width, position, closed]);
  const cached = cache.get(key);
  if (cached) return cached;
  const geometry: StrokeGeometry = { path, outline: "", endpoints: "", markers: [], pad: width * (position === "outside" ? 2 : 1) };
  if (style.mode === "dynamic") geometry.pad += width * style.wiggle;
  if (strokeHasOutline(style) || (!closed && (style.start !== "none" || style.end !== "none"))) {
    const segments = path.split(/(?=M)/).filter(Boolean);
    for (const [index, segment] of segments.entries()) {
      const samples = samplePath(segment, width);
      const last = samples.length - 1;
      const left: string[] = [], right: string[] = [], texture: string[] = [];
      for (let i = 0; i <= last; i++) {
        const point = samples[i];
        const before = samples[i === 0 && closed ? last - 1 : Math.max(0, i - 1)];
        const after = samples[i === last && closed ? 1 : Math.min(last, i + 1)];
        const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
        const nx = -(after.y - before.y) / length, ny = (after.x - before.x) / length;
        const t = i / last;
        const direction = style.reverse && style.mode === "brush" ? 1 - t : t;
        const phase = direction * Math.PI * 2;
        const profile = t < 0.5
          ? style.profile[0] + (style.profile[1] - style.profile[0]) * t * 2
          : style.profile[1] + (style.profile[2] - style.profile[1]) * (t * 2 - 1);
        let offset = 0, radius = width / 2 * profile;
        if (style.mode === "dynamic") {
          const wave = phase * style.frequency;
          offset = Math.sin(wave) * width * style.wiggle * 0.6;
          offset += Math.sin(wave * 2 + 1) * width * style.wiggle * (1 - style.smoothing) * 0.35;
          radius *= 1 + Math.cos(wave) * style.wiggle * 0.22;
        } else if (style.mode === "brush") {
          const taper = closed ? 1 : style.brush === "chisel" ? 0.36 + 0.64 * (1 - direction) : 0.65 + 0.35 * Math.sin(direction * Math.PI);
          const roughness = style.brush === "dry" ? 0.22 : style.brush === "chisel" ? 0.12 : 0.07;
          radius *= taper * (1 + roughness * (0.65 * Math.sin(phase * 39) + 0.35 * Math.sin(phase * 91)));
          offset = radius * roughness * Math.sin(phase * 47 + 2);
          if (style.brush === "dry" && i % 4 === 2 && radius > 1.5 && t > 0.03 && t < 0.97) {
            const grain = radius * 0.12;
            const dot = radius * Math.sin(phase * 51) * 0.61;
            const x = point.x + nx * (offset + dot), y = point.y + ny * (offset + dot);
            texture.push(`M ${pair(x - grain, y)} a ${grain} ${grain} 0 1 0 ${2 * grain} 0 a ${grain} ${grain} 0 1 0 ${-2 * grain} 0 Z`);
          }
        }
        if (position !== "center") radius *= 2;
        left.push(pair(point.x + nx * (offset + radius), point.y + ny * (offset + radius)));
        right.push(pair(point.x + nx * (offset - radius), point.y + ny * (offset - radius)));
      }
      geometry.outline += `M ${left.concat(right.reverse()).join(" L ")} Z ${texture.join(" ")} `;
      if (index > 0 || closed || style.mode !== "basic") continue;
      for (const [endpoint, point, neighbor] of [[style.start, samples[0], samples[1]], [style.end, samples[last], samples[last - 1]]] as const) {
        if (endpoint === "none") continue;
        const length = Math.hypot(point.x - neighbor.x, point.y - neighbor.y) || 1;
        const ux = (point.x - neighbor.x) / length, uy = (point.y - neighbor.y) / length;
        const r = width * 0.75;
        geometry.markers.push(endpoint === "dot"
          ? `M ${pair(point.x - r, point.y)} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`
          : `M ${pair(point.x + ux * r, point.y + uy * r)} L ${pair(point.x - ux * r - uy * r, point.y - uy * r + ux * r)} L ${pair(point.x - ux * r + uy * r, point.y - uy * r - ux * r)} Z`);
      }
    }
  }
  if (!strokeHasOutline(style)) geometry.outline = "";
  geometry.endpoints = geometry.markers.join(" ");
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(key, geometry);
  return geometry;
}
