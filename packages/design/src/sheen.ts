import { lerpHex } from "./theme";

export const SHEEN_CONFIG = {
  SHEEN_PEAK: 1.0,
  SHEEN_RADIUS: 6.0,
  SHEEN_TICK_MS: 50,
  SHEEN_SPEED: 0.4,
  SHEEN_MAX: 100,
} as const;

export interface SheenState {
  sheenPeriod: number;
  sheenCenter: number;
  sheenIntensity: number;
}

export function calculateSheenStep(tickCounter: number, totalWidth: number): SheenState {
  const width = Math.max(0, Number.isFinite(totalWidth) ? totalWidth : 0);
  const tick = Number.isFinite(tickCounter) ? tickCounter : 0;
  const currentStep =
    (((tick * SHEEN_CONFIG.SHEEN_SPEED) % SHEEN_CONFIG.SHEEN_MAX) + SHEEN_CONFIG.SHEEN_MAX) %
    SHEEN_CONFIG.SHEEN_MAX;
  return {
    sheenPeriod: SHEEN_CONFIG.SHEEN_MAX,
    sheenCenter:
      (currentStep / SHEEN_CONFIG.SHEEN_MAX) * (width + SHEEN_CONFIG.SHEEN_RADIUS * 2) -
      SHEEN_CONFIG.SHEEN_RADIUS,
    sheenIntensity: SHEEN_CONFIG.SHEEN_PEAK,
  };
}

export function getCellSheenFactor(cellIndex: number, sheenCenter: number): number {
  const distance = Math.abs(cellIndex - sheenCenter);
  if (!Number.isFinite(distance) || distance >= SHEEN_CONFIG.SHEEN_RADIUS) return 0;
  return (
    0.5 * (1 + Math.cos((Math.PI * distance) / SHEEN_CONFIG.SHEEN_RADIUS)) * SHEEN_CONFIG.SHEEN_PEAK
  );
}

export function applySheenToColor(
  baseHex: string,
  highlightHex: string,
  sheenFactor: number,
): string {
  return lerpHex(baseHex, highlightHex, sheenFactor);
}
