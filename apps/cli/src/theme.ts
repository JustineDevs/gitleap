export const COLOR = {
  accent: "#00E5A3",
  primary: "#7C3AED",
  textNormal: "#F8FAFC",
  textMuted: "#64748B",
  bgCanvas: "#0B0F19",
  good: "#00E5A3",
  warn: "#F59E0B",
  bad: "#EF4444",
  border: "#1E293B",
} as const;

export const RULE = {
  borderFocused: COLOR.accent,
  borderUnfocused: COLOR.border,
  dividerHorizontal: COLOR.border,
} as const;

export const GUTTER = { paddingLeft: 2, paddingRight: 2 } as const;

export const SOURCE_STYLE = {
  agents: { tag: "AGENT", hex: COLOR.primary },
  skills: { tag: "SKILL", hex: COLOR.accent },
  manifests: { tag: "JSON", hex: COLOR.warn },
  tests: { tag: "TEST", hex: "#38BDF8" },
} as const;

export const SHEEN_CONFIG = {
  SHEEN_PEAK: 1,
  SHEEN_RADIUS: 6,
  SHEEN_TICK_MS: 50,
  SHEEN_SPEED: 0.4,
  SHEEN_MAX: 100,
} as const;

export const ICON = {
  success: "✓",
  prompt: "❯",
  pause: "⏸",
  spinner: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏",
  folder: "📂",
  primitive: "🔹",
  manifest: "⚙",
  guide: "📝",
  package: "📦",
} as const;

export function sanitizeTerminalText(value: string): string {
  let result = "";
  let sequence: "escape" | "csi" | "osc" | "oscEscape" | null = null;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (sequence === "escape") {
      sequence = code === 0x5b ? "csi" : code === 0x5d ? "osc" : null;
      continue;
    }
    if (sequence === "csi") {
      if (code >= 0x40 && code <= 0x7e) sequence = null;
      continue;
    }
    if (sequence === "osc") {
      if (code === 0x07) sequence = null;
      else if (code === 0x1b) sequence = "oscEscape";
      continue;
    }
    if (sequence === "oscEscape") {
      sequence = code === 0x5c ? null : "osc";
      continue;
    }
    if (code === 0x1b || code === 0x9b) {
      sequence = code === 0x9b ? "csi" : "escape";
      continue;
    }
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) continue;
    result += character;
  }
  return result;
}

export function calculateSheenStep(
  tickCounter: number,
  totalWidth: number,
): {
  sheenPeriod: number;
  sheenCenter: number;
  sheenIntensity: number;
} {
  const currentStep = (tickCounter * SHEEN_CONFIG.SHEEN_SPEED) % SHEEN_CONFIG.SHEEN_MAX;
  return {
    sheenPeriod: SHEEN_CONFIG.SHEEN_MAX,
    sheenCenter:
      (currentStep / SHEEN_CONFIG.SHEEN_MAX) *
        (Math.max(0, totalWidth) + SHEEN_CONFIG.SHEEN_RADIUS * 2) -
      SHEEN_CONFIG.SHEEN_RADIUS,
    sheenIntensity: SHEEN_CONFIG.SHEEN_PEAK,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace(/^#/, ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function lerpHex(from: string, to: string, alpha: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const a = Math.max(0, Math.min(1, alpha));
  return `#${[fr, fg, fb]
    .map((value, index) =>
      Math.round(value + ([tr, tg, tb][index] - value) * a)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function getCellSheenFactor(cellIndex: number, sheenCenter: number): number {
  const distance = Math.abs(cellIndex - sheenCenter);
  if (distance >= SHEEN_CONFIG.SHEEN_RADIUS) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * distance) / SHEEN_CONFIG.SHEEN_RADIUS));
}

export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export type PipelineStage = {
  name: string;
  detail: string;
  state: "done" | "busy" | "wait" | "failed";
};

const PIPELINE_STAGE_NAMES = ["queue", "index", "synthesis", "compile", "delivery"] as const;

export function pipelineStages(
  status: string,
  version: number,
): {
  stages: PipelineStage[];
  progress: number;
  label: string;
} {
  if (status === "ready")
    return {
      stages: PIPELINE_STAGE_NAMES.map((name) => ({ name, detail: "Complete", state: "done" })),
      progress: 100,
      label: "Ready",
    };
  if (["failed", "expired", "cancelled"].includes(status)) {
    return {
      stages: PIPELINE_STAGE_NAMES.map((name, index) => ({
        name,
        detail: index === 0 ? status[0].toUpperCase() + status.slice(1) : "Not reached",
        state: index === 0 ? "failed" : "wait",
      })),
      progress: 0,
      label: status[0].toUpperCase() + status.slice(1),
    };
  }

  const active = Math.min(PIPELINE_STAGE_NAMES.length - 1, Math.max(0, version - 1));
  return {
    stages: PIPELINE_STAGE_NAMES.map((name, index) => ({
      name,
      detail: index < active ? "Complete" : index === active ? "Processing" : "Waiting",
      state: index < active ? "done" : index === active ? "busy" : "wait",
    })),
    progress: Math.min(95, Math.max(8, active * 20 + (version > 0 ? 10 : 0))),
    label: "Processing",
  };
}
