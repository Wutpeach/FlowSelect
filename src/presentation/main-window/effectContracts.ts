export type MainWindowInteractionMode = "interactive" | "compact-passthrough";

export type MainWindowPresentationEffect =
  | { type: "collapseTimer.start"; timerEpoch: number; delayMs: number }
  | { type: "collapseTimer.cancel" }
  | { type: "native.prepareCompactReachability"; epoch: number }
  | { type: "native.cancelCompactReachability"; epoch: number }
  | { type: "native.setInteraction"; mode: MainWindowInteractionMode; epoch: number }
  | { type: "focus.request" };
