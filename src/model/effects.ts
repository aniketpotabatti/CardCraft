import { hasShadow, type EffectKind, type LayerEffect, type LayerShadow, type ShaderPreset } from "./types";

export const effectNames: Record<EffectKind, string> = {
  "drop-shadow": "Drop shadow", "inner-shadow": "Inner shadow", "layer-blur": "Layer blur",
  "background-blur": "Background blur", noise: "Noise", glass: "Glass", shader: "Shader",
};

export const shaderNames: Record<ShaderPreset, string> = { waves: "Ripple waves", halftone: "Halftone", glow: "Radial glow" };

export const effectFields = {
  x: [-100000, 100000], y: [-100000, 100000], blur: [0, 1000], spread: [-64, 64], opacity: [0, 1],
  start: [0, 1000], end: [0, 1000], angle: [-360, 360], sizeX: [1, 128], sizeY: [1, 128],
  density: [0, 1], refraction: [0, 100], depth: [0, 100], dispersion: [0, 100], frost: [0, 100],
  splay: [0, 100], intensity: [0, 100],
} as const;

export function newEffect(kind: EffectKind, id: string = crypto.randomUUID()): LayerEffect {
  return {
    id, kind, visible: true, x: 0, y: 4, blur: 12, spread: 0, color: "#000000",
    color2: "#ffffff", opacity: kind.includes("shadow") ? 0.3 : 0.65, progressive: false, start: 0, end: 16,
    angle: kind === "glass" ? -45 : 0, noiseMode: "mono", sizeX: 2, sizeY: 2, density: 0.5,
    refraction: 25, depth: 25, dispersion: 10, frost: 4, splay: 35, intensity: 55, shader: "waves",
  };
}

export function effectsFor(target: LayerShadow): LayerEffect[] {
  if (target.effects) return target.effects;
  if (!hasShadow(target)) return [];
  const blur = target.shadow ?? 0;
  return [{
    ...newEffect("drop-shadow", "legacy-shadow"), legacy: true,
    blur, x: target.shadowOffsetX ?? 0, y: target.shadowOffsetY ?? blur * 0.35,
    color: target.shadowColor ?? "#000000", opacity: target.shadowOpacity ?? 0.32,
  }];
}

export function effectPadding(effects: LayerEffect[], includeBackdrop = false) {
  let padding = 0;
  for (const effect of effects) {
    if (!effect.visible || effect.legacy) continue;
    if (effect.kind === "drop-shadow") padding += Math.max(Math.abs(effect.x), Math.abs(effect.y)) + Math.max(0, effect.spread) + effect.blur * 3;
    if (effect.kind === "layer-blur") padding += (effect.progressive ? Math.max(effect.start, effect.end) : effect.blur) * 3;
    if (includeBackdrop && (effect.kind === "background-blur" || effect.kind === "glass")) padding += Math.max(effect.blur, effect.start, effect.end, effect.frost, effect.refraction) * 3;
  }
  return padding;
}

export function shaderValue(preset: ShaderPreset, x: number, y: number) {
  if (preset === "waves") return 0.5 + 0.5 * Math.sin((x + Math.sin(y * Math.PI * 4) * 0.16) * Math.PI * 8);
  if (preset === "halftone") return Math.hypot((x * 12 % 1) - 0.5, (y * 12 % 1) - 0.5) < 0.29 ? 1 : 0;
  return Math.max(0, 1 - Math.hypot(x - 0.45, y - 0.42) * 1.7);
}
