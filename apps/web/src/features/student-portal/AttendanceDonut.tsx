// A pure presentational ring chart over real summary counts — no data
// fetching, no fabricated segments. If total is 0 the caller shouldn't
// render this at all (see the empty-state branches in the pages that use
// it); this component always assumes total > 0.
const SIZE = 160;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AttendanceDonut({
  present,
  absent,
  late,
  excused,
  total,
}: {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}) {
  const segments = [
    { value: present, color: "var(--success)" },
    { value: absent, color: "var(--danger)" },
    { value: late, color: "var(--warning)" },
    { value: excused, color: "var(--accent)" },
  ];

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const length = (s.value / total) * CIRCUMFERENCE;
      const arc = (
        <circle
          key={i}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={s.color}
          strokeWidth={STROKE}
          strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
        />
      );
      offset += length;
      return arc;
    });

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--surface)" strokeWidth={STROKE} />
        {arcs}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{total}</span>
        <span className="text-xs text-foreground-muted">Total Days</span>
      </div>
    </div>
  );
}
