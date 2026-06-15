"use client";

// 데이터랩 랭킹 뷰 — 최고가/최고상승/최근하락. 무날짜 recent(당월 top-300) 한 응답을
// 메트릭별로 재정렬해 렌더. 카드 클릭 시 단지 상세(ComplexDetail) 모달.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Transaction } from "@/lib/api";
import { formatDeal, pyeong } from "@/lib/format";
import { ALL_DISTRICTS } from "@/lib/regions";
import { Sparkline } from "@/components/Sparkline";
import { ComplexDetail } from "@/components/ComplexDetail";
import type { LabView } from "./labTiles";

const regionName = (sggCd: string) =>
  ALL_DISTRICTS.find((d) => d.code === sggCd)?.name ?? sggCd;

function sortByMetric(deals: Transaction[], view: LabView): Transaction[] {
  const amt = (t: Transaction) => t.dealAmount || t.deposit;
  if (view === "ranking-top") return [...deals].sort((a, b) => amt(b) - amt(a));
  if (view === "ranking-rise")
    return deals.filter((t) => typeof t.rise === "number" && t.rise > 0)
      .sort((a, b) => (b.rise ?? 0) - (a.rise ?? 0));
  // ranking-decline
  return deals.filter((t) => typeof t.rise === "number" && t.rise < 0)
    .sort((a, b) => (a.rise ?? 0) - (b.rise ?? 0));
}

export function LabRankingView({
  deals,
  view,
  label,
  desc,
  color,
  yyyymm,
  dataset = "aptTrade",
}: {
  deals: Transaction[];
  view: LabView;
  label: string;
  desc: string;
  color: string;
  yyyymm: string;
  dataset?: string;
}) {
  const [selected, setSelected] = useState<{ region: string; apt: string; umdNm?: string; jibun?: string } | null>(null);
  const sorted = useMemo(() => sortByMetric(deals, view).slice(0, 100), [deals, view]);
  const ym = `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;

  return (
    <div className="mx-auto w-[92%] max-w-[920px] px-2 py-8">
      <Link href="/lab" className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200">
        ‹ 데이터랩
      </Link>
      <header className="mt-4 mb-1 flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <h1 className="text-2xl font-bold tracking-tight text-white">{label}</h1>
      </header>
      <p className="mb-1 text-sm text-slate-400">{desc}</p>
      <p className="mb-5 text-xs text-slate-500">{ym} · 전국 · 아파트 매매 · 상위 {sorted.length}건</p>

      {sorted.length === 0 ? (
        <div className="py-16 text-center text-slate-500">표시할 거래가 없습니다.</div>
      ) : (
        <ol className="flex flex-col gap-2">
          {sorted.map((tx, i) => {
            const tr = (tx.trend ?? []).filter((v) => v > 0);
            const up = (tx.rise ?? 0) >= 0;
            return (
              <li key={`${tx.id ?? ""}-${tx.aptName}-${i}`}>
                <button
                  onClick={() => setSelected({ region: tx.sggCd ?? "", apt: tx.aptName, umdNm: tx.umdNm, jibun: tx.jibun })}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-[#111a2e] px-4 py-3 text-left transition hover:border-blue-500/60 hover:bg-[#13203a]"
                >
                  <span
                    className="w-7 shrink-0 text-center text-sm font-bold tabular-nums"
                    style={{ color: i < 3 ? color : "#64748b" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-semibold text-slate-100">{tx.aptName}</span>
                      <span className="shrink-0 text-base font-extrabold tracking-tight text-blue-400">
                        {formatDeal(tx)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate-400">
                        {regionName(tx.sggCd ?? "")} {tx.umdNm} · {pyeong(tx.area)}평 · {tx.floor}층 · {tx.dealDate.slice(5)}
                      </span>
                      {typeof tx.rise === "number" && (
                        <span className={`shrink-0 text-[11px] font-semibold ${tx.rise >= 0 ? "text-rose-400" : "text-blue-400"}`}>
                          {tx.rise >= 0 ? "▲" : "▼"} {tx.rise >= 0 ? "+" : ""}{tx.rise}%
                        </span>
                      )}
                    </div>
                  </div>
                  {tr.length >= 2 && (
                    <div className="hidden w-[120px] shrink-0 sm:block">
                      <Sparkline
                        values={tr}
                        width={120}
                        height={30}
                        responsive
                        stroke={up ? "#f43f5e" : "#60a5fa"}
                        fill={up ? "rgba(244,63,94,0.10)" : "rgba(96,165,250,0.10)"}
                      />
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {selected && (
        <ComplexDetail
          region={selected.region}
          apt={selected.apt}
          umdNm={selected.umdNm}
          jibun={selected.jibun}
          yyyymm={yyyymm}
          dataset={dataset}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
