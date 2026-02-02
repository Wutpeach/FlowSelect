import { cn } from "../../lib/utils";

interface NeonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function NeonInput({ className, icon, ...props }: NeonInputProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606060]">
          {icon}
        </span>
      )}
      <input
        className={cn(
          "w-full px-3 py-2.5 bg-[#2a2a2a] rounded-lg border border-[#3a3a3a]",
          "text-sm text-[#e0e0e0] placeholder-[#606060]",
          "transition-all duration-300 outline-none",
          "focus:border-blue-500 focus:shadow-[0_0_10px_rgba(59,130,246,0.3)]",
          "hover:bg-[#333]",
          icon && "pl-10",
          className
        )}
        {...props}
      />
    </div>
  );
}
