import { motion } from "framer-motion";
import React from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * A layout wrapper for page routes that applies a high-fidelity slide-and-fade animation
 * to achieve a sleek, premium mobile native transition effect (like iOS navigation).
 */
export function PageTransition({ children }: PageTransitionProps) {
  // RTL layout: Native iOS transition for Arabic/RTL slides from the left (or right depending on preference).
  // Usually, going 'forward' slides in from left in RTL, and going 'back' slides out to left.
  // We'll use a subtle parallax slide effect.

  return (
    <motion.div
      initial={{ opacity: 0, x: -30, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, scale: 0.98 }}
      transition={{
        duration: 0.35,
        ease: [0.32, 0.72, 0, 1], // Apple iOS-like ease out
      }}
      className="w-full min-h-full flex flex-col flex-1 bg-background"
    >
      {children}
    </motion.div>
  );
}
