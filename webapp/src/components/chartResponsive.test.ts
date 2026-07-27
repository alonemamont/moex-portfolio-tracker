import { describe, it, expect } from "vitest";
import { getChartTickFontSize, getChartLegendFontSize } from "./chartResponsive";

describe("chartResponsive", () => {
  it("increases tick font size on mobile", () => {
    expect(getChartTickFontSize(false)).toBe(11);
    expect(getChartTickFontSize(true)).toBe(13);
  });

  it("increases legend font size on mobile", () => {
    expect(getChartLegendFontSize(false)).toBe(12);
    expect(getChartLegendFontSize(true)).toBe(14);
  });
});
