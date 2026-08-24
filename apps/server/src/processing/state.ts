export type InternalState =
  | "queued"
  | "claimed"
  | "processing"
  | "ready"
  | "failed_retryable"
  | "failed_terminal"
  | "cancel_requested"
  | "cancelled"
  | "expired";

const transitions: Record<InternalState, readonly InternalState[]> = {
  // Queued jobs have no lease or external side effect, so cancellation is terminal.
  queued: ["claimed", "cancelled", "failed_retryable"],
  claimed: ["processing", "cancel_requested", "failed_retryable"],
  processing: ["ready", "cancel_requested", "failed_retryable", "failed_terminal"],
  ready: ["expired"],
  failed_retryable: ["queued", "claimed"],
  failed_terminal: [],
  cancel_requested: ["cancelled"],
  cancelled: [],
  expired: [],
};

export function canTransition(from: InternalState, to: InternalState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: InternalState, to: InternalState): void {
  if (!canTransition(from, to)) throw new Error(`ILLEGAL_STATE_TRANSITION:${from}:${to}`);
}

export function publicState(
  state: InternalState,
): "queued" | "running" | "ready" | "failed" | "cancelled" | "expired" {
  if (state === "queued" || state === "failed_retryable") return "queued";
  if (state === "claimed" || state === "processing" || state === "cancel_requested")
    return "running";
  if (state === "failed_terminal") return "failed";
  return state;
}
