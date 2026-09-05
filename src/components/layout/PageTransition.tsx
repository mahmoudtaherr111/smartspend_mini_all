import React from "react";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Root destinations intentionally have no spatial slide. Native tab bars swap
 * destinations in place; hierarchical push/pop motion belongs inside nested
 * route stacks such as Settings, not around every application route.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div
      className={`w-full min-h-full flex flex-col flex-1 ${className || ""}`}
    >
      {children}
    </div>
  );
}
