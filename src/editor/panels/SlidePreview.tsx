import { vectorPath } from "../../model/drawing";
import { frameAncestors, orderedLayers } from "../../model/frames";
import type { CSSProperties, ReactNode } from "react";
import type { Layer, Slide, TextLayer } from "../../model/types";
import { imageSlots as getImageSlots } from "../../model/layouts";
import { useEditorStore } from "../../model/store";

interface SlidePreviewProps {
  slide: Slide;
  className?: string;
  style?: CSSProperties;
  emptyImageSlots?: boolean;
  footer?: ReactNode;
}

function textLines(layer: TextLayer, slideWidth: number) {
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const maxChars = Math.max(8, Math.floor((layer.width / slideWidth * 320) / Math.max(4, layer.fontSize / slideWidth * 320 * 0.56)));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxChars && lines.length < 7) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 8);
}

function PreviewLayer({ layer, slide, assets }: { layer: Layer; slide: Slide; assets: Record<string, { url: string }> }) {
  const transform = layer.flipX || layer.flipY ? `translate(${layer.flipX ? 2 * layer.x + layer.width : 0} ${layer.flipY ? 2 * layer.y + ("height" in layer ? layer.height : layer.fontSize * layer.lineHeight) : 0}) scale(${layer.flipX ? -1 : 1} ${layer.flipY ? -1 : 1})` : undefined;
  if (layer.type === "shape") {
    const shadowId = `preview-shape-shadow-${slide.id}-${layer.id}`;
    const path = vectorPath(layer);
    if (path) return <g transform={transform}><path transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`} d={path}
      fill={layer.fillVisible === false ? "none" : layer.fill} fillOpacity={layer.fillOpacity ?? 1} opacity={layer.opacity ?? 1}
      stroke={layer.strokeVisible === false ? undefined : layer.stroke} strokeOpacity={layer.strokeOpacity ?? 1} strokeWidth={layer.strokeWidth ?? 0} strokeLinecap="round" strokeLinejoin="round" /></g>;
    const paintShape = (color: string, opacity: number, key: string) => layer.shape === "ellipse"
      ? <ellipse key={key} cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} rx={layer.width / 2} ry={layer.height / 2} fill={color} fillOpacity={opacity} opacity={layer.opacity ?? 1} />
      : <rect key={key} x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.cornerRadius} fill={color} fillOpacity={opacity} opacity={layer.opacity ?? 1} />;
    return <g transform={transform}>
      {layer.shadow ? <defs><filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx={layer.shadowOffsetX ?? 0} dy={layer.shadowOffsetY ?? layer.shadow * 0.35} stdDeviation={layer.shadow / 2} floodColor={layer.shadowColor ?? "#000000"} floodOpacity={layer.shadowOpacity ?? 0.32} /></filter></defs> : null}
      {(layer.additionalFills ?? []).filter((paint) => paint.visible).map((paint) => paintShape(paint.color, paint.opacity, paint.id))}
      {layer.shape === "ellipse" ? (
        <ellipse cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} rx={layer.width / 2} ry={layer.height / 2} fill={layer.fill} fillOpacity={layer.fillVisible === false ? 0 : layer.fillOpacity ?? 1} opacity={layer.opacity ?? 1} stroke={layer.strokeVisible === false ? undefined : layer.stroke} strokeOpacity={layer.strokeOpacity ?? 1} strokeWidth={layer.strokeWidth ?? 0} filter={layer.shadow ? `url(#${shadowId})` : undefined} />
      ) : (
        <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.cornerRadius} fill={layer.fill} fillOpacity={layer.fillVisible === false ? 0 : layer.fillOpacity ?? 1} opacity={layer.opacity ?? 1} stroke={layer.strokeVisible === false ? undefined : layer.stroke} strokeOpacity={layer.strokeOpacity ?? 1} strokeWidth={layer.strokeWidth ?? 0} filter={layer.shadow ? `url(#${shadowId})` : undefined} />
      )}
    </g>;
  }
  if (layer.type === "image") {
    const url = assets[layer.assetId]?.url;
    if (url) return <g transform={transform}>
      <defs><clipPath id={`preview-image-clip-${slide.id}-${layer.id}`}><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.cornerRadius} /></clipPath>{layer.shadow ? <filter id={`preview-image-shadow-${slide.id}-${layer.id}`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx={layer.shadowOffsetX ?? 0} dy={layer.shadowOffsetY ?? layer.shadow * 0.35} stdDeviation={layer.shadow / 2} floodColor={layer.shadowColor ?? "#000000"} floodOpacity={layer.shadowOpacity ?? 0.32} /></filter> : null}</defs>
        <image href={url} x={layer.x} y={layer.y} width={layer.width} height={layer.height} preserveAspectRatio="xMidYMid slice" opacity={layer.opacity} clipPath={`url(#preview-image-clip-${slide.id}-${layer.id})`} filter={layer.shadow ? `url(#preview-image-shadow-${slide.id}-${layer.id})` : undefined} />
        {layer.stroke && (layer.strokeWidth ?? 0) > 0 && <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.cornerRadius} fill="none" stroke={layer.strokeVisible === false ? undefined : layer.stroke} strokeOpacity={layer.strokeOpacity ?? 1} strokeWidth={layer.strokeWidth} />}
    </g>;
    return (
      <g transform={transform}>
        <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.cornerRadius} fill="#94a3b8" opacity="0.45" />
        <path d={`M ${layer.x} ${layer.y + layer.height} L ${layer.x + layer.width * 0.38} ${layer.y + layer.height * 0.42} L ${layer.x + layer.width * 0.62} ${layer.y + layer.height * 0.67} L ${layer.x + layer.width} ${layer.y + layer.height * 0.2} L ${layer.x + layer.width} ${layer.y + layer.height} Z`} fill="#cbd5e1" opacity="0.45" />
        <circle cx={layer.x + layer.width * 0.76} cy={layer.y + layer.height * 0.25} r={Math.min(layer.width, layer.height) * 0.07} fill="#f8fafc" opacity="0.55" />
        {layer.stroke && (layer.strokeWidth ?? 0) > 0 && <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.cornerRadius} fill="none" stroke={layer.strokeVisible === false ? undefined : layer.stroke} strokeOpacity={layer.strokeOpacity ?? 1} strokeWidth={layer.strokeWidth} />}
      </g>
    );
  }
  const lines = textLines(layer, slide.width);
  const fontSize = Math.max(14, layer.fontSize);
  const lineStep = fontSize * layer.lineHeight;
  const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const x = layer.align === "center" ? layer.x + layer.width / 2 : layer.align === "right" ? layer.x + layer.width : layer.x;
  const textShadowId = `preview-text-shadow-${slide.id}-${layer.id}`;
  return (
    <g transform={transform}>
    {layer.shadow ? <defs><filter id={textShadowId} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx={layer.shadowOffsetX ?? 0} dy={layer.shadowOffsetY ?? layer.shadow * 0.35} stdDeviation={layer.shadow / 2} floodColor={layer.shadowColor ?? "#000000"} floodOpacity={layer.shadowOpacity ?? 0.32} /></filter></defs> : null}
    {(layer.additionalFills ?? []).filter((paint) => paint.visible).map((paint) => <text key={paint.id} x={x} y={layer.y + fontSize} fill={paint.color} fillOpacity={paint.opacity} opacity={layer.opacity} textAnchor={anchor} fontFamily={layer.fontFamily} fontSize={fontSize} fontWeight={layer.fontWeight} fontStyle={layer.italic ? "italic" : undefined} letterSpacing={layer.letterSpacing}>{lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : lineStep}>{line}</tspan>)}</text>)}
    <text
      x={x}
      y={layer.y + fontSize}
      fill={layer.color}
      fillOpacity={layer.fillVisible === false ? 0 : layer.fillOpacity ?? 1}
      stroke={layer.strokeVisible === false ? undefined : layer.stroke}
      strokeOpacity={layer.strokeOpacity ?? 1}
      strokeWidth={layer.strokeWidth ?? 0}
      opacity={layer.opacity}
      textAnchor={anchor}
      fontFamily={layer.fontFamily}
      fontSize={fontSize}
      fontWeight={layer.fontWeight}
      fontStyle={layer.italic ? "italic" : undefined}
      letterSpacing={layer.letterSpacing}
      filter={layer.shadow ? `url(#${textShadowId})` : undefined}
    >
      {lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : lineStep}>{line}</tspan>)}
    </text>
    </g>
  );
}

