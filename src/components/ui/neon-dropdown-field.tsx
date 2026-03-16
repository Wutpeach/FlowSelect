import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { NeonFieldButton } from "./neon-field-button";

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
    height: 36,
    padding: "0 10px",
    border: `1px solid ${isOpen ? colors.fieldBorderStrong : colors.fieldBorder}`,
    boxShadow: isOpen
      ? `inset 0 0 0 1px ${colors.fieldBorderStrong}, ${colors.panelShadow}`
      : `inset 0 1px 0 ${colors.fieldInset}`,
    ...style,
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <NeonFieldButton
        type="button"
        disabled={disabled}
        onClick={handleTriggerClick}
        trailingContent={
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
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
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${listboxId}-${value}`}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 144,
            overflowY: "auto",
            overflowX: "hidden",
            borderRadius: 8,
            border: `1px solid ${colors.fieldBorder}`,
            backgroundColor: colors.bgSecondary,
            zIndex: menuZIndex,
            boxShadow: colors.panelShadowStrong,
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              id={`${listboxId}-${option.value}`}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                setIsOpen(false);
                setHoveredValue(null);
                void Promise.resolve(onChange(option.value));
              }}
              onMouseEnter={() => setHoveredValue(option.value)}
              onMouseLeave={() => setHoveredValue((current) => (current === option.value ? null : current))}
              style={{
                width: "100%",
                height: 34,
                padding: "0 10px",
                border: "none",
                borderBottom: index === options.length - 1 ? "none" : `1px solid ${colors.borderEnd}`,
                backgroundColor:
                  value === option.value
                    ? colors.accentSurfaceStrong
                    : hoveredValue === option.value
                      ? colors.fieldHoverBg
                      : colors.bgSecondary,
                color: colors.textPrimary,
                fontSize: 12,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
