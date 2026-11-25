const SAFARI_PIXEL_LIMIT = 16_777_216;

export function maxPixelRatio(width: number, height: number, limit = SAFARI_PIXEL_LIMIT): number {
  const area = Math.max(1, width * height);
  return Math.sqrt(limit / area);
}

export function clampPixelRatio(
  width: number,
  height: number,
  requested: number,
  limit = SAFARI_PIXEL_LIMIT,
): { ratio: number; clamped: boolean } {
  const max = maxPixelRatio(width, height, limit);
  const ratio = Math.max(0.5, Math.min(requested, max));
  return { ratio, clamped: ratio < requested - 0.01 };
}
