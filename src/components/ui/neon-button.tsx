import { cn } from "../../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.5)]",
        outline: "border border-blue-500 text-blue-500 hover:bg-blue-500/10",
        ghost: "text-[#e0e0e0] hover:bg-[#3a3a3a]",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

interface NeonButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function NeonButton({ className, variant, size, ...props }: NeonButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
