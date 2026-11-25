import { describe, expect, it } from "vitest";
import { clampPixelRatio, maxPixelRatio } from "../export/pixel-ratio";

describe("pixel ratio clamp", () => {
  it("allows 3x on a 1080 square", () => {
    const { ratio, clamped } = clampPixelRatio(1080, 1080, 3);
    expect(ratio).toBe(3);
    expect(clamped).toBe(false);
  });

  it("clamps huge canvases under the Safari pixel cap", () => {
    const { ratio, clamped } = clampPixelRatio(8000, 8000, 4);
    expect(clamped).toBe(true);
    expect(ratio).toBeLessThanOrEqual(maxPixelRatio(8000, 8000));
  });
});