export function SlidePreview({ slide, className = "", style, emptyImageSlots = false, footer }: SlidePreviewProps) {
  const byId = new Map(slide.layers.map(layer => [layer.id, layer]));
  const assets = useEditorStore((state) => state.assets);
  const background = slide.background.kind === "solid" ? slide.background.color : slide.background.kind === "gradient" ? `url(#preview-gradient-${slide.id})` : "#27272a";
  const slots = emptyImageSlots ? getImageSlots(slide) : [];
  const imageSlots = emptyImageSlots
    ? Array.from({ length: slots.length }, (_, index) => index)
    : [];

  return (
    <div className={`relative overflow-hidden rounded-md bg-black/10 ${className}`} style={style}>
      <svg viewBox={`0 0 ${slide.width} ${slide.height}`} className="block size-full" role="img" aria-label="Slide design preview" preserveAspectRatio="xMidYMid meet">
        <defs>
          {slide.background.kind === "gradient" && (
            <linearGradient id={`preview-gradient-${slide.id}`} gradientTransform={`rotate(${slide.background.angle}, 0.5, 0.5)`}>
              <stop offset="0%" stopColor={slide.background.from} />
              <stop offset="100%" stopColor={slide.background.to} />
            </linearGradient>
          )}
          <clipPath id={`preview-clip-${slide.id}`}><rect width={slide.width} height={slide.height} /></clipPath>
          {slide.background.kind === "image" && <clipPath id={`preview-bg-clip-${slide.id}`}><rect width={slide.width} height={slide.height} /></clipPath>}
        </defs>
        <g clipPath={slide.clipContent === false ? undefined : `url(#preview-clip-${slide.id})`}>
          <rect width={slide.width} height={slide.height} fill={background} fillOpacity={slide.background.kind === "solid" ? slide.background.opacity ?? 1 : 1} />
          {slide.background.kind === "image" && assets[slide.background.assetId]?.url && <image href={assets[slide.background.assetId].url} width={slide.width} height={slide.height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#preview-bg-clip-${slide.id})`} />}
          {slide.background.kind === "image" && slide.background.dim > 0 && <rect width={slide.width} height={slide.height} fill="#000" opacity={slide.background.dim} />}
          {orderedLayers(slide.layers).filter(layer => layer.visible !== false && !frameAncestors(layer, byId).some(parent => parent.visible === false)).map((layer) => <PreviewLayer key={layer.id} layer={layer} slide={slide} assets={assets} />)}
          {slide.strokeVisible !== false && slide.stroke && (slide.strokeWidth ?? 0) > 0 && <rect x={slide.strokeWidth! / 2} y={slide.strokeWidth! / 2} width={Math.max(0, slide.width - slide.strokeWidth!)} height={Math.max(0, slide.height - slide.strokeWidth!)} rx={slide.cornerRadius} fill="none" stroke={slide.stroke} strokeOpacity={slide.strokeOpacity ?? 1} strokeWidth={slide.strokeWidth} />}
          {imageSlots.map((slot) => {
            const imageLayers = slide.layers.filter((layer) => layer.type === "image");
            if (imageLayers[slot]) return null;
            const rect = slots[slot];
            if (!rect) return null;
            return <g key={`placeholder-${slot}`}>
              <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={slide.cornerRadius} fill="#64748b" opacity="0.35" />
              <path d={`M ${rect.x} ${rect.y + rect.height} L ${rect.x + rect.width * 0.4} ${rect.y + rect.height * 0.35} L ${rect.x + rect.width * 0.62} ${rect.y + rect.height * 0.65} L ${rect.x + rect.width} ${rect.y + rect.height * 0.18} L ${rect.x + rect.width} ${rect.y + rect.height} Z`} fill="#cbd5e1" opacity="0.35" />
            </g>;
          })}
        </g>
      </svg>
      {footer}
    </div>
  );
}
