import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";

interface NeonToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function NeonToggle({ checked, onChange, disabled = false }: NeonToggleProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const highlighted = isHovered || isFocused;

  return (
    <button
      onClick={onChange}
      disabled={disabled}
      type="button"
      role="switch"
      aria-checked={checked}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        width: 46,
        height: 26,
        padding: 0,
        borderRadius: 999,
        border: `1px solid ${checked ? colors.accentBorder : highlighted ? colors.borderStart : colors.fieldBorder}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: checked ? colors.accentSolid : colors.fieldBg,
        boxShadow: checked
          ? `inset 0 0 0 1px ${colors.accentBorder}, 0 0 10px ${colors.accentGlow}`
          : highlighted
            ? `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`
            : `inset 0 1px 0 ${colors.fieldInset}`,
        transition: "background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          backgroundColor: colors.knobBg,
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          transform: checked ? "translate(20px, -50%)" : "translate(0, -50%)",
          transition: "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </button>
  );
}
