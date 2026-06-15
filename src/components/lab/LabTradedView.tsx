// 데이터랩 "많이산단지" — 당월·전국 단지별 거래건수 랭킹. 서버컴포넌트(ISR·엣지 HIT).
import Link from "next/link";
import type { TradedComplex } from "@/lib/ssr";
import { formatAmountFull } from "@/lib/format";
import { ALL_DISTRICTS } from "@/lib/regions";

const regionName = (sggCd: string) =>
  ALL_DISTRICTS.find((d) => d.code === sggCd)?.name ?? sggCd;

export function LabTradedView({
  complexes,
  label,
  desc,
  color,
  yyyymm,
}: {
  complexes: TradedComplex[];
  label: string;
  desc: string;
  color: string;
  yyyymm: string;
}) {
  const ym = `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
  const maxCount = complexes[0]?.count ?? 1;

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
      <p className="mb-5 text-xs text-slate-500">{ym} · 전국 · 아파트 매매 · 거래건수 상위 {complexes.length}단지</p>

      {complexes.length === 0 ? (
        <div className="py-16 text-center text-slate-500">표시할 단지가 없습니다.</div>
      ) : (
        <ol className="flex flex-col gap-2">
          {complexes.map((c, i) => (
            <li
              key={`${c.sggCd}-${c.aptName}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#111a2e] px-4 py-3"
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
                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color }}>
                    {c.count}건
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">
                    {regionName(c.sggCd)} {c.umdNm} · 평균 {formatAmountFull(c.avgAmount)} · 최고 {formatAmountFull(c.maxAmount)}
                  </span>
                </div>
                {/* 거래건수 바 */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(6, (c.count / maxCount) * 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
