import React from "react";

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * High-performance zero-flash layout wrapper for native mobile routes.
 */
export function PageTransition({ children }: PageTransitionProps) {
  return (
    <div className="w-full min-h-full flex flex-col flex-1">
      {children}
    </div>
  );
}

