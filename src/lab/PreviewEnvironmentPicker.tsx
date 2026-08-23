/**
 * Lab-local Preview Environment picker — a compact trigger + popover for the
 * Dark / Light / Checkerboard screen-only preview background.
 *
 * The popover reuses the repo's popover recipe (AnimatePresence +
 * COMPACT_POPOVER_PRESENCE + panel-shell surface, same as NeonDropdownField)
 * and the Lab control language for options. The chosen environment is Lab
 * chrome state only: it is never written to renderer/export/production state.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "../contexts/ThemeContext";
import { getPanelShellStyle } from "../components/ui/shared-styles";
import { COMPACT_POPOVER_PRESENCE } from "../components/ui/motion";
import {
  LAB_PREVIEW_ENVIRONMENTS,
  type LabPreviewEnvironment,
} from "./previewEnvironment";
import { getLabChipStyle } from "./labControls";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function PreviewEnvironmentPicker({
  value,
  onChange,
  t,
}: {
  value: LabPreviewEnvironment;
  onChange: (environment: LabPreviewEnvironment) => void;
  t: TranslateFn;
}) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<LabPreviewEnvironment | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root !== null && !root.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const triggerStyle: CSSProperties = {
    ...getLabChipStyle(colors, { selected: isOpen }),
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 28,
    padding: "0 11px",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="lab-control"
        data-lab-env-trigger=""
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        style={triggerStyle}
        title={t("environment.title")}
      >
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            display: "inline-block",
            ...(value === "checkerboard"
              ? {
                  background: "repeating-conic-gradient(#ece8f2 0% 25%, #5a5468 0% 50%)",
                  backgroundSize: "5px 5px",
                }
              : { background: value === "dark" ? "#ece8f2" : "#2a2633" }),
          }}
        />
        {t(`environment.${value}`)}
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            id={menuId}
            role="listbox"
            aria-label={t("environment.title")}
            initial={COMPACT_POPOVER_PRESENCE.initial}
            animate={COMPACT_POPOVER_PRESENCE.animate}
            exit={COMPACT_POPOVER_PRESENCE.exit}
            transition={COMPACT_POPOVER_PRESENCE.transition}
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              minWidth: 150,
              padding: 4,
              zIndex: 30,
              display: "grid",
              gap: 2,
              ...getPanelShellStyle(colors, {
                radius: 10,
                boxShadow: `inset 0 0 0 1px ${colors.fieldBorder}, ${colors.panelShadowStrong}`,
              }),
            }}
          >
            {LAB_PREVIEW_ENVIRONMENTS.map((environment) => {
              const selected = environment === value;
              const hovered = highlighted === environment && !selected;
              return (
                <button
                  key={environment}
                  type="button"
                  className="lab-control"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHighlighted(environment)}
                  onMouseLeave={() => setHighlighted((current) => (current === environment ? null : current))}
                  onClick={() => {
                    onChange(environment);
                    setIsOpen(false);
                  }}
                  style={{
                    ...getLabChipStyle(colors, { selected, hovered }),
                    textAlign: "left",
                    borderRadius: 7,
                    padding: "6px 10px",
                  }}
                >
                  {t(`environment.${environment}`)}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
