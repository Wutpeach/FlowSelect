import { useTheme } from '../../contexts/ThemeContext';

interface NeonToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function NeonToggle({ checked, onChange, disabled = false }: NeonToggleProps) {
  const { colors } = useTheme();

  return (
    <button
      onClick={onChange}
      disabled={disabled}
      type="button"
      role="switch"
      aria-checked={checked}
      style={{
        position: 'relative',
        width: 46,
        height: 26,
        borderRadius: 999,
        border: `1px solid ${checked ? colors.accentBorder : colors.fieldBorder}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        backgroundColor: checked ? colors.accentSolid : colors.fieldBg,
        boxShadow: checked
          ? `inset 0 0 0 1px ${colors.accentBorder}, 0 0 12px ${colors.accentGlow}`
          : `inset 0 1px 0 ${colors.fieldInset}`,
        transition: 'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: colors.knobBg,
        boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
        transform: checked ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 0.18s ease',
      }} />
    </button>
  );
}
