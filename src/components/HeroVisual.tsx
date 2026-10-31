/** 首頁主視覺：線框立方體＋點陣球＋同心圓（沿用沙盒視覺語彙），中間顯示目前段落 */
export function HeroVisual({ no, title }: { no: string | null; title: string | null }) {
  const dots: [number, number][] = [];
  for (let lat = -80; lat <= 80; lat += 14) {
    const r = Math.cos((lat * Math.PI) / 180);
    const n = Math.max(4, Math.round(22 * r));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * r;
      if (Math.sin(a) < 0) continue; // 只畫正面
      dots.push([x, Math.sin((lat * Math.PI) / 180)]);
    }
  }
  return (
    <div className="hero-visual" aria-hidden={!title}>
      <svg viewBox="0 0 600 540" role="img" aria-label="設計思考工作坊主視覺">
        <defs>
          <radialGradient id="hv-glow" cx="62%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--glow)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hv-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <circle cx="370" cy="270" r="250" fill="url(#hv-glow)" />
        <g className="spin">
          <circle cx="370" cy="270" r="245" fill="none" stroke="var(--line-2)" strokeWidth="1" />
          <circle cx="370" cy="270" r="190" fill="none" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="3 6" />
        </g>
        <g className="float" stroke="var(--text)" strokeOpacity="0.55" strokeWidth="1.1" fill="none">
          <polygon points="300,150 470,140 520,170 350,182" fill="url(#hv-face)" />
          <polygon points="350,182 520,170 495,400 375,430" fill="url(#hv-face)" />
          <line x1="300" y1="150" x2="330" y2="395" />
          <line x1="330" y1="395" x2="375" y2="430" />
          <line x1="470" y1="140" x2="462" y2="370" strokeDasharray="2 4" />
          {[
            [300, 150],
            [470, 140],
            [520, 170],
            [350, 182],
            [495, 400],
            [375, 430],
            [330, 395],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="var(--text)" stroke="none" />
          ))}
          <g transform="translate(428 282)" fill="var(--text)" stroke="none">
            {dots.map(([x, y], i) => (
              <circle key={i} cx={x * 44} cy={y * 44} r="1.5" opacity={0.35 + 0.6 * Math.abs(x)} />
            ))}
          </g>
        </g>
        <text x="300" y="118" fontSize="11" fill="var(--muted)" fontFamily="var(--mono)" letterSpacing="2">
          CMUH / DESIGN THINKING
        </text>
      </svg>
      <div className="now-card">
        <div className="k">目前段落</div>
        {title ? (
          <>
            <div className="n">{no}</div>
            <div className="t">{title}</div>
          </>
        ) : (
          <div className="t">準備開始</div>
        )}
        <div className="s">EMPATHIZE / DEFINE / IDEATE / PROTOTYPE / TEST</div>
      </div>
    </div>
  );
}
