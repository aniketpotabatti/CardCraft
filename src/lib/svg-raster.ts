const cache = new Map<string, HTMLCanvasElement>();

function cacheKey(svg: string, width: number, pixelRatio: number) {
  return `${width}|${pixelRatio}|${svg.length}|${hashString(svg)}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

export async function rasterizeSvg(
  svg: string,
  width: number,
  pixelRatio: number,
): Promise<HTMLCanvasElement> {
  const key = cacheKey(svg, width, pixelRatio);
  const cached = cache.get(key);
  if (cached) return cached;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG"));
      img.src = url;
    });
    await img.decode().catch(() => undefined);

    const ratio = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 0.2;
    const height = Math.max(1, Math.round(width * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    cache.set(key, canvas);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function watermarkBox(
  canvasWidth: number,
  canvasHeight: number,
  size: number,
  position: "tl" | "tr" | "bl" | "br" | "bc",
  aspect = 280 / 56,
) {
  const w = size;
  const h = size / aspect;
  const pad = Math.max(24, canvasWidth * 0.03);
  switch (position) {
    case "tl":
      return { x: pad, y: pad, w, h };
    case "tr":
      return { x: canvasWidth - pad - w, y: pad, w, h };
    case "bl":
      return { x: pad, y: canvasHeight - pad - h, w, h };
    case "bc":
      return { x: (canvasWidth - w) / 2, y: canvasHeight - pad - h, w, h };
    case "br":
    default:
      return { x: canvasWidth - pad - w, y: canvasHeight - pad - h, w, h };
  }
}
