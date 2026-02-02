import { cn } from "../../lib/utils";

interface NeonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function NeonCard({ className, glow = false, children, ...props }: NeonCardProps) {
  return (
    <div
      className={cn(
        "bg-[#1e1e1e] rounded-xl border border-[#3a3a3a] p-4 transition-all duration-300",
        glow && "hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
