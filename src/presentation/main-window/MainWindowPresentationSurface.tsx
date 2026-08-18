import {
  AnimatePresence,
  motion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  COMPACT_EASE,
  getContinuousCornerStyle,
  getPanelShellStyle,
  getShadowBackdropStyle,
} from "../../components/ui/shared-styles";
import { useTheme } from "../../contexts/ThemeContext";
import { desktopCurrentWindow, isElectronRenderer } from "../../desktop/runtime";
import { CompactCatCharacter } from "./CompactCatCharacter";
import { CHARACTER_VISUAL_SIZE } from "./characterRecipe";
import {
  shouldIgnorePanelDoubleClickTarget,
  shouldOpenOutputFolderFromPanelMouseDownDoubleClick,
  shouldPreventPanelNativeDragStart,
  resolvePanelPointerCaptureId,
  WINDOW_DRAG_START_THRESHOLD,
} from "../../utils/mainPanelInteractions";
import { isPointInsideCompactPointerHotspot } from "../../utils/compactPointerHotspot";
import type { MainWindowPresentationBinding } from "./reactAdapter";
import { resolveMainWindowPresentationProjections } from "./projections";
import type { MainWindowPresentationEvent, MainWindowPresentationLock } from "./lifecycle";
import { reducePanelHover, type PanelHoverInput } from "./panelHover";
import { resolveMainWindowGeometry } from "./geometry";
import {
  resolveMainWindowShellMotionRecipe,
  MAIN_WINDOW_INITIAL_PANEL_SCALE,
} from "./motionRecipes";
import {
  resetPointerFieldToCenter,
  snapshotPointerFieldOrigin,
  updatePointerFieldFromClientPoint,
  useMainWindowPointerField,
  type MainWindowPointerField,
} from "./pointerField";
import { useMainWindowMagnetic } from "./magnetic";
import { ExpandedPresentationSurface } from "./ExpandedPresentationSurface";
import type { ExpandedPresentationTarget } from "./expandedPresentationTargets";
import { THERMAL_PALETTE } from "./thermalPalette";
import type { LocalIntakeOrigin } from "../../application/download-api";

/**
 * Lock facts owned by Application state and mirrored from App into the
 * lifecycle. `drag` and `drop` are intentionally excluded: they are
 * Surface-owned facts written at the gesture boundary (pointer/drop paths),
 * never published from App.
 */
export type MainWindowApplicationLock = Exclude<
  MainWindowPresentationLock,
  "drag" | "drop"
>;

const DRAG_GLOW_BORDER_WIDTH = 2.4;
const PANEL_OUTPUT_FOLDER_SHORTCUT_DEDUP_MS = 400;
const DRAG_GLOW_GRADIENT: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  padding: DRAG_GLOW_BORDER_WIDTH,
  background: `linear-gradient(
    135deg,
    rgba(125,211,252,0.96) 0%,
    rgba(96,165,250,0.98) 35%,
    rgba(59,130,246,0.96) 65%,
    rgba(147,197,253,0.92) 100%
  )`,
  boxShadow: `
    inset 0 0 0 1px rgba(191,219,254,0.85),
    inset 0 0 22px rgba(59,130,246,0.28),
    inset 0 0 36px rgba(96,165,250,0.16)
  `,
  mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  maskComposite: "exclude",
  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor",
};

export type MainWindowPresentationSurfaceProps = {
  presentation: MainWindowPresentationBinding;
  environment: {
    platform: NodeJS.Platform;
    isMacOS: boolean;
    supportsCompactPassthrough: boolean;
    reducedMotion: boolean;
    startsCompact: boolean;
  };
  locks: Record<MainWindowApplicationLock, boolean>;
  primaryTaskKind: "download" | "transcode" | null;
  /** MR8 pure policy output; the host receives no competing semantic lanes. */
  expandedPresentationTarget: ExpandedPresentationTarget;
  isContextMenuOpen: boolean;
  /** Application busy state that blocks the panel double-click shortcut. */
  interactionBusy: boolean;
  /** Optional ordinary UI callback for panel hover (application content needs). */
  onPanelHoveredChange?: (hovered: boolean) => void;
  onCloseContextMenu: () => Promise<void>;
  onOutputFolderShortcut: (e: ReactMouseEvent<HTMLDivElement>) => Promise<void>;
  onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => Promise<void>;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => Promise<void>;
  onPaste: (clipboardData: DataTransfer | null, origin: LocalIntakeOrigin | undefined) => void;
  children: ReactNode;
};

type PendingWindowDragStart = {
  pointerId: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  windowPositionPromise: Promise<{ x: number; y: number }>;
};

type ActiveWindowDragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  windowX: number;
  windowY: number;
  nextX: number;
  nextY: number;
  lastAppliedX: number;
  lastAppliedY: number;
};

type UseMainWindowPanelDragOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  pointerField: MainWindowPointerField;
  dispatch: MainWindowPresentationBinding["dispatch"];
  isCompact: boolean;
  isContextMenuOpen: boolean;
  canDoubleClickOpenOutputFolder: boolean;
  isMacOS: boolean;
  onCloseContextMenu: () => Promise<void>;
  onOutputFolderShortcut: (e: ReactMouseEvent<HTMLDivElement>) => Promise<void>;
};

const useMainWindowPanelDrag = ({
  containerRef,
  viewportRef,
  pointerField,
  dispatch,
  isCompact,
  isContextMenuOpen,
  canDoubleClickOpenOutputFolder,
  isMacOS,
  onCloseContextMenu,
  onOutputFolderShortcut,
}: UseMainWindowPanelDragOptions) => {
  const pendingDragStartRef = useRef<PendingWindowDragStart | null>(null);
  const activeWindowDragRef = useRef<ActiveWindowDragState | null>(null);
  const isWindowPointerDownRef = useRef(false);
  const windowDragFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastPanelOutputFolderShortcutAtRef = useRef(0);

  const syncMainWindowInteraction = useCallback(() => {
    if (isCompact) {
      dispatch({ type: "pointerEnter" });
    }
  }, [dispatch, isCompact]);

  const flushWindowDragPosition = useCallback(() => {
    windowDragFrameRef.current = null;
    const dragState = activeWindowDragRef.current;
    if (!dragState) {
      return;
    }
    if (
      dragState.lastAppliedX === dragState.nextX
      && dragState.lastAppliedY === dragState.nextY
    ) {
      return;
    }
    dragState.lastAppliedX = dragState.nextX;
    dragState.lastAppliedY = dragState.nextY;
    if (isElectronRenderer()) {
      desktopCurrentWindow.setPosition({
        x: dragState.nextX,
        y: dragState.nextY,
      });
    }
  }, []);

  const scheduleWindowDragPosition = useCallback(() => {
    if (windowDragFrameRef.current !== null) {
      return;
    }
    windowDragFrameRef.current = window.requestAnimationFrame(() => {
      flushWindowDragPosition();
    });
  }, [flushWindowDragPosition]);

  const updateManualWindowDrag = useCallback((screenX: number, screenY: number) => {
    const dragState = activeWindowDragRef.current;
    if (!dragState) {
      return;
    }
    dragState.nextX = Math.round(dragState.windowX + (screenX - dragState.startScreenX));
    dragState.nextY = Math.round(dragState.windowY + (screenY - dragState.startScreenY));
    if (
      dragState.nextX === dragState.lastAppliedX
      && dragState.nextY === dragState.lastAppliedY
    ) {
      return;
    }
    scheduleWindowDragPosition();
  }, [scheduleWindowDragPosition]);

  const releasePanelPointerCapture = useCallback((pointerId: number | null) => {
    if (pointerId === null) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    try {
      if (container.hasPointerCapture(pointerId)) {
        container.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore browsers that already released or never established pointer capture.
    }
  }, [containerRef]);

  const resetWindowDragState = useCallback((options?: {
    eventPointerId?: number | null;
  }) => {
    const pointerId = resolvePanelPointerCaptureId({
      eventPointerId: options?.eventPointerId ?? null,
      activePointerId: activeWindowDragRef.current?.pointerId ?? null,
      pendingPointerId: pendingDragStartRef.current?.pointerId ?? null,
    });
    releasePanelPointerCapture(pointerId);
    pendingDragStartRef.current = null;
    activeWindowDragRef.current = null;
    isWindowPointerDownRef.current = false;
    dispatch({ type: "setLock", lock: "drag", active: false });
    if (windowDragFrameRef.current !== null) {
      window.cancelAnimationFrame(windowDragFrameRef.current);
      windowDragFrameRef.current = null;
    }
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    if (wasDragging) {
      syncMainWindowInteraction();
    }
  }, [dispatch, releasePanelPointerCapture, syncMainWindowInteraction]);

  const startWindowDrag = useCallback(async (screenX: number, screenY: number) => {
    const pendingDragStart = pendingDragStartRef.current;
    if (!pendingDragStart || isDraggingRef.current) {
      return;
    }
    pendingDragStartRef.current = null;
    isDraggingRef.current = true;
    dispatch({ type: "setLock", lock: "drag", active: true });

    try {
      const windowPosition = await pendingDragStart.windowPositionPromise;
      if (!isWindowPointerDownRef.current) {
        isDraggingRef.current = false;
        dispatch({ type: "setLock", lock: "drag", active: false });
        syncMainWindowInteraction();
        return;
      }
      activeWindowDragRef.current = {
        pointerId: pendingDragStart.pointerId,
        startScreenX: pendingDragStart.screenX,
        startScreenY: pendingDragStart.screenY,
        windowX: windowPosition.x,
        windowY: windowPosition.y,
        nextX: windowPosition.x,
        nextY: windowPosition.y,
        lastAppliedX: windowPosition.x,
        lastAppliedY: windowPosition.y,
      };
      updateManualWindowDrag(screenX, screenY);
    } catch (err) {
      console.error("Failed to start manual window drag:", err);
      isDraggingRef.current = false;
      dispatch({ type: "setLock", lock: "drag", active: false });
      syncMainWindowInteraction();
    }
  }, [dispatch, syncMainWindowInteraction, updateManualWindowDrag]);

  const triggerPanelOutputFolderShortcut = useCallback(async (
    e: ReactMouseEvent<HTMLDivElement>,
  ) => {
    const now = Date.now();
    if (now - lastPanelOutputFolderShortcutAtRef.current < PANEL_OUTPUT_FOLDER_SHORTCUT_DEDUP_MS) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastPanelOutputFolderShortcutAtRef.current = now;
    resetWindowDragState();
    e.preventDefault();
    e.stopPropagation();
    syncMainWindowInteraction();
    await onOutputFolderShortcut(e);
  }, [onOutputFolderShortcut, resetWindowDragState, syncMainWindowInteraction]);

  const handlePanelPointerDown = useCallback(async (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    if (isContextMenuOpen) {
      await onCloseContextMenu();
      return;
    }
    if (isCompact) {
      syncMainWindowInteraction();
      return;
    }
    const targetIgnored = shouldIgnorePanelDoubleClickTarget(e.target);
    if (targetIgnored) {
      resetWindowDragState();
      return;
    }
    if (shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS,
      button: e.button,
      detail: e.detail,
      canDoubleClickOpenOutputFolder,
      targetIgnored,
    })) {
      await triggerPanelOutputFolderShortcut(e);
      return;
    }
    isWindowPointerDownRef.current = true;
    dispatch({ type: "setLock", lock: "drag", active: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore environments where pointer capture cannot be established.
    }
    pendingDragStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      windowPositionPromise: isElectronRenderer()
        ? desktopCurrentWindow.outerPosition()
        : Promise.resolve({ x: window.screenX, y: window.screenY }),
    };
  }, [
    canDoubleClickOpenOutputFolder,
    dispatch,
    isCompact,
    isContextMenuOpen,
    isMacOS,
    onCloseContextMenu,
    resetWindowDragState,
    syncMainWindowInteraction,
    triggerPanelOutputFolderShortcut,
  ]);

  const syncPointerFieldFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    updatePointerFieldFromClientPoint(pointerField, clientX, clientY, rect);
  }, [pointerField, viewportRef]);

  const handlePanelPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    syncPointerFieldFromClientPoint(e.clientX, e.clientY);

    if (isDraggingRef.current) {
      const activeDrag = activeWindowDragRef.current;
      if (activeDrag && activeDrag.pointerId === e.pointerId) {
        updateManualWindowDrag(e.screenX, e.screenY);
      }
      return;
    }

    const pendingDragStart = pendingDragStartRef.current;
    if (
      !pendingDragStart
      || pendingDragStart.pointerId !== e.pointerId
      || e.buttons !== 1
      || isCompact
    ) {
      return;
    }

    const dragDistance = Math.hypot(
      e.clientX - pendingDragStart.clientX,
      e.clientY - pendingDragStart.clientY,
    );
    if (dragDistance < WINDOW_DRAG_START_THRESHOLD) {
      return;
    }

    void startWindowDrag(e.screenX, e.screenY);
  }, [
    isCompact,
    startWindowDrag,
    syncPointerFieldFromClientPoint,
    updateManualWindowDrag,
  ]);

  const finishWindowDrag = useCallback((eventPointerId?: number | null) => {
    resetWindowDragState({
      eventPointerId: eventPointerId ?? null,
    });
  }, [resetWindowDragState]);

  const handlePanelPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      finishWindowDrag(e.pointerId);
      return;
    }
    resetWindowDragState({
      eventPointerId: e.pointerId,
    });
  }, [finishWindowDrag, resetWindowDragState]);

  const handlePanelPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      finishWindowDrag(e.pointerId);
      return;
    }
    resetWindowDragState({
      eventPointerId: e.pointerId,
    });
  }, [finishWindowDrag, resetWindowDragState]);

  const handlePanelDoubleClick = useCallback(async (e: ReactMouseEvent<HTMLDivElement>) => {
    resetWindowDragState();
    if (e.button !== 0 || !canDoubleClickOpenOutputFolder) {
      return;
    }
    if (shouldIgnorePanelDoubleClickTarget(e.target)) {
      return;
    }
    await triggerPanelOutputFolderShortcut(e);
  }, [canDoubleClickOpenOutputFolder, resetWindowDragState, triggerPanelOutputFolderShortcut]);

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (
        !isDraggingRef.current
        && !pendingDragStartRef.current
        && !activeWindowDragRef.current
        && !isWindowPointerDownRef.current
      ) {
        return;
      }
      resetWindowDragState();
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [resetWindowDragState]);

  useEffect(() => () => {
    if (windowDragFrameRef.current !== null) {
      window.cancelAnimationFrame(windowDragFrameRef.current);
    }
  }, []);

  return {
    handlePanelPointerDown,
    handlePanelPointerMove,
    handlePanelPointerUp,
    handlePanelPointerCancel,
    handlePanelDoubleClick,
    syncPointerFieldFromClientPoint,
    resetWindowDragState,
  };
};

