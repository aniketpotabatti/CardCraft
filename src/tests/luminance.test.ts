import { describe, expect, it } from "vitest";
import { averageLuminance, relativeLuminance, toneFromLuminance } from "../lib/luminance";

describe("luminance", () => {
  it("treats white as light and black as dark", () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 2);
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 2);
  });

  it("picks a dark logo on a light background", () => {
    expect(toneFromLuminance(0.92)).toBe("dark");
    expect(toneFromLuminance(0.08)).toBe("light");
  });

  it("uses hysteresis so mid greys do not flicker", () => {
    expect(toneFromLuminance(0.52, "dark")).toBe("dark");
    expect(toneFromLuminance(0.48, "light")).toBe("light");
  });

  it("averages pixel buffers", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(averageLuminance(data)).toBeCloseTo(0.5, 2);
  });
});
