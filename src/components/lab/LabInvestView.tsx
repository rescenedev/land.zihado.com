"use client";

// 데이터랩 갭투자(gap)/월세수익(yield) — 단지단위 매매⨝전월세. 카드 클릭 시 단지 상세.
import { useState } from "react";
import Link from "next/link";
import type { InvestComplex } from "@/lib/ssr";
import { formatAmountFull } from "@/lib/format";
import { ALL_DISTRICTS } from "@/lib/regions";
import { ComplexDetail } from "@/components/ComplexDetail";

const regionName = (sggCd: string) =>
  ALL_DISTRICTS.find((d) => d.code === sggCd)?.name ?? sggCd;

export function LabInvestView({
  complexes,
  metric,
  label,
  desc,
  color,
  yyyymm,
}: {
  complexes: InvestComplex[];
  metric: "gap" | "yield";
  label: string;
  desc: string;
  color: string;
  yyyymm: string;
}) {
  const [selected, setSelected] = useState<{ region: string; apt: string; umdNm?: string } | null>(null);
  const ym = `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
  const isGap = metric === "gap";

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
      <p className="mb-5 text-xs text-slate-500">
        {ym} · 전국 · 같은 달 매매·{isGap ? "전세" : "월세"} 모두 거래된 단지 · {isGap ? "갭 적은" : "수익률 높은"} 순 {complexes.length}곳
      </p>

      {complexes.length === 0 ? (
        <div className="py-16 text-center text-slate-500">
          같은 달에 매매·{isGap ? "전세" : "월세"}가 함께 거래된 단지가 없습니다.
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {complexes.map((c, i) => (
            <li key={`${c.sggCd}-${c.aptName}-${i}`}>
              <button
                onClick={() => setSelected({ region: c.sggCd, apt: c.aptName, umdNm: c.umdNm ?? undefined })}
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
                    <span className="truncate font-semibold text-slate-100">{c.aptName}</span>
                    <span className="shrink-0 text-base font-extrabold tracking-tight tabular-nums" style={{ color }}>
                      {isGap ? `갭 ${formatAmountFull(c.value)}` : `${c.value}%`}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-400">
                      {regionName(c.sggCd)} {c.umdNm}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                      매매 {formatAmountFull(c.sale)} · {isGap ? "전세" : "월세"} {formatAmountFull(c.ref)}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}

      {selected && (
        <ComplexDetail
          region={selected.region}
          apt={selected.apt}
          umdNm={selected.umdNm}
          yyyymm={yyyymm}
          dataset="aptTrade"
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
