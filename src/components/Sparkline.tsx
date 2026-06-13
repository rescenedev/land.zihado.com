"use client";

// 의존성 없는 SVG 스파크라인 (아파트미/실까 스타일 가격 추이)
export function Sparkline({
  values,
  width = 160,
  height = 44,
  stroke = "#2563eb",
  fill = "rgba(37,99,235,0.10)",
  responsive = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  responsive?: boolean;
}) {
  const pts = values.filter((v) => v > 0);
  if (pts.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] text-slate-300"
      >
        추이 데이터 부족
      </div>
    );
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const coords = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area =
    `${pad},${pad + h} ` + line + ` ${pad + w},${pad + h}`;
  const last = coords[coords.length - 1];
  // 한국 관례: 상승=빨강, 하락=파랑
  const rising = pts[pts.length - 1] >= pts[0];
  const color = rising ? "#ef4444" : "#3b82f6";
  const areaFill = rising ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)";

  const svgProps = responsive
    ? {
        width: "100%",
        height,
        viewBox: `0 0 ${width} ${height}`,
        preserveAspectRatio: "none" as const,
      }
    : { width, height };

  return (
    <svg {...svgProps} className="overflow-visible">
      <polygon points={area} fill={areaFill} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={responsive ? "non-scaling-stroke" : undefined}
      />
      {!responsive && <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />}
    </svg>
  );
}