export function MainWindowPresentationSurface({
  presentation,
  environment,
  locks,
  primaryTaskKind,
  expandedPresentationTarget,
  isContextMenuOpen,
  interactionBusy,
  onCloseContextMenu,
  onOutputFolderShortcut,
  onContextMenu,
  onDrop,
  onPaste,
  onPanelHoveredChange,
  children,
}: MainWindowPresentationSurfaceProps) {
  const { colors, theme } = useTheme();
  const { state, dispatch } = presentation;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isPointerInsidePanelRef = useRef(false);
  const isPanelHoveredRef = useRef(false);
  const isDropHoveringRef = useRef(false);
  const compactHotspotInsideRef = useRef(false);
  const compactHotspotFrameRef = useRef<number | null>(null);
  const suppressNextPanelDragLeaveRef = useRef(false);

  const [isDragHovering, setIsDragHovering] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [settlePulseKey, setSettlePulseKey] = useState(0);

  // The hover callback is forwarded through a ref so the drop/hover handlers
  // stay stable; only the latest consumer callback is invoked.
  const onPanelHoveredChangeRef = useRef(onPanelHoveredChange);
  useEffect(() => {
    onPanelHoveredChangeRef.current = onPanelHoveredChange;
  }, [onPanelHoveredChange]);

  // One semantic input for every hover fact source. Effective local hover is
  // pointerInside OR dropHovering; `onPanelHoveredChange` fires only when the
  // effective boolean actually changes. The lifecycle keeps its own
  // pointerInside fact — this never writes lifecycle state.
  const applyPanelHoverInput = useCallback((input: PanelHoverInput) => {
    const { state, hovered, changed } = reducePanelHover({
      pointerInside: isPointerInsidePanelRef.current,
      dropHovering: isDropHoveringRef.current,
    }, input);
    isPointerInsidePanelRef.current = state.pointerInside;
    isDropHoveringRef.current = state.dropHovering;
    if (!changed) {
      return;
    }
    isPanelHoveredRef.current = hovered;
    onPanelHoveredChangeRef.current?.(hovered);
  }, []);

  const projections = useMemo(
    () => resolveMainWindowPresentationProjections(state, {
      supportsCompactPassthrough: environment.supportsCompactPassthrough,
    }),
    [environment.supportsCompactPassthrough, state],
  );
  const isCompact = projections.visual.mode === "compact";
  const canDoubleClickOpenOutputFolder = !isCompact && !interactionBusy;

  const geometry = useMemo(
    () => resolveMainWindowGeometry({ mode: projections.visual.mode, platform: environment.platform }),
    [environment.platform, projections.visual.mode],
  );

  const motionRecipe = useMemo(
    () => resolveMainWindowShellMotionRecipe({
      projection: projections.visual,
      visualShell: geometry.visualShell,
      reducedMotion: environment.reducedMotion,
      isInitialMount,
      isMacOS: environment.isMacOS,
    }),
    [environment.isMacOS, environment.reducedMotion, geometry.visualShell, isInitialMount, projections.visual],
  );

  const panelRadius = geometry.visualShell.radius;
  const shadowRadius = geometry.shadowShell.radius;
  const panelViewportSize = geometry.viewportSize;
  const shadowOffsetX = geometry.shadowShell.x;
  const shadowOffsetY = geometry.shadowShell.y;
  const shadowRenderSize = geometry.shadowShell.width;

  // Pointer Field: the one renderer-local continuous pointer authority. Its
  // MotionValues are runtime data only and never enter React/lifecycle state.
  // Initialized at the stable root center so an enabled Magnetic consumer
  // resolves to zero before the first pointer enter.
  const pointerField = useMainWindowPointerField(panelViewportSize);

  // Centralized pointer-fact handler: every real enter/leave input updates
  // the local hover UI state, resets the Pointer Field on leave, and
  // dispatches the matching lifecycle event in one place, in a fixed order
  // (local hover first, then the field, then the lifecycle).
  const handlePointerFact = useCallback((
    pointerInside: boolean,
    lifecycleEvent: Extract<MainWindowPresentationEvent, {
      type: "pointerEnter" | "pointerLeave";
    }> | null,
  ) => {
    applyPanelHoverInput({ type: "pointerFact", pointerInside });
    if (!pointerInside) {
      resetPointerFieldToCenter(pointerField, panelViewportSize);
    }
    if (lifecycleEvent !== null) {
      dispatch(lifecycleEvent);
    }
  }, [applyPanelHoverInput, dispatch, panelViewportSize, pointerField]);

  // Magnetic eligibility: settled full shell only (full/collapsePending are
  // mode "full" with no transition in flight; expanding has an epoch), and
  // never under reduced motion or while the drag lock holds.
  const magneticEnabled = (
    projections.visual.mode === "full"
    && projections.visual.transitionEpoch === null
    && !environment.reducedMotion
    && !state.locks.drag
  );
  const magnetic = useMainWindowMagnetic(pointerField, panelViewportSize, magneticEnabled);

  // Expanded graphics eligibility is a read-only lifecycle projection. The
  // renderer never writes lifecycle state or progresses a transition.
  const expandedGraphicsEligible = (
    projections.visual.mode === "full"
    && projections.visual.transitionEpoch === null
  );

  // Application-owned lock facts flow from App into the lifecycle. The reducer
  // is idempotent, so re-dispatching unchanged facts is a no-op. `drag` and
  // `drop` are NOT mirrored here: the gesture paths below own those writes
  // (pointer down/up/cancel and drop enter/leave), so an unrelated App lock
  // change can never re-publish a constant false over an active Surface-owned
  // lock.
  useEffect(() => {
    dispatch({ type: "setLock", lock: "contextMenu", active: locks.contextMenu });
    dispatch({ type: "setLock", lock: "task", active: locks.task });
    dispatch({ type: "setLock", lock: "centerOutcome", active: locks.centerOutcome });
    dispatch({ type: "setLock", lock: "appUpdate", active: locks.appUpdate });
  }, [dispatch, locks]);

  // Startup settle: clear the initial-mount recipe and, for full-starting
  // environments, let the lifecycle begin its normal collapse pending path.
  useEffect(() => {
    if (isInitialMount) {
      const timer = window.setTimeout(() => {
        setIsInitialMount(false);
        dispatch({ type: "startupSettle" });
      }, 100);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [dispatch, isInitialMount]);

  // Post-compact icon settle pulse keyed by the lifecycle settle epoch.
  useEffect(() => {
    if (projections.visual.settleEpoch === null) {
      return;
    }
    setSettlePulseKey(projections.visual.settleEpoch);
  }, [projections.visual.settleEpoch]);

  // Native pointer-boundary facts enter the lifecycle with a subscription
  // generation guard: emissions from a replaced subscription are ignored.
  useEffect(() => {
    if (!projections.interaction.pointerBoundaryActive) {
      return;
    }
    if (!isElectronRenderer()) {
      return;
    }
    let cancelled = false;
    const unlistenPromise = desktopCurrentWindow.onPointerBoundaryChanged(({ payload }) => {
      if (cancelled) {
        return;
      }
      handlePointerFact(payload.inside, payload.inside
        ? { type: "pointerEnter" }
        : { type: "pointerLeave" });
    });
    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
  }, [handlePointerFact, projections.interaction.pointerBoundaryActive]);

  // DOM mouseout fallback for transparent windows that may lose enter/leave
  // events during morphs (full presentation mode only).
  useEffect(() => {
    if (projections.visual.mode !== "full") {
      return;
    }
    const handleWindowMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget !== null) {
        return;
      }
      handlePointerFact(false, { type: "pointerLeave" });
    };
    window.addEventListener("mouseout", handleWindowMouseOut);
    return () => {
      window.removeEventListener("mouseout", handleWindowMouseOut);
    };
  }, [handlePointerFact, projections.visual.mode]);

  // Windows compact hotspot: window-level mousemove hysteresis while the
  // compact passthrough surface is active.
  const evaluateCompactHotspot = useCallback((clientX: number, clientY: number) => {
    if (!projections.interaction.hotspotActive) {
      return;
    }
    // Windows compact passthrough forwards window `mousemove` (but no
    // `mouseleave`); feed the SAME coordinates through the existing sole
    // Pointer Field writer so the read-only Character can show a bounded
    // pre-hotspot glance. The hotspot evaluation below is unchanged; this
    // write is runtime data only and can never decide full/compact state.
    const viewport = viewportRef.current;
    if (viewport !== null) {
      const rect = viewport.getBoundingClientRect();
      updatePointerFieldFromClientPoint(pointerField, clientX, clientY, rect);
    }
    const insideHotspot = isPointInsideCompactPointerHotspot({
      pointX: clientX,
      pointY: clientY,
      centerX: geometry.hotspot.centerX,
      centerY: geometry.hotspot.centerY,
      enterRadius: geometry.hotspot.enterRadius,
      exitRadius: geometry.hotspot.exitRadius,
      wasInside: compactHotspotInsideRef.current,
    });
    if (!insideHotspot || compactHotspotInsideRef.current) {
      compactHotspotInsideRef.current = insideHotspot;
      return;
    }
    compactHotspotInsideRef.current = true;
    handlePointerFact(true, { type: "pointerEnter" });
  }, [
    geometry.hotspot,
    handlePointerFact,
    pointerField,
    projections.interaction.hotspotActive,
    viewportRef,
  ]);

  useEffect(() => {
    if (!projections.interaction.hotspotActive) {
      return;
    }
    compactHotspotInsideRef.current = false;
    const handleMouseMove = (event: MouseEvent) => {
      if (compactHotspotFrameRef.current !== null) {
        return;
      }
      const { clientX, clientY } = event;
      compactHotspotFrameRef.current = requestAnimationFrame(() => {
        compactHotspotFrameRef.current = null;
        evaluateCompactHotspot(clientX, clientY);
      });
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      if (compactHotspotFrameRef.current !== null) {
        cancelAnimationFrame(compactHotspotFrameRef.current);
        compactHotspotFrameRef.current = null;
      }
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [
    evaluateCompactHotspot,
    projections.interaction.hotspotActive,
  ]);

  // Observable neutral reset: window blur and document hidden are observable
  // pointer losses, so the Pointer Field returns to center through the shared
  // sole writer; the read-only Character then projects neutral. No Character
  // listener, loss timer, native event, or new authority. The unobservable
  // Windows passthrough exit keeps its bounded zero-work freeze (mousemove
  // forwarding stops and the field simply stops updating).
  useEffect(() => {
    const handleWindowBlur = () => {
      resetPointerFieldToCenter(pointerField, panelViewportSize);
    };
    const handleDocumentVisibilityChange = () => {
      if (document.hidden) {
        resetPointerFieldToCenter(pointerField, panelViewportSize);
      }
    };
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
    };
  }, [panelViewportSize, pointerField]);

  const drag = useMainWindowPanelDrag({
    containerRef,
    viewportRef,
    pointerField,
    dispatch,
    isCompact,
    isContextMenuOpen,
    canDoubleClickOpenOutputFolder,
    isMacOS: environment.isMacOS,
    onCloseContextMenu,
    onOutputFolderShortcut,
  });

  const isPointInsidePanel = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) {
      return false;
    }
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (elementAtPoint && container.contains(elementAtPoint)) {
      return true;
    }
    const rect = container.getBoundingClientRect();
    return (
      clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom
    );
  }, []);

  const updateDropHoverState = useCallback((isDropHovering: boolean) => {
    applyPanelHoverInput({ type: "dropHovering", dropHovering: isDropHovering });
  }, [applyPanelHoverInput]);

  const suppressNextPanelDragLeave = useCallback(() => {
    suppressNextPanelDragLeaveRef.current = true;
    window.setTimeout(() => {
      suppressNextPanelDragLeaveRef.current = false;
    }, 100);
  }, []);

  const clearPanelDropInteractionState = useCallback(({
    pointerInside = false,
  }: {
    pointerInside?: boolean;
  } = {}) => {
    setIsDragHovering(false);
    applyPanelHoverInput({ type: "pointerFact", pointerInside });
    if (!pointerInside) {
      // The pointer is outside after the drop session; center the field so
      // Magnetic cannot stay displaced toward the last pre-drag point.
      resetPointerFieldToCenter(pointerField, panelViewportSize);
    }
    updateDropHoverState(false);
    dispatch(pointerInside
      ? { type: "setLock", lock: "drop", active: false }
      : { type: "dropLeave" });
  }, [applyPanelHoverInput, dispatch, panelViewportSize, pointerField, updateDropHoverState]);

  // Global drop session end (drop/dragend/blur) releases the drop lock.
  useEffect(() => {
    const handleGlobalDropSessionEnd = () => {
      clearPanelDropInteractionState();
    };
    window.addEventListener("drop", handleGlobalDropSessionEnd, true);
    window.addEventListener("dragend", handleGlobalDropSessionEnd, true);
    window.addEventListener("blur", handleGlobalDropSessionEnd);
    return () => {
      window.removeEventListener("drop", handleGlobalDropSessionEnd, true);
      window.removeEventListener("dragend", handleGlobalDropSessionEnd, true);
      window.removeEventListener("blur", handleGlobalDropSessionEnd);
    };
  }, [clearPanelDropInteractionState]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragHovering(false);
    const pointerInsideAfterDrop = isPointInsidePanel(e.clientX, e.clientY);
    applyPanelHoverInput({ type: "pointerFact", pointerInside: pointerInsideAfterDrop });
    updateDropHoverState(true);
    dispatch({ type: "dropEnter" });

    try {
      await onDrop(e);
    } finally {
      suppressNextPanelDragLeave();
      clearPanelDropInteractionState({ pointerInside: pointerInsideAfterDrop });
    }
  }, [
    applyPanelHoverInput,
    clearPanelDropInteractionState,
    dispatch,
    isPointInsidePanel,
    onDrop,
    suppressNextPanelDragLeave,
    updateDropHoverState,
  ]);

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      const origin = expandedGraphicsEligible && isPointerInsidePanelRef.current
        ? snapshotPointerFieldOrigin(pointerField, panelViewportSize)
        : undefined;
      onPaste(event.clipboardData, origin);
    };
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [expandedGraphicsEligible, onPaste, panelViewportSize, pointerField]);

  const handleContextMenu = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drag.resetWindowDragState();
    void onContextMenu(e);
  }, [drag, onContextMenu]);

  // Motion completion reports the current transition epoch; the lifecycle
  // ignores stale epochs (reversal, interruption).
  const handleAnimationComplete = useCallback(() => {
    const epoch = projections.visual.transitionEpoch;
    if (epoch === null) {
      return;
    }
    dispatch({
      type: "visualTransitionCompleted",
      target: projections.visual.completionTarget,
      epoch,
    });
  }, [dispatch, projections.visual.completionTarget, projections.visual.transitionEpoch]);

  const shouldShowDragGlow = isDragHovering && !primaryTaskKind && !isCompact;

  const containerBackdropShadow = primaryTaskKind || isDragHovering
    ? colors.panelShadowStrong
    : colors.panelShadow;
  const containerShadowBackdropStyle = getShadowBackdropStyle(colors, {
    radius: shadowRadius,
    boxShadow: isCompact
      ? colors.panelShadowCompact
      : containerBackdropShadow,
  });
  const panelBorderColor = isCompact
    ? colors.borderStart
    : primaryTaskKind === "transcode"
      ? colors.transcodeBorder
      : primaryTaskKind === "download"
        ? colors.accentBorder
        : isDragHovering
          ? colors.accentBorder
          : colors.borderStart;
  const containerShellAccentShadow = primaryTaskKind === "transcode"
    ? `inset 0 0 14px ${colors.transcodeGlow}`
    : primaryTaskKind === "download"
      ? `inset 0 0 12px ${colors.accentGlow}`
      : isDragHovering
        ? `inset 0 0 18px ${colors.accentGlow}, inset 0 0 28px ${colors.accentSurfaceStrong}`
        : null;
  const containerShellBoxShadow = [
    `inset 0 0 0 1px ${panelBorderColor}`,
    `inset 0 1px 0 ${colors.fieldInset}`,
    containerShellAccentShadow,
  ].filter(Boolean).join(", ");
  const minimizedContainerBoxShadow = theme === "black"
    ? [
      "inset 0 0 0 1px rgba(245,245,245,0.18)",
      "inset 0 1px 0 rgba(245,245,245,0.24)",
      "inset 0 -1px 0 rgba(0,0,0,0.22)",
    ].join(", ")
    : `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`;
  const containerBoxShadow = isCompact && !environment.isMacOS
    ? minimizedContainerBoxShadow
    : containerShellBoxShadow;

  const instantPanelTransition = (
    projections.visual.transitionEpoch !== null
    && projections.visual.recipe === "instant"
  );

  useEffect(() => () => {
    if (compactHotspotFrameRef.current !== null) {
      cancelAnimationFrame(compactHotspotFrameRef.current);
      compactHotspotFrameRef.current = null;
    }
  }, []);

  return (
    <div
      ref={viewportRef}
      style={{
        position: "relative",
        width: panelViewportSize,
        height: panelViewportSize,
        overflow: "visible",
      }}
    >
        {/* Magnetic outer layer: renderer-only x/y displacement. The shadow
            and shell keep their own morph transforms inside this wrapper, so
            Magnetic never writes a transform the shell owns. */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            x: magnetic.x,
            y: magnetic.y,
            willChange: magneticEnabled ? "transform" : undefined,
          }}
        >
        <motion.div
          initial={false}
          aria-hidden="true"
          animate={{
            scale: motionRecipe.shellAnimate.scale,
            borderRadius: shadowRadius,
            x: shadowOffsetX,
            y: shadowOffsetY,
            width: shadowRenderSize,
            height: shadowRenderSize,
          }}
          transition={{
            scale: motionRecipe.shellTransition.scale,
            borderRadius: motionRecipe.shellTransition.borderRadius,
            x: motionRecipe.shellTransition.x,
            y: motionRecipe.shellTransition.y,
            width: motionRecipe.shellTransition.width,
            height: motionRecipe.shellTransition.height,
          }}
          style={{
            top: 0,
            left: 0,
            zIndex: 0,
            transformOrigin: "top left",
            ...containerShadowBackdropStyle,
          }}
        />
        <motion.div
          ref={containerRef}
          tabIndex={0}
          onDragEnter={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            applyPanelHoverInput({ type: "pointerFact", pointerInside: true });
            updateDropHoverState(true);
            dispatch({ type: "dropEnter" });
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            applyPanelHoverInput({ type: "pointerFact", pointerInside: true });
            updateDropHoverState(true);
            dispatch({ type: "dropEnter" });
            const hasFiles = e.dataTransfer.files.length > 0 || e.dataTransfer.types.includes("Files");
            const hasUrl = e.dataTransfer.types.includes("text/uri-list")
              || e.dataTransfer.types.includes("text/plain");
            if ((hasFiles || hasUrl) && !isDragHovering) {
              setIsDragHovering(true);
            }
          }}
          onDragStartCapture={(e) => {
            if (shouldPreventPanelNativeDragStart(e.target)) {
              e.preventDefault();
            }
          }}
          onDrop={handleDrop}
          onDragLeave={() => {
            if (suppressNextPanelDragLeaveRef.current) {
              suppressNextPanelDragLeaveRef.current = false;
              return;
            }
            clearPanelDropInteractionState();
          }}
          onMouseEnter={(e) => {
            drag.syncPointerFieldFromClientPoint(e.clientX, e.clientY);
            handlePointerFact(true, { type: "pointerEnter" });
            containerRef.current?.focus();
          }}
          onMouseLeave={() => {
            handlePointerFact(false, { type: "pointerLeave" });
          }}
          onPointerDown={drag.handlePanelPointerDown}
          onPointerUp={drag.handlePanelPointerUp}
          onPointerMove={drag.handlePanelPointerMove}
          onPointerCancel={drag.handlePanelPointerCancel}
          onDoubleClick={drag.handlePanelDoubleClick}
          onContextMenu={handleContextMenu}
          initial={false}
          animate={motionRecipe.shellAnimate}
          transition={motionRecipe.shellTransition}
          onAnimationComplete={handleAnimationComplete}
          style={{
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            outline: "none",
            zIndex: 1,
            ...getPanelShellStyle(colors, {
              radius: panelRadius,
              boxShadow: containerBoxShadow,
            }),
            overflow: "hidden",
            transition: instantPanelTransition
              ? undefined
              : `box-shadow 0.18s ${COMPACT_EASE}`,
            willChange: "transform, clip-path",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              opacity: 1,
              visibility: "visible",
              pointerEvents: "auto",
            }}
          >
            {/* Sole Expanded renderer-local decorative graphics host. */}
            <ExpandedPresentationSurface
              eligible={expandedGraphicsEligible}
              reducedMotion={environment.reducedMotion}
              target={expandedPresentationTarget}
              palette={THERMAL_PALETTE}
            />

            {/* Drag glow layer */}
            <AnimatePresence>
              {shouldShowDragGlow && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    ...DRAG_GLOW_GRADIENT,
                    ...getContinuousCornerStyle(panelRadius),
                  }}
                />
              )}
            </AnimatePresence>

            {children}

            {/* Compact Flat Blob Cat. The outer presence/settle choreography
                (enter, settle pulse, exit) stays owned by the shell recipe;
                the Character itself is a read-only visual consumer. Its frame
                uses most of the 60x60 visible shell; the legacy 38px icon
                bound no longer constrains it. */}
            <AnimatePresence>
              {isCompact ? (
                <motion.div
                  key={`compact-icon-${settlePulseKey}`}
                  initial={{ scale: MAIN_WINDOW_INITIAL_PANEL_SCALE, opacity: 0 }}
                  animate={motionRecipe.icon.animate}
                  exit={motionRecipe.icon.exit}
                  transition={motionRecipe.icon.transition}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    zIndex: 4,
                  }}
                >
                  <motion.div
                    key={`compact-icon-settle-${settlePulseKey}`}
                    initial={false}
                    animate={motionRecipe.icon.settleAnimate}
                    transition={motionRecipe.icon.settleTransition}
                    style={{
                      width: CHARACTER_VISUAL_SIZE,
                      height: CHARACTER_VISUAL_SIZE,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      ...getContinuousCornerStyle("50%"),
                      background: "transparent",
                      boxShadow: "none",
                      overflow: "hidden",
                      transformOrigin: "center center",
                      willChange: "transform",
                    }}
                  >
                    <CompactCatCharacter
                      size={CHARACTER_VISUAL_SIZE}
                      bodyColor={colors.characterBody}
                      eyeColor={colors.characterEye}
                      reducedMotion={environment.reducedMotion}
                      pointerField={pointerField}
                      attentionCenterX={geometry.visualShell.x + geometry.visualShell.width / 2}
                      attentionCenterY={geometry.visualShell.y + geometry.visualShell.height / 2}
                    />
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
        </motion.div>
    </div>
  );
}
