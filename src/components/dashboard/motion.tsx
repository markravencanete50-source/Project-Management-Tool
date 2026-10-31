"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion, type Variants } from "motion/react";

/** Ease-out used for every dashboard entrance (matches the app's --ease-out). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const container = (stagger: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
};

/**
 * Wraps the whole dashboard. With reducedMotion="user" motion drops transform
 * and layout animations for people who ask for less movement (opacity stays).
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Reveals its StaggerItem children one after another, on mount or when scrolled into view. */
export function Stagger({
  children,
  className,
  stagger = 0.05,
  delay = 0,
  inView = false,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  inView?: boolean;
  as?: "div" | "ul";
}) {
  const Tag = as === "ul" ? motion.ul : motion.div;
  return (
    <Tag
      className={className}
      variants={container(stagger, delay)}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "0px 0px -8% 0px" } } : { animate: "show" })}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag className={className} variants={item}>
      {children}
    </Tag>
  );
}

/** A single block that fades and rises once when it first scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
