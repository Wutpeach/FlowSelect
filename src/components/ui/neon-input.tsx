import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";

interface NeonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function NeonInput({ className, icon, ...props }: NeonInputProps) {
  const { colors } = useTheme();

  return (
    <div className="relative">
      {icon && (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: colors.controlMuted }}
        >
          {icon}
        </span>
      )}
      <input
        style={{
          background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
          color: colors.textPrimary,
          borderColor: colors.fieldBorder,
          boxShadow: `inset 0 1px 0 ${colors.fieldInset}`,
        }}
        className={cn(
          "w-full px-3 py-2.5 rounded-lg border",
          "text-sm placeholder:opacity-100",
          "transition-all duration-300 outline-none",
          "focus:shadow-none",
          icon && "pl-10",
          className
        )}
        {...props}
      />
    </div>
  );
}
