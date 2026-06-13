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
}: {
  data: CardData;
  rank: number;
  maxInSet: number;
  onClick: () => void;
}) {
  const headline = data.avg84 || data.avg;
  const barPct = maxInSet > 0 ? Math.round((headline / maxInSet) * 100) : 0;
  const top = rank <= 3 && data.count > 0;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-2xl border border-slate-800 bg-[#111a2e] p-4 text-left transition hover:border-blue-500/60 hover:bg-[#13203a]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-bold text-slate-100">{data.title}</span>
          {data.subtitle && (
            <span className="text-xs text-slate-500">{data.subtitle}</span>
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
