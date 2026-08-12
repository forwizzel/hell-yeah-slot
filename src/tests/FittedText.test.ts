import { describe, expect, it } from "vitest";
import { calculateFittedFontSize } from "../presentation/FittedText";

describe("calculateFittedFontSize", () => {
  it("leaves readable content at its authored size when it fits", () => {
    expect(calculateFittedFontSize(24, 120, 100)).toBe(24);
  });

  it("reduces the actual font size for oversized content", () => {
    expect(calculateFittedFontSize(24, 120, 300)).toBe(9.6);
  });

  it("does not produce invalid sizes for unmeasurable content", () => {
    expect(calculateFittedFontSize(24, 0, 100)).toBe(24);
    expect(calculateFittedFontSize(24, 100, 0)).toBe(24);
  });
});
