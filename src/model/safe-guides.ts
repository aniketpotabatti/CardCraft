export type SafeGuidePreset = "standard" | "feed" | "story" | "minimal";

const INSETS: Record<SafeGuidePreset, { left: number; right: number; top: number; bottom: number; label: string }> = {
  standard: { left: 0.08, right: 0.08, top: 0.08, bottom: 0.08, label: "Standard safe area" },
  feed: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1, label: "Feed safe area" },
  story: { left: 0.08, right: 0.08, top: 0.12, bottom: 0.2, label: "Story / Reel UI safe area" },
  minimal: { left: 0.05, right: 0.05, top: 0.05, bottom: 0.05, label: "Minimal inset" },
};

export function safeGuideBounds(preset: SafeGuidePreset, width: number, height: number) {
  const inset = INSETS[preset];
  return {
    x: width * inset.left,
    y: height * inset.top,
    width: width * (1 - inset.left - inset.right),
    height: height * (1 - inset.top - inset.bottom),
    label: inset.label,
  };
}
