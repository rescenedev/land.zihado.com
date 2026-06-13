"use client";

import { useMemo } from "react";
import { REGIONS } from "@/lib/regions";
import { type Transaction } from "@/lib/api";

// 시군구코드 → 짧은 시도명
const SIDO_BY_CODE: Record<string, string> = {};
for (const r of REGIONS) {
  const short = r.sido
    .replace("특별자치시", "")
    .replace("특별자치도", "")
    .replace("특별시", "")
    .replace("광역시", "")
    .replace(/도$/, "");
  for (const d of r.districts) SIDO_BY_CODE[d.code] = short;
}

const eok = (manwon: number) => manwon / 10000;

export function TodayCharts({ deals }: { deals: Transaction[] }) {
  const amtOf = (d: Transaction) => d.dealAmount || d.deposit;

  // 1) 가격대별 분포
  const priceBands = useMemo(() => {
    const bands = [
      { label: "~3억", lo: 0, hi: 3 },
      { label: "3~6", lo: 3, hi: 6 },
      { label: "6~9", lo: 6, hi: 9 },
      { label: "9~12", lo: 9, hi: 12 },
      { label: "12~20", lo: 12, hi: 20 },
      { label: "20~40", lo: 20, hi: 40 },
      { label: "40억+", lo: 40, hi: Infinity },
    ].map((b) => ({ ...b, n: 0 }));
    for (const d of deals) {
      const v = eok(amtOf(d));
      const b = bands.find((x) => v >= x.lo && v < x.hi);
      if (b) b.n += 1;
    }
    const max = Math.max(1, ...bands.map((b) => b.n));
    return { bands, max };
  }, [deals]);

  // 2) 지역별 거래량 (상위 8)
  const byRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) {
      const s = SIDO_BY_CODE[d.sggCd ?? ""] ?? "기타";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return { rows, max };
  }, [deals]);

  // 3) 상승/보합/하락 (직전가 대비)
  const trend = useMemo(() => {
    let up = 0, flat = 0, down = 0, none = 0;
    for (const d of deals) {
      if (typeof d.rise !== "number") none += 1;
      else if (d.rise > 1) up += 1;
      else if (d.rise < -1) down += 1;
      else flat += 1;
    }
    return { up, flat, down, none, total: deals.length };
  }, [deals]);

  // 4) 평형 vs 가격 산점도
  const scatter = useMemo(() => {
    const pts = deals
      .map((d) => ({ x: d.area / 3.3058, y: eok(amtOf(d)) }))
      .filter((p) => p.x > 0 && p.y > 0);
    const maxX = Math.max(10, ...pts.map((p) => p.x));
    const maxY = Math.max(1, ...pts.map((p) => p.y));
    return { pts, maxX, maxY };
  }, [deals]);

  if (deals.length === 0) return null;

  // 도넛 세그먼트
  const seg = [
    { v: trend.up, c: "#f43f5e", label: "상승" },
    { v: trend.flat, c: "#64748b", label: "보합" },
    { v: trend.down, c: "#3b82f6", label: "하락" },
    { v: trend.none, c: "#334155", label: "신규" },
  ];
  const segTotal = Math.max(1, seg.reduce((s, x) => s + x.v, 0));
  let acc = 0;
  const R = 42, C = 2 * Math.PI * R;

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
      {/* 가격대별 분포 */}
      <div className="rounded-xl border border-slate-800 bg-[#111a2e] p-4">
        <div className="mb-3 text-xs font-semibold text-slate-300">가격대별 분포</div>
        <div className="space-y-1.5">
          {priceBands.bands.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right text-[10px] text-slate-500">{b.label}</span>
              <div className="h-3.5 flex-1 overflow-hidden rounded bg-slate-800">
                <div className="h-full rounded bg-gradient-to-r from-blue-500 to-indigo-400" style={{ width: `${(b.n / priceBands.max) * 100}%` }} />
              </div>
              <span className="w-6 shrink-0 text-[10px] text-slate-400">{b.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 지역별 거래량 */}
      <div className="rounded-xl border border-slate-800 bg-[#111a2e] p-4">
        <div className="mb-3 text-xs font-semibold text-slate-300">지역별 거래량 (상위 8)</div>
        <div className="space-y-1.5">
          {byRegion.rows.map(([sido, n]) => (
            <div key={sido} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right text-[10px] text-slate-500">{sido}</span>
              <div className="h-3.5 flex-1 overflow-hidden rounded bg-slate-800">
                <div className="h-full rounded bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${(n / byRegion.max) * 100}%` }} />
              </div>
              <span className="w-6 shrink-0 text-[10px] text-slate-400">{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 상승/보합/하락 도넛 */}
      <div className="rounded-xl border border-slate-800 bg-[#111a2e] p-4">
        <div className="mb-3 text-xs font-semibold text-slate-300">직전가 대비</div>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            {seg.map((s, i) => {
              const frac = s.v / segTotal;
              const dash = frac * C;
              const el = (
                <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={s.c} strokeWidth="14"
                  strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} />
              );
              acc += dash;
              return el;
            })}
          </svg>
          <div className="space-y-1 text-[11px]">
            {seg.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.c }} />
                <span className="text-slate-400">{s.label}</span>
                <span className="font-semibold text-slate-200">{s.v}</span>
                <span className="text-slate-600">({Math.round((s.v / segTotal) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 평형 vs 가격 산점도 */}
      <div className="rounded-xl border border-slate-800 bg-[#111a2e] p-4">
        <div className="mb-3 text-xs font-semibold text-slate-300">평형 vs 가격</div>
        <svg viewBox="0 0 200 110" className="h-[104px] w-full">
          {scatter.pts.map((p, i) => (
            <circle key={i} cx={6 + (p.x / scatter.maxX) * 188} cy={104 - (p.y / scatter.maxY) * 98}
              r="2.2" fill="#60a5fa" fillOpacity="0.6" />
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-slate-600">
          <span>~{Math.round(scatter.maxX)}평</span>
          <span>최고 {scatter.maxY.toFixed(0)}억</span>
        </div>
      </div>
    </div>
  );
}
