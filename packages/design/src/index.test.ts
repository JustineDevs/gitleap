import { describe, expect, test } from "bun:test";
import {
  applySheenToColor,
  calculateSheenStep,
  getCellSheenFactor,
  hexToRgb,
  lerpHex,
  rgbToHex,
  SHEEN_CONFIG,
  windowStart,
  wrapStep,
} from "./index";

describe("design color math", () => {
  test("round-trips RGB and emits uppercase hex", () => {
    expect(hexToRgb("#7c3aed")).toEqual([124, 58, 237]);
    expect(rgbToHex([124, 58, 237])).toBe("#7C3AED");
    expect(lerpHex("#000000", "#FFFFFF", -1)).toBe("#000000");
    expect(lerpHex("#000000", "#FFFFFF", 2)).toBe("#FFFFFF");
  });

  test("rejects malformed colors", () => {
    expect(() => hexToRgb("red")).toThrow("#RRGGBB");
  });
});

describe("deterministic sheen", () => {
  test("produces a repeatable sweep and bounded bell", () => {
    expect(calculateSheenStep(0, 100)).toEqual({
      sheenPeriod: 100,
      sheenCenter: -6,
      sheenIntensity: 1,
    });
    expect(calculateSheenStep(100 / SHEEN_CONFIG.SHEEN_SPEED, 100).sheenCenter).toBe(-6);
    expect(getCellSheenFactor(-6, -6)).toBe(1);
    expect(getCellSheenFactor(-7, -6)).toBeGreaterThan(0);
    expect(getCellSheenFactor(-13, -6)).toBe(0);
    expect(applySheenToColor("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("navigation math", () => {
  test("wraps directional movement", () => {
    expect(wrapStep(0, -1, 3)).toBe(2);
    expect(wrapStep(2, 1, 3)).toBe(0);
    expect(wrapStep(0, 1, 0)).toBe(0);
  });

  test("keeps the selected item centered when possible", () => {
    expect(windowStart(5, 0, 3, 10)).toBe(4);
    expect(windowStart(0, 5, 3, 10)).toBe(0);
    expect(windowStart(9, 8, 3, 10)).toBe(7);
    expect(windowStart(0, 0, 3, 0)).toBe(0);
  });
});
