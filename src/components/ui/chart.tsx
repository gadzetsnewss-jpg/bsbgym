import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight SVG chart primitives for the Phase 0 dashboard.
 *
 * These render mock data with no external chart dependency. When Phase 1+
 * connects real analytics they can be kept as-is (data-driven) or swapped
 * for a full charting library without touching page layout.
 */

export interface ChartSeries {
  name: string;
  color: string;
  data: readonly number[];
}

interface ChartBaseProps {
  labels: readonly string[];
  series: readonly ChartSeries[];
  height?: number;
  className?: string;
  showLegend?: boolean;
  /** Formatter for tooltip/axis values. */
  formatValue?: (value: number) => string;
}

const CHART_WIDTH = 720;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) max = min + 1;
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

function useChartScale(
  series: readonly ChartSeries[],
  height: number,
): {
  innerW: number;
  innerH: number;
  min: number;
  max: number;
  x: (index: number) => number;
  y: (value: number) => number;
  ticks: number[];
} {
  const innerW = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const innerH = height - PADDING_TOP - PADDING_BOTTOM;

  const allValues = series.flatMap((s) => s.data);
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(...allValues, 1);
  const min = rawMin;
  const max = rawMax + (rawMax - rawMin) * 0.1;
  const span = max - min || 1;

  const x = (index: number) => {
    const len = series[0]?.data.length ?? 1;
    if (len <= 1) return PADDING_LEFT + innerW / 2;
    return PADDING_LEFT + (index / Math.max(len - 1, 1)) * innerW;
  };
  const y = (value: number) => PADDING_TOP + innerH - ((value - min) / span) * innerH;

  return {
    innerW,
    innerH,
    min,
    max,
    x,
    y,
    ticks: niceTicks(min, max),
  };
}

function ChartFrame({
  height,
  className,
  children,
}: {
  height: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      className={cn("w-full", className)}
      style={{ height: "auto", maxHeight: height }}
      aria-hidden="false"
    >
      {children}
    </svg>
  );
}

