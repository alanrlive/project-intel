import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "urgent" | "warning" | "info" | "success" | "outline";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-zinc-700 text-zinc-100",
  urgent: "bg-red-600 text-white",
  warning: "bg-amber-500 text-black",
  info: "bg-blue-600 text-white",
  success: "bg-emerald-600 text-white",
  outline: "border border-zinc-600 text-zinc-300",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
