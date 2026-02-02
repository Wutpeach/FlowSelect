import { cn } from "../../lib/utils";

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
      className={cn(
        "relative w-11 h-6 rounded-full transition-all duration-300 cursor-pointer",
        checked
          ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
          : "bg-[#3a3a3a]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200",
          checked ? "left-6" : "left-1"
        )}
      />
    </button>
  );
}
