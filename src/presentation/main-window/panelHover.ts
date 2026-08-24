// Local panel hover is ordinary UI state, derived from two facts: whether the
// pointer is inside the panel and whether a drop session owns the hover.
// Effective hover is pointerInside OR dropHovering, so leaving the DOM during
// an active drop does not clear the hover until the drop session ends.
// The lifecycle keeps its own pointerInside fact; this module never writes
// lifecycle state and never holds React state (the surface mirrors it in refs
// for synchronous reads by drag/drop handlers).

export type PanelHoverState = {
  pointerInside: boolean;
  dropHovering: boolean;
};

export type PanelHoverInput =
  | { type: "pointerFact"; pointerInside: boolean }
  | { type: "dropHovering"; dropHovering: boolean };

const resolvePanelHovered = (state: PanelHoverState): boolean => (
  state.pointerInside || state.dropHovering
);

export const reducePanelHover = (
  state: PanelHoverState,
  input: PanelHoverInput,
): { state: PanelHoverState; hovered: boolean; changed: boolean } => {
  const next = input.type === "pointerFact"
    ? { pointerInside: input.pointerInside, dropHovering: state.dropHovering }
    : { pointerInside: state.pointerInside, dropHovering: input.dropHovering };
  const prevHovered = resolvePanelHovered(state);
  const hovered = resolvePanelHovered(next);
  return { state: next, hovered, changed: hovered !== prevHovered };
};
