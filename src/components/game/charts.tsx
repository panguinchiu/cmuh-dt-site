/** 沿用原檔 lineChart / barChart 的版面，改成 React SVG，顏色走 CSS 變數以支援深淺色 */
import { JOINT_MAX } from "@/lib/game";

type Series = { name: string; color: string; pts: (number | null)[] };

export function LineChart({ series, defect }: { series: Series[]; defect: number | null }) {
  const W = 640, H = 230, pad = { l: 38, r: 14, t: 14, b: 26 }, n = 8;
  let maxY = 0;
  series.forEach((s) => s.pts.forEach((v) => v != null && v > maxY && (maxY = v)));
  maxY = Math.max(20, Math.ceil(maxY / 20) * 20);
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / (n - 1);
  const y = (v: number) => H - pad.b - (H - pad.t - pad.b) * (v / maxY);
  const ticks = [0, 1, 2, 3, 4].map((k) => (maxY / 4) * k);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="累計分數趨勢">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} y1={y(t)} x2={W - pad.r} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={pad.l - 6} y={y(t) + 4} fontSize="11" fill="var(--muted)" textAnchor="end" fontFamily="var(--mono)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="middle" fontFamily="var(--mono)">
            {i + 1}
          </text>
        ))}
        {series.map((s) => {
          const pv = s.pts.map((v, i) => (v == null ? null : ([x(i), y(v)] as const))).filter(Boolean) as (readonly [number, number])[];
          if (!pv.length) return null;
          return (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={pv.map((p) => p.join(",")).join(" ")} />
              {pv.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="3.2" fill={s.color} />
              ))}
            </g>
          );
        })}
        {defect ? (
          <g>
            <line x1={x(defect - 1)} y1={pad.t} x2={x(defect - 1)} y2={H - pad.b} stroke="var(--self)" strokeWidth="1.2" strokeDasharray="4 3" />
            <text x={x(defect - 1) + 3} y={pad.t + 11} fontSize="11" fill="var(--self)">
              背叛
            </text>
          </g>
        ) : null}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ items }: { items: { name: string; v: number }[] }) {
  const W = 640, H = 190, pad = { l: 38, r: 14, t: 18, b: 34 };
  const max = Math.max(JOINT_MAX, ...items.map((i) => i.v));
  const bw = (W - pad.l - pad.r) / Math.max(items.length, 1);
  const yv = (v: number) => H - pad.b - (H - pad.t - pad.b) * (v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="各對局共創總價值">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} y1={yv(max * t)} x2={W - pad.r} y2={yv(max * t)} stroke="var(--chart-grid)" />
          <text x={pad.l - 6} y={yv(max * t) + 4} fontSize="11" fill="var(--muted)" textAnchor="end" fontFamily="var(--mono)">
            {Math.round(max * t)}
          </text>
        </g>
      ))}
      <line x1={pad.l} y1={yv(JOINT_MAX)} x2={W - pad.r} y2={yv(JOINT_MAX)} stroke="var(--coop)" strokeDasharray="4 3" />
      <text x={W - pad.r} y={yv(JOINT_MAX) - 4} fontSize="11" fill="var(--coop)" textAnchor="end">
        全程共好 242
      </text>
      {items.map((it, i) => {
        const h = (H - pad.t - pad.b) * (it.v / max);
        const bx = pad.l + bw * i + bw * 0.24;
        const w = bw * 0.52;
        return (
          <g key={it.name}>
            <rect x={bx} y={H - pad.b - h} width={w} height={h} rx="4" fill="var(--accent)" />
            <text x={bx + w / 2} y={H - pad.b - h - 5} fontSize="13" fill="var(--text)" textAnchor="middle" fontWeight="700" fontFamily="var(--mono)">
              {it.v || ""}
            </text>
            <text x={bx + w / 2} y={H - 12} fontSize="13" fill="var(--muted)" textAnchor="middle">
              {it.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
