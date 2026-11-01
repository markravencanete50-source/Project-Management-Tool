"use client";

import { useId, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EASE_OUT } from "@/components/dashboard/motion";

export type ChartPoint = {
  key: string;
  /** Short label for the x axis. */
  axisLabel: string;
  /** Full label for the tooltip. */
  longLabel: string;
  value: number;
  cumulative: number;
};

export type ChartMode = "period" | "cumulative";

type TooltipProps = {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  format: (n: number) => string;
  mode: ChartMode;
  lastKey: string;
  currentLabel: string;
  unit: string;
};

function ChartTooltip({ active, payload, format, mode, lastKey, currentLabel, unit }: TooltipProps) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="text-xs text-muted-foreground">
        {point.longLabel}
        {currentLabel && point.key === lastKey ? ` (${currentLabel})` : ""}
      </div>
      <div className="mt-0.5 text-base font-semibold tracking-tight tabular-nums">
        {format(mode === "period" ? point.value : point.cumulative)}
      </div>
      {mode === "cumulative" ? (
        <div className="text-xs text-muted-foreground tabular-nums">
          {format(point.value)} {unit}
        </div>
      ) : null}
    </div>
  );
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
/** Pixels a label needs on the x axis before the next one would touch it. */
const LABEL_SLOT = 46;

/**
 * Bars for each period (the current one in full colour, the rest softer) or an
 * area for the running total. The chart mounts when it first scrolls into view,
 * draws in once, and never re-draws when the data or mode changes afterwards (it
 * cross-fades instead). Drawing is skipped for reduced motion. It is hidden from
 * assistive tech, so pair it with a text alternative.
 */
export function PeriodChart({
  points,
  mode,
  color,
  format,
  formatAxis,
  unit,
  currentLabel,
  fadeKey,
  integerAxis = false,
}: {
  points: ChartPoint[];
  mode: ChartMode;
  /** Any CSS colour, normally a theme token such as var(--chart-1). */
  color: string;
  format: (n: number) => string;
  formatAxis: (n: number) => string;
  /** Noun for the per-period figure shown in the running total tooltip. */
  unit: string;
  /** Text after the current period in the tooltip, e.g. "so far". */
  currentLabel: string;
  /** Changing this cross-fades the chart (period or mode switch). */
  fadeKey: string;
  integerAxis?: boolean;
}) {
  const reduce = useReducedMotion();
  const holder = useRef<HTMLDivElement>(null);
  const seen = useInView(holder, { once: true, margin: "0px 0px -10% 0px" });
  const [drawn, setDrawn] = useState(false);
  const [width, setWidth] = useState(0);
  const gid = useId().replace(/:/g, "");

  const show = reduce || seen;
  const animateDraw = !reduce && !drawn;
  const lastIndex = points.length - 1;
  const lastKey = points[lastIndex]?.key ?? "";
  const plotWidth = Math.max(0, width - 52);
  const step = Math.max(1, Math.ceil(LABEL_SLOT / Math.max(1, plotWidth / Math.max(1, points.length))));
  // Value labels on every bar only while the bars are few enough to stay readable.
  const labelAll = width >= 560 && mode === "period" && points.length <= 16;

  const tooltip = (
    <ChartTooltip format={format} mode={mode} lastKey={lastKey} currentLabel={currentLabel} unit={unit} />
  );

  const common = { data: points, margin: { top: 22, right: 20, left: 0, bottom: 0 }, accessibilityLayer: false } as const;
  const xAxis = (
    <XAxis
      dataKey="axisLabel"
      tickLine={false}
      axisLine={{ stroke: "var(--border)" }}
      tickMargin={8}
      interval={0}
      tick={(props: { x?: number | string; y?: number | string; payload?: { value?: unknown }; index?: number }) => {
        const { payload, index = 0 } = props;
        const x = Number(props.x ?? 0);
        const y = Number(props.y ?? 0);
        if ((lastIndex - index) % step !== 0) return <g />;
        const isLast = index === lastIndex;
        return (
          <text
            x={x}
            y={y + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={isLast ? 600 : 400}
            fill={isLast ? "var(--foreground)" : "var(--muted-foreground)"}
          >
            {String(payload?.value ?? "")}
          </text>
        );
      }}
    />
  );
  const yAxis = (
    <YAxis
      width={52}
      tickLine={false}
      axisLine={false}
      tickCount={4}
      domain={[0, "auto"]}
      allowDecimals={!integerAxis}
      tick={AXIS_TICK}
      tickFormatter={(v: number) => formatAxis(v)}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />;

  return (
    <div ref={holder} className="h-56 w-full sm:h-64" aria-hidden>
      {show ? (
        <motion.div
          key={fadeKey}
          className="size-full"
          initial={drawn ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
        >
          <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
            {mode === "period" ? (
              <BarChart {...common} barCategoryGap="18%">
                <defs>
                  <linearGradient id={`${gid}-cur`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.62} />
                  </linearGradient>
                  <linearGradient id={`${gid}-past`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                {grid}
                {xAxis}
                {yAxis}
                <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.55, radius: 6 }} animationDuration={150} />
                <Bar
                  dataKey="value"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={44}
                  isAnimationActive={animateDraw}
                  animationDuration={700}
                  animationEasing="ease-out"
                  onAnimationEnd={() => setDrawn(true)}
                >
                  {points.map((p, i) => (
                    <Cell key={p.key} fill={`url(#${gid}-${i === lastIndex ? "cur" : "past"})`} />
                  ))}
                  <LabelList
                    dataKey="value"
                    content={(props: { x?: unknown; y?: unknown; width?: unknown; value?: unknown; index?: number }) => {
                      const { value, index = 0 } = props;
                      const x = Number(props.x);
                      const y = Number(props.y);
                      const w = Number(props.width);
                      if (typeof value !== "number" || value === 0) return null;
                      if (!labelAll && index !== lastIndex) return null;
                      return (
                        <text
                          x={x + w / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={index === lastIndex ? 600 : 500}
                          fill={index === lastIndex ? "var(--foreground)" : "var(--muted-foreground)"}
                        >
                          {formatAxis(value)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            ) : (
              <AreaChart {...common}>
                <defs>
                  <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.34} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {grid}
                {xAxis}
                {yAxis}
                <Tooltip content={tooltip} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} animationDuration={150} />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={color}
                  strokeWidth={2.25}
                  fill={`url(#${gid}-area)`}
                  activeDot={{ r: 5, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
                  dot={(p: { cx?: number; cy?: number; index?: number }) =>
                    p.index === lastIndex ? (
                      <circle key="last" cx={p.cx} cy={p.cy} r={4.5} fill={color} stroke="var(--card)" strokeWidth={2} />
                    ) : (
                      <g key={`d${p.index}`} />
                    )
                  }
                  isAnimationActive={animateDraw}
                  animationDuration={700}
                  animationEasing="ease-out"
                  onAnimationEnd={() => setDrawn(true)}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </motion.div>
      ) : null}
    </div>
  );
}
