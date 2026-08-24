export type RGB = readonly [number, number, number];

export const COLOR = {
  accent: "#00E5A3",
  primary: "#7C3AED",
  textNormal: "#F8FAFC",
  textMuted: "#64748B",
  bgCanvas: "#0B0F19",
  good: "#00E5A3",
  warn: "#F59E0B",
  bad: "#EF4444",
} as const;

export const ICON = {
  success: "✓",
  prompt: "❯",
  pause: "⏸",
  folder: "📂",
  primitive: "🔹",
  manifest: "⚙",
  guide: "📝",
  package: "📦",
  spinner: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏",
} as const;

export const RULE = {
  borderFocused: "#00E5A3",
  borderUnfocused: "#1E293B",
  dividerHorizontal: "#1E293B",
} as const;

export const GUTTER = {
  paddingLeft: 2,
  paddingRight: 2,
} as const;

export const SOURCE_STYLE = {
  agents: { tag: "AGENT", hex: COLOR.primary },
  skills: { tag: "SKILL", hex: COLOR.accent },
  manifests: { tag: "JSON", hex: COLOR.warn },
  tests: { tag: "TEST", hex: "#38BDF8" },
} as const;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hexToRgb(hex: string): RGB {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected a #RRGGBB color, received ${hex}`);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function rgbToHex([red, green, blue]: RGB): string {
  return `#${[red, green, blue]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function lerpHex(from: string, to: string, alpha: number): string {
  const [fromRed, fromGreen, fromBlue] = hexToRgb(from);
  const [toRed, toGreen, toBlue] = hexToRgb(to);
  const amount = Math.max(0, Math.min(1, alpha));
  return rgbToHex([
    fromRed + (toRed - fromRed) * amount,
    fromGreen + (toGreen - fromGreen) * amount,
    fromBlue + (toBlue - fromBlue) * amount,
  ]);
}