function GridLines({
  ticks,
  innerW,
  innerH,
  min,
  max,
  formatValue,
}: {
  ticks: number[];
  innerW: number;
  innerH: number;
  min: number;
  max: number;
  formatValue: (value: number) => string;
}) {
  return (
    <g>
      {ticks.map((tick) => {
        const ratio = (tick - min) / (max - min);
        const y = PADDING_TOP + innerH - ratio * innerH;
        return (
          <g key={tick}>
            <line
              x1={PADDING_LEFT}
              x2={PADDING_LEFT + innerW}
              y1={y}
              y2={y}
              stroke="#eef1f0"
              strokeWidth="1"
            />
            <text
              x={PADDING_LEFT - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-neutral-400"
              fontSize="10"
            >
              {formatValue(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ labels, height }: { labels: readonly string[]; height: number }) {
  const step = labels.length > 1 ? CHART_WIDTH / (labels.length - 1) : 0;
  return (
    <g>
      {labels.map((label, index) => {
        const x = PADDING_LEFT + (index / Math.max(labels.length - 1, 1)) * (CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT);
        const show = labels.length <= 12 || index % Math.ceil(labels.length / 6) === 0;
        if (!show) return null;
        return (
          <text
            key={`${label}-${index}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            className="fill-neutral-400"
            fontSize="10"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

export interface LineChartProps extends Omit<ChartBaseProps, "series"> {
  data: readonly number[];
  color?: string;
  /** Adds a soft gradient fill under the line. */
  area?: boolean;
}

export function LineChart({
  labels,
  data,
  color = "var(--color-primary-600)",
  area = false,
  height = 200,
  className,
  formatValue = (v) => v.toLocaleString(),
}: LineChartProps) {
  const series: ChartSeries[] = [{ name: "Series", color, data }];
  const scale = useChartScale(series, height);
  const points = data.map((value, index) => [scale.x(index), scale.y(value)] as const);

  const linePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const gradientId = React.useId().replace(/:/g, "");

  return (
    <ChartFrame height={height} className={className}>
      <GridLines
        ticks={scale.ticks}
        innerW={scale.innerW}
        innerH={scale.innerH}
        min={scale.min}
        max={scale.max}
        formatValue={formatValue}
      />
      {area && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {area && points.length > 1 && (
        <path
          d={`${linePath} L${scale.x(points.length - 1)},${PADDING_TOP + scale.innerH} L${scale.x(0)},${PADDING_TOP + scale.innerH} Z`}
          fill={`url(#${gradientId})`}
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(([x, y], index) => (
        <g key={index}>
          <circle cx={x} cy={y} r="3.5" fill={color} />
          <title>{`${labels[index] ?? ""}: ${formatValue(data[index])}`}</title>
        </g>
      ))}
      <XLabels labels={labels} height={height} />
    </ChartFrame>
  );
}

export interface BarChartProps extends Omit<ChartBaseProps, "series"> {
  data: readonly number[];
  color?: string;
  formatValue?: (value: number) => string;
}

export function BarChart({
  labels,
  data,
  color = "var(--color-primary-500)",
  height = 200,
  className,
  formatValue = (v) => v.toLocaleString(),
}: BarChartProps) {
  const series: ChartSeries[] = [{ name: "Series", color, data }];
  const scale = useChartScale(series, height);
  const slotWidth = scale.innerW / Math.max(data.length, 1);
  const barWidth = Math.max(Math.min(slotWidth * 0.55, 28), 4);

  return (
    <ChartFrame height={height} className={className}>
      <GridLines
        ticks={scale.ticks}
        innerW={scale.innerW}
        innerH={scale.innerH}
        min={scale.min}
        max={scale.max}
        formatValue={formatValue}
      />
      {data.map((value, index) => {
        const x = scale.x(index);
        const y = scale.y(value);
        const barHeight = Math.max(PADDING_TOP + scale.innerH - y, 1);
        return (
          <g key={index}>
            <rect
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill={color}
              opacity={0.9}
            />
            <title>{`${labels[index] ?? ""}: ${formatValue(value)}`}</title>
          </g>
        );
      })}
      <XLabels labels={labels} height={height} />
    </ChartFrame>
  );
}

export function ChartLegend({ series }: { series: readonly ChartSeries[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export interface MultiLineChartProps extends ChartBaseProps {}

export function MultiLineChart({
  labels,
  series,
  height = 200,
  className,
  showLegend = true,
  formatValue = (v) => v.toLocaleString(),
}: MultiLineChartProps) {
  const scale = useChartScale(series, height);

  return (
    <div className="w-full">
      {showLegend && <ChartLegend series={series} />}
      <ChartFrame height={height} className={className}>
        <GridLines
          ticks={scale.ticks}
          innerW={scale.innerW}
          innerH={scale.innerH}
          min={scale.min}
          max={scale.max}
          formatValue={formatValue}
        />
        {series.map((s) => {
          const points = s.data.map((value, index) => [
            scale.x(index),
            scale.y(value),
          ] as const);
          const path = points
            .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.name}>
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map(([x, y], index) => (
                <circle key={index} cx={x} cy={y} r="3" fill={s.color}>
                  <title>{`${s.name} · ${labels[index] ?? ""}: ${formatValue(s.data[index])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <XLabels labels={labels} height={height} />
      </ChartFrame>
    </div>
  );
}

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: readonly DonutSegment[];
  /** Total shown in the center; defaults to the sum of segments. */
  centerValue?: number;
  centerLabel?: string;
  size?: number;
  thickness?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

/** Simple SVG donut chart for category breakdowns. */
export function DonutChart({
  segments,
  centerValue,
  centerLabel = "Total",
  size = 168,
  thickness = 20,
  formatValue = (v) => v.toLocaleString(),
  className,
}: DonutChartProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      className={cn("mx-auto", className)}
    >
      <title>{`${segments.map((s) => `${s.name}: ${formatValue(s.value)}`).join(", ")}`}</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-neutral-100)"
        strokeWidth={thickness}
      />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((segment) => {
          const segmentLength = (segment.value / total) * circumference;
          const offset = accumulated;
          accumulated += segmentLength;
          return (
            <circle
              key={segment.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(segmentLength - 2, 0.5)} ${circumference}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
        })}
      </g>
      <text
        x={size / 2}
        y={size / 2 - 6}
        textAnchor="middle"
        className="fill-ink"
        fontSize="20"
        fontWeight="600"
      >
        {formatValue(centerValue ?? total)}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 12}
        textAnchor="middle"
        className="fill-neutral-400"
        fontSize="11"
      >
        {centerLabel}
      </text>
    </svg>
  );
}
