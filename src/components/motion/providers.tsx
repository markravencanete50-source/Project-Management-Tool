"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";

/**
 * Root client providers: theme (class based, system default) and motion.
 * MotionConfig reducedMotion="user" makes every motion animation skip
 * transform and layout animation when the OS asks for reduced motion.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </MotionConfig>
    </ThemeProvider>
  );
}
