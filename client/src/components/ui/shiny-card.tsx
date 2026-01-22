import { cn } from "@/lib/utils";
import React from "react";

interface ShinyCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function ShinyCard({ children, className, ...props }: ShinyCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/20 bg-white/50 p-6 shadow-xl backdrop-blur-xl dark:bg-black/40 dark:border-white/10",
        className
      )}
      {...props}
    >
      <div className="absolute -top-[100px] -left-[100px] h-[200px] w-[200px] rounded-full bg-primary/20 blur-[100px]" />
      <div className="absolute -bottom-[100px] -right-[100px] h-[200px] w-[200px] rounded-full bg-accent/30 blur-[100px]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
