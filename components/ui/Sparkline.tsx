interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Stroke color (any CSS color or var). */
  color?: string;
  fill?: boolean;
  className?: string;
  /** Baseline to scale from. By default the sparkline scales to its own min,
   *  which makes every series fill the full height regardless of magnitude —
   *  fine for one chart, misleading in a COLUMN of them, where a 540→196 slide
   *  and a 3→2 wobble render as the identical shape. Pass 0 to make height
   *  comparable down the column. */
  min?: number;
}

/** Deterministic hash of the gradient's inputs.
 *
 *  The id was previously `spark-${data.join("-").slice(0, 12)}` — the first 12
 *  CHARACTERS of the data. Any two sparklines agreeing on that prefix emitted
 *  duplicate <linearGradient id>s, and per spec the first definition in the
 *  document wins, so one chart silently adopted another's fill. `[1,2,3]` and
 *  `[1,2,3,99]` collided; so did every all-zero series, which is common here (a
 *  list of dormant accounts is exactly where this renders).
 *
 *  Hashing the FULL data plus the colour makes a collision imply identical
 *  inputs — in which case sharing a gradient is correct and invisible. Colour is
 *  in the key because the same series can render red or green depending on
 *  direction; hashing data alone would let those two share one gradient and tint
 *  the wrong chart.
 *
 *  Not useId(): this component is server-renderable and hook-free, and the whole
 *  point is to keep it that way. A hash is stable across server and client, so
 *  it can't produce a hydration mismatch either.
 */
function gradientId(data: number[], color: string): string {
  const key = `${data.join(",")}|${color}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `spark-${(h >>> 0).toString(36)}`;
}

/** Minimal inline SVG sparkline — no dependency, server-renderable. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  color = "var(--color-sirius)",
  fill = true,
  className,
  min: minProp,
}: SparklineProps) {
  if (!data.length) return null;
  const min = minProp ?? Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const pts = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d - min) / span) * (height - 2) - 1;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = gradientId(data, color);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
