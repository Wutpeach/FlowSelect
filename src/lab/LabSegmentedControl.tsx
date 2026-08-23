/**
 * Lab-local segmented control (Preview Target, Display Scale).
 *
 * A single `role="group"` of `aria-pressed` toggle buttons with arrow-key
 * roving (Tab into the group, ←/→/Home/End move selection), built on the
 * Lab control language from `labControls.ts`: normal / hover / focus
 * (violet ring) / selected (orange accent) are mutually distinct and focus
 * never resembles selection.
 *
 * Lab-local UI only — the selected segment is never written to scenario,
 * reducer, renderer, or production state.
 */
import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getLabChipStyle } from "./labControls";

export type LabSegmentedOption<T extends string> = Readonly<{
  id: T;
  label: string;
}>;

export function LabSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly LabSegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  const { colors } = useTheme();
  const [hoveredId, setHoveredId] = useState<T | null>(null);
  const buttonRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});

  const focusOption = (id: T) => {
    onChange(id);
    buttonRefs.current[id]?.focus();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.id === value);
    if (index < 0) {
      return;
    }
    const count = options.length;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(options[(index + 1) % count].id);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(options[(index - 1 + count) % count].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(options[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options[count - 1].id);
    }
  };

  const trackStyle: CSSProperties = {
    display: "inline-flex",
    gap: 3,
    padding: 3,
    borderRadius: 11,
    background: colors.bgPrimary,
    border: `1px solid ${colors.fieldBorder}`,
  };

  return (
    <div role="group" aria-label={ariaLabel} style={trackStyle} onKeyDown={handleKeyDown}>
      {options.map((option) => {
        const selected = option.id === value;
        const hovered = hoveredId === option.id && !selected;
        return (
          <button
            key={option.id}
            ref={(node) => {
              buttonRefs.current[option.id] = node;
            }}
            type="button"
            className="lab-control"
            aria-pressed={selected}
            tabIndex={selected ? 0 : -1}
            onMouseEnter={() => setHoveredId(option.id)}
            onMouseLeave={() => setHoveredId((current) => (current === option.id ? null : current))}
            onClick={() => onChange(option.id)}
            style={{
              ...getLabChipStyle(colors, { selected, hovered }),
              padding: "4px 12px",
              borderRadius: 8,
              fontWeight: selected ? 700 : 500,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
