"use client";

import { formatEok } from "@/lib/format";
import { Sparkline } from "./Sparkline";

export type CardData = {
  key: string; // sggCd 또는 sido
  title: string;
  subtitle?: string;
  count: number;
  avg84: number;
  avg: number;
  max: number;
  isSido?: boolean;
  trend?: number[];
};

export function RegionCard({
  data,
  rank,
  maxInSet,
  onClick,
  newCount = 0,
  glow = false,
}: {
  data: CardData;
  rank: number;
  maxInSet: number;
  onClick: () => void;
  newCount?: number; // 최근 신규 신고 거래 수 (>0 이면 배지)
  glow?: boolean; // 신규 활동 상위 지역만 glow
}) {
  const headline = data.avg84 || data.avg;
  const barPct = maxInSet > 0 ? Math.round((headline / maxInSet) * 100) : 0;
  const top = rank <= 3 && data.count > 0;
  const fresh = glow;
  const hasNew = newCount > 0;

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col rounded-2xl border p-4 text-left transition hover:bg-[#13203a] ${
        fresh
          ? "border-blue-500/50 bg-[#101d36] shadow-[0_0_0_1px_rgba(59,130,246,0.35),0_0_18px_-3px_rgba(59,130,246,0.55)] hover:border-blue-400"
          : "border-slate-800 bg-[#111a2e] hover:border-blue-500/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 whitespace-nowrap text-[15px] font-bold text-slate-100">{data.title}</span>
          {data.subtitle && (
            <span className="truncate whitespace-nowrap text-xs text-slate-500">{data.subtitle}</span>
          )}
          {hasNew && (
            <span className={`ml-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              fresh ? "bg-blue-500/20 text-blue-300" : "bg-slate-700/50 text-slate-400"
            }`}>
              {fresh && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />}
              +{newCount}
            </span>
          )}
        </div>
        {top ? (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-400">
            TOP {rank}
          </span>
        ) : (
          <span className="text-xs text-slate-600 transition group-hover:text-blue-400">
            ›
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-extrabold tracking-tight text-white">
            {data.count.toLocaleString()}
          </span>
          <span className="text-sm text-slate-400">건</span>
        </div>
        {data.trend && data.trend.filter((v) => v > 0).length >= 2 && (
          <Sparkline values={data.trend} width={68} height={26} stroke="#60a5fa" />
        )}
      </div>

      <div className="mt-3 border-t border-slate-800 pt-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">84㎡ 평균</span>
          <span className="font-bold text-blue-400">{formatEok(headline)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-slate-500">최고</span>
          <span className="font-medium text-slate-300">{formatEok(data.max)}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
    </button>
  );
}
