import type { DrawingTool, Point } from "./drawing";
export type FigmaTool = "move" | "frame" | DrawingTool | "text" | "comments";

export type AspectId = "ig-square" | "ig-portrait" | "story" | "x-single" | "x-grid";

export type Align = "left" | "center" | "right";
export type WatermarkPosition = "tl" | "tr" | "bl" | "br" | "bc";
export type WatermarkTone = "auto" | "light" | "dark";
export type LogoTone = "light" | "dark";
export type TextRole = "title" | "body" | "caption" | "counter";
export type BackgroundKind = "solid" | "gradient" | "image";
export type LayoutId =
  | "quote"
  | "image-caption"
  | "x-2up"
  | "x-3up"
  | "x-4up"
  | "carousel-cover"
  | "carousel-content";

export interface SolidBackground {
  kind: "solid";
  color: string;
  opacity?: number;
}

export interface GradientBackground {
  kind: "gradient";
  from: string;
  to: string;
  angle: number;
}

export interface ImageBackground {
  kind: "image";
  assetId: string;
  blur: number;
  dim: number;
  crop?: Crop;
}

export type Background = SolidBackground | GradientBackground | ImageBackground;

export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

export interface LayerShadow {
  parentId?: string;
  strokeVisible?: boolean;
  blendMode?: BlendMode;
  shadow?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export type BlendMode = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion";

export interface AdditionalFill {
  id: string;
  color: string;
  opacity: number;
  visible: boolean;
}

export interface LayerConstraints {
  horizontal: "left" | "right" | "center" | "left-right" | "scale";
  vertical: "top" | "bottom" | "center" | "top-bottom" | "scale";
}

export interface LayerAutoSizing {
  width?: "fixed" | "fill";
  height?: "fixed" | "fill";
}

export interface TextLayer extends LayerShadow {
  additionalFills?: AdditionalFill[];
  autoSizing?: LayerAutoSizing;
  constraints?: LayerConstraints;
  type: "text";
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  align: Align;
  color: string;
  fillOpacity?: number;
  fillVisible?: boolean;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity: number;
  italic?: boolean;
  uppercase?: boolean;
  role?: TextRole;
  visible?: boolean;
  locked?: boolean;
  groupId?: string;
  prototypeTargetSlideId?: string;
}

export interface ImageLayer extends LayerShadow {
  autoSizing?: LayerAutoSizing;
  constraints?: LayerConstraints;
  type: "image";
  id: string;
  assetId: string;
  videoAssetId?: string;
  slotId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  crop: Crop;
  cornerRadius: number;
  opacity: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  visible?: boolean;
  locked?: boolean;
  groupId?: string;
  prototypeTargetSlideId?: string;
}

export interface ShapeLayer extends LayerShadow {
  additionalFills?: AdditionalFill[];
  autoSizing?: LayerAutoSizing;
  constraints?: LayerConstraints;
  type: "shape";
  id: string;
  shape: DrawingTool;
  points?: Point[];
  sides?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  fillVisible?: boolean;
  cornerRadius: number;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  visible?: boolean;
  locked?: boolean;
  groupId?: string;
  prototypeTargetSlideId?: string;
  isFrame?: boolean;
  autoLayout?: SlideAutoLayout;
}

export type Layer = TextLayer | ImageLayer | ShapeLayer;

export interface WatermarkSettings {
  enabled: boolean;
  position: WatermarkPosition;
  size: number;
  opacity: number;
  tone: WatermarkTone;
}

export interface LayoutGuide {
  id: string;
  type: "grid" | "columns" | "rows";
  count: number;
  size: number;
  gutter: number;
  margin: number;
  color: string;
  opacity: number;
  visible: boolean;
}

export interface SlideAutoLayout {
  flow: "horizontal" | "vertical" | "grid";
  wrap: boolean;
  gap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  alignmentX: "start" | "center" | "end";
  alignmentY: "start" | "center" | "end";
  gridColumns: number;
}

export interface ExportConfiguration {
  id: string;
  format: "image/png" | "image/webp";
  scale: 1 | 2 | 3 | 4;
  suffix: string;
}

export interface BrandKit {
  name?: string;
  handle?: string;
  logoLight: string;
  logoDark: string;
  palette: string[];
  defaultFont: string;
}

export interface Slide extends LayerShadow {
  id: string;
  aspect: AspectId;
  width: number;
  height: number;
  background: Background;
  padding: number;
  gap: number;
  cornerRadius: number;
  paddingX?: number;
  paddingY?: number;
  clipContent?: boolean;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  layoutGuides?: LayoutGuide[];
  autoLayout?: SlideAutoLayout;
  exportSettings?: ExportConfiguration[];
  layoutId: LayoutId;
  layers: Layer[];
  watermark: WatermarkSettings;
  notes?: string;
}

export interface DesignComment {
  id: string;
  slideId: string;
  layerId?: string;
  x?: number;   // slide-relative pin position (canvas comments)
  y?: number;   // slide-relative pin position (canvas comments)
  body: string;
  createdAt: number;
  resolved?: boolean;
}

export interface Project {
  id: string;
  name: string;
  slides: Slide[];
  brand: BrandKit;
  comments?: DesignComment[];
  updatedAt: number;
}

export interface LayoutSlot {
  id: string;
  kind: "image" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  role?: TextRole;
}

export function isTextLayer(layer: Layer): layer is TextLayer {
  return layer.type === "text";
}

export function isImageLayer(layer: Layer): layer is ImageLayer {
  return layer.type === "image";
}

export function isShapeLayer(layer: Layer): layer is ShapeLayer {
  return layer.type === "shape";
}
