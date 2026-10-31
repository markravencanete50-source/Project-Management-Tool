"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { formatMoney, type Currency } from "@/lib/money";
import { cn } from "cn";

type Props = {
  /** Minor units for "money", a plain number otherwise. */
  value: number;
  kind?: "money" | "int" | "percent";
  currency?: Currency;
  className?: string;
  /** Class for the cents (money only), so they can sit smaller and quieter than the whole units. */
  fractionClassName?: string;
};

/** Splits "£1,234.56" into the big part and the cents. */
function splitMoney(value: number, currency: Currency): [string, string] {
  const text = formatMoney(Math.round(value), currency);
  const at = text.lastIndexOf(".");
  return at === -1 ? [text, ""] : [text.slice(0, at), text.slice(at)];
}

/**
 * A number that counts up from zero on first render. The server HTML and the
 * first client render already contain the final value, and a visually hidden
 * copy always holds the exact figure for screen readers and text search, so
 * nothing depends on the animation finishing. Skipped for reduced motion.
 */
export function AnimatedNumber({ value, kind = "int", currency = "GBP", className, fractionClassName }: Props) {
  const reduce = useReducedMotion();
  const progress = useMotionValue(value);

  const main = useTransform(progress, (v) => (kind === "money" ? splitMoney(v, currency)[0] : String(Math.round(v))));
  const fraction = useTransform(progress, (v) => (kind === "money" ? splitMoney(v, currency)[1] : ""));

  const started = useRef(false);

  useEffect(() => {
    if (reduce) {
      progress.set(value);
      return;
    }
    // Count up from zero the first time, then glide from the old value to the new one.
    if (!started.current) {
      started.current = true;
      progress.jump(0);
    }
    const controls = animate(progress, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, progress]);

  const [finalMain, finalFraction] = kind === "money" ? splitMoney(value, currency) : [String(Math.round(value)), ""];
  const sr = `${finalMain}${finalFraction}${kind === "percent" ? "%" : ""}`;

  return (
    <span className={cn("tabular-nums", className)}>
      <span className="sr-only">{sr}</span>
      <span aria-hidden>
        <motion.span>{main}</motion.span>
        {kind === "percent" ? <span>%</span> : null}
        {kind === "money" ? <motion.span className={fractionClassName}>{fraction}</motion.span> : null}
      </span>
    </span>
  );
}
