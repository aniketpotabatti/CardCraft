import { DEFAULT_LOGO_DARK, DEFAULT_LOGO_LIGHT } from "../assets/logos";
import type { AspectId, BrandKit, LayoutId, WatermarkSettings } from "./types";

export interface AspectPreset {
  id: AspectId;
  label: string;
  width: number;
  height: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "ig-square", label: "IG Square", width: 1080, height: 1080 },
  { id: "ig-portrait", label: "IG Portrait 4:5", width: 1080, height: 1350 },
  { id: "story", label: "Story / Reel 9:16", width: 1080, height: 1920 },
  { id: "x-single", label: "X Single 16:9", width: 1600, height: 900 },
  { id: "x-grid", label: "X Multi-image", width: 1600, height: 900 },
];

export const DEFAULT_ASPECT: AspectId = "ig-portrait";

export const FONTS = [
  { id: "Inter", label: "Inter" },
  { id: "Playfair Display", label: "Playfair Display" },
  { id: "Source Serif 4", label: "Source Serif" },
  { id: "DM Sans", label: "DM Sans" },
  { id: "Space Grotesk", label: "Space Grotesk" },
  { id: "Instrument Serif", label: "Instrument Serif" },
  { id: "IBM Plex Sans", label: "IBM Plex Sans" },
  { id: "Libre Baskerville", label: "Libre Baskerville" },
] as const;

export const FONT_WEIGHTS = [
  { id: 400, label: "Regular" },
  { id: 500, label: "Medium" },
  { id: 600, label: "Semibold" },
  { id: 700, label: "Bold" },
] as const;

export const DEFAULT_PALETTE = [
  "#111111",
  "#F7F4EE",
  "#E8C39A",
  "#C45C26",
  "#2F4F4F",
  "#6EA8FE",
  "#FFFFFF",
  "#1C1917",
];

export const BRAND_PRESETS: { name: string; brand: BrandKit }[] = [
  {
    name: "Modern Studio",
    brand: {
      name: "Modern Studio",
      handle: "@cardcraft",
      logoLight: DEFAULT_LOGO_LIGHT,
      logoDark: DEFAULT_LOGO_DARK,
      palette: ["#111111", "#F7F4EE", "#E8C39A", "#C45C26", "#2F4F4F", "#6EA8FE", "#FFFFFF", "#1C1917"],
      defaultFont: "Inter",
    },
  },
  {
    name: "Editorial Serif",
    brand: {
      name: "The Digest",
      handle: "@digest.mag",
      logoLight: DEFAULT_LOGO_LIGHT,
      logoDark: DEFAULT_LOGO_DARK,
      palette: ["#1A1A1A", "#FAF8F5", "#D4AF37", "#8B0000", "#2C3E50", "#7F8C8D", "#FFFFFF", "#2F3640"],
      defaultFont: "Playfair Display",
    },
  },
  {
    name: "Tech & Startup",
    brand: {
      name: "VentureCraft",
      handle: "@venturecraft",
      logoLight: DEFAULT_LOGO_LIGHT,
      logoDark: DEFAULT_LOGO_DARK,
      palette: ["#090A0F", "#F8FAFC", "#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#FFFFFF", "#1E293B"],
      defaultFont: "Space Grotesk",
    },
  },
];

export const DEFAULT_BRAND: BrandKit = BRAND_PRESETS[0].brand;

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: true,
  position: "br",
  size: 220,
  opacity: 0.92,
  tone: "auto",
};

export const LAYOUTS: { id: LayoutId; label: string; hint: string }[] = [
  { id: "quote", label: "Quote", hint: "Text only" },
  { id: "image-caption", label: "Image + caption", hint: "1 photo, 1 caption" },
  { id: "x-2up", label: "2-up", hint: "X pair" },
  { id: "x-3up", label: "3-up", hint: "Large + stack" },
  { id: "x-4up", label: "4-up", hint: "2×2 grid" },
  { id: "carousel-cover", label: "Carousel cover", hint: "Title + accent" },
  { id: "carousel-content", label: "Carousel content", hint: "Heading, body, counter" },
];

export function aspectById(id: AspectId): AspectPreset {
  return ASPECT_PRESETS.find((preset) => preset.id === id) ?? ASPECT_PRESETS[1];
}

export function defaultLayoutForAspect(aspect: AspectId): LayoutId {
  if (aspect === "x-grid") return "x-2up";
  if (aspect === "x-single") return "image-caption";
  return "quote";
}
