import { wrapStep } from "@gitleap/design";

export {
  COLOR,
  calculateSheenStep,
  GUTTER,
  getCellSheenFactor,
  ICON,
  lerpHex,
  RULE,
  SHEEN_CONFIG,
  SOURCE_STYLE,
} from "@gitleap/design";

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

export function wrapIndex(index: number, length: number): number {
  return wrapStep(index, 0, length);
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
