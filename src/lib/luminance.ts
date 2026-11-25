import type Konva from "konva";
import type { LogoTone } from "../model/types";

export function srgbToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function toneFromLuminance(L: number, prev?: LogoTone): LogoTone {
  if (prev === "dark" && L < 0.55) return "dark";
  if (prev === "light" && L > 0.45) return "light";
  return L > 0.5 ? "dark" : "light";
}

export function averageLuminance(data: Uint8ClampedArray): number {
  let sum = 0;
  const pixels = data.length / 4;
  if (pixels === 0) return 0.5;
  for (let i = 0; i < data.length; i += 4) {
    sum += relativeLuminance(data[i], data[i + 1], data[i + 2]);
  }
  return sum / pixels;
}

export function pickLogoTone(
  stage: Konva.Stage,
  box: { x: number; y: number; w: number; h: number },
  prev?: LogoTone,
): LogoTone {
  const group = stage.findOne("#bg-layers");
  if (!group) return prev ?? "light";

  const canvas = group.toCanvas({
    x: box.x,
    y: box.y,
    width: Math.max(1, box.w),
    height: Math.max(1, box.h),
    pixelRatio: 0.25,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return prev ?? "light";
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return toneFromLuminance(averageLuminance(data), prev);
}
