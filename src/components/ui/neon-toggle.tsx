interface NeonToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function NeonToggle({ checked, onChange, disabled = false }: NeonToggleProps) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        backgroundColor: checked ? '#3b82f6' : '#3a3a3a',
        boxShadow: checked ? '0 0 12px rgba(59,130,246,0.5)' : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 4,
        left: checked ? 24 : 4,
        width: 16,
        height: 16,
        borderRadius: '50%',
        backgroundColor: 'white',
        transition: 'left 0.2s ease',
      }} />
    </button>
  );
}
