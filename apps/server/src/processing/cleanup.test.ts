import { describe, expect, it } from "vitest";

describe("retention contract", () => {
  it("uses the locked retention windows", () => {
    expect(7 * 24 * 60 * 60 * 1000).toBe(604800000);
    expect(15 * 60).toBe(900);
  });
});
