import { describe, expect, test } from "bun:test";
import {
  calculateSheenStep,
  getCellSheenFactor,
  pipelineStages,
  sanitizeTerminalText,
  wrapIndex,
} from "./theme";

describe("terminal navigation", () => {
  test("wraps both directions without leaving the list", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(1, 3)).toBe(1);
    expect(wrapIndex(-4, 3)).toBe(2);
  });

  test("maps the shared state contract to a live pipeline", () => {
    expect(pipelineStages("queued", 0)).toMatchObject({ progress: 8, label: "Processing" });
    expect(pipelineStages("ready", 7)).toMatchObject({ progress: 100, label: "Ready" });
    expect(pipelineStages("failed", 2).stages[0]).toMatchObject({ state: "failed" });
  });

  test("keeps sheen animation deterministic and bounded", () => {
    expect(calculateSheenStep(0, 100)).toEqual({
      sheenPeriod: 100,
      sheenCenter: -6,
      sheenIntensity: 1,
    });
    expect(calculateSheenStep(100 / 0.4, 100).sheenCenter).toBe(-6);
    expect(getCellSheenFactor(-6, -6)).toBe(1);
    expect(getCellSheenFactor(-7, -6)).toBeGreaterThan(0);
    expect(getCellSheenFactor(-13, -6)).toBe(0);
  });

  test("removes terminal control sequences from untrusted display text", () => {
    expect(sanitizeTerminalText("safe\u001b[2J\u001b[31mred\u001b[0m\u001b]0;title\u0007")).toBe(
      "safered",
    );
  });
});
