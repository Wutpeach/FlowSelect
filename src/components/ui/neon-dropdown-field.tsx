import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "../../contexts/ThemeContext";
import { NeonFieldButton } from "./neon-field-button";
import { COMPACT_EASE, getFieldSurfaceStyle, getPanelShellStyle } from "./shared-styles";

export interface NeonDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface NeonDropdownFieldProps<T extends string>
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onChange" | "value"> {
  options: Array<NeonDropdownOption<T>>;
  value: T;
  onChange: (value: T) => void | Promise<void>;
  menuZIndex?: number;
}

export function NeonDropdownField<T extends string>({
  options,
  value,
  onChange,
  disabled,
  style,
  onClick,
  menuZIndex = 20,
  ...props
}: NeonDropdownFieldProps<T>) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredValue, setHoveredValue] = useState<T | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const containerEl = containerRef.current;
      if (!containerEl) return;
      if (containerEl.contains(event.target as Node)) return;
      setHoveredValue(null);
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHoveredValue(null);
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleTriggerClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) {
      return;
    }
    setIsOpen((prev) => {
      const nextOpen = !prev;
      if (!nextOpen) {
        setHoveredValue(null);
      }
      return nextOpen;
    });
  };

  const triggerStyle: CSSProperties = {
    ...getFieldSurfaceStyle(colors, {
      active: isOpen,
      highlighted: isOpen,
      padding: "0 10px",
      height: 36,
    }),
    ...style,
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <NeonFieldButton
        type="button"
        disabled={disabled}
        onClick={handleTriggerClick}
        trailingContent={
          <span
            style={{
              fontSize: 11,
              color: isOpen ? colors.accentText : colors.textSecondary,
              transition: `color 0.18s ${COMPACT_EASE}`,
            }}
          >
            {isOpen ? "▴" : "▾"}
          </span>
        }
        active={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        style={triggerStyle}
        {...props}
      >
        {selectedLabel}
      </NeonFieldButton>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            id={listboxId}
            role="listbox"
            aria-activedescendant={`${listboxId}-${value}`}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              maxHeight: 152,
              overflowY: "auto",
              overflowX: "hidden",
              ...getPanelShellStyle(colors, {
                radius: 10,
                boxShadow: `inset 0 0 0 1px ${colors.fieldBorder}, ${colors.panelShadowStrong}`,
              }),
              zIndex: menuZIndex,
              transformOrigin: "top center",
            }}
          >
            {options.map((option, index) => {
              const isSelected = value === option.value;
              const isHighlighted = hoveredValue === option.value;

              return (
                <button
                  key={option.value}
                  id={`${listboxId}-${option.value}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setIsOpen(false);
                    setHoveredValue(null);
                    void Promise.resolve(onChange(option.value));
                  }}
                  onMouseEnter={() => setHoveredValue(option.value)}
                  onMouseLeave={() => setHoveredValue((current) => (current === option.value ? null : current))}
                  style={{
                    width: "100%",
                    minHeight: 34,
                    padding: "0 10px",
                    border: "none",
                    borderBottom: index === options.length - 1 ? "none" : `1px solid ${colors.borderEnd}`,
                    backgroundColor: isSelected
                      ? colors.accentSurfaceStrong
                      : isHighlighted
                        ? colors.fieldHoverBg
                        : "transparent",
                    color: isSelected || isHighlighted ? colors.textPrimary : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: isSelected ? 600 : 500,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: [
                      `background-color 0.16s ${COMPACT_EASE}`,
                      `color 0.16s ${COMPACT_EASE}`,
                    ].join(", "),
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
