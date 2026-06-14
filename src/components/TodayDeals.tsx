"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type Transaction } from "@/lib/api";
import { formatDeal, pyeong } from "@/lib/format";
import { ALL_DISTRICTS } from "@/lib/regions";
import { ComplexDetail } from "./ComplexDetail";
import { TodayCharts } from "./TodayCharts";
import { Sparkline } from "./Sparkline";

const TABS = [
  { key: "aptTrade", label: "매매" },
  { key: "silvTrade", label: "분양권" },
  { key: "aptRent", label: "전월세" },
];

const SIDO_TABS = [
  "전국", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
  "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function ymdOfDate(date: string): string {
  return date.slice(0, 7).replace("-", "");
}
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function dowOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return DOW[new Date(y, m - 1, d).getDay()];
}
const regionName = (sggCd: string) =>
  ALL_DISTRICTS.find((d) => d.code === sggCd)?.name ?? sggCd;

// 현재 선택을 경로 세그먼트로 인코딩 — /today/[date]/[sido]/[dataset].
// 기본값은 뒤에서부터 생략(/today 가 깔끔하게 유지). 하위 세그먼트가 있으면 상위는 필수.
function hrefFor(date: string, sido: string, dataset: string, today: string): string {
  const needDataset = dataset !== "aptTrade";
  const needSido = needDataset || sido !== "전국";
  const needDate = needSido || date !== today;
  const parts: string[] = [];
  if (needDate) parts.push(date);
  if (needSido) parts.push(encodeURIComponent(sido));
  if (needDataset) parts.push(dataset);
  return `/today${parts.length ? `/${parts.join("/")}` : ""}`;
}

export function TodayDeals({
  initialDeals,
  initialDataset = "aptTrade",
  initialSido = "전국",
  initialDate,
}: {
  initialDeals?: Transaction[] | null;
  initialDataset?: string;
  initialSido?: string;
  initialDate?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<{ region: string; apt: string; umdNm?: string; jibun?: string } | null>(null);

  const today = todayStr();
  // 표시 상태 = 현재 URL(서버에서 받은 props). 클라 페치 없음 — 전환은 라우트 네비게이션.
  const date = initialDate ?? today;
  const sido = initialSido;
  const dataset = initialDataset;
  const deals = initialDeals ?? [];

  const isToday = date === today;
  const isFuture = date > today;

  const go = (d: string, s: string, ds: string) =>
    startTransition(() => router.push(hrefFor(d, s, ds, today), { scroll: false }));

  // 인접 날짜 프리페치(이전 5일 + 다음 1일) → ‹ 연속 클릭도 RSC 클라 캐시 HIT(즉시 전환).
  // prefetch 는 RSC 페이로드를 미리 받아두므로 CDN 콜드여도 사용자는 대기 안 함.
  useEffect(() => {
    for (let i = 1; i <= 5; i++) router.prefetch(hrefFor(shiftDate(date, -i), sido, dataset, today));
    if (!isToday) router.prefetch(hrefFor(shiftDate(date, 1), sido, dataset, today));
  }, [date, sido, dataset, today, isToday, router]);

  // 가격순 정렬 + 게임화 뱃지 계산
  const { sorted, topRiserId, longestGapId } = useMemo(() => {
    const s = [...deals].sort((a, b) => (b.dealAmount || b.deposit) - (a.dealAmount || a.deposit));
    let topRiser: Transaction | null = null;
    let longestGap: Transaction | null = null;
    let bestRise = 0;
    let bestGap = 0;
    for (const d of s) {
      if (typeof d.rise === "number" && d.rise > bestRise) {
        bestRise = d.rise;
        topRiser = d;
      }
      if (d.prevDate) {
        const gap = daysBetween(d.prevDate, d.dealDate);
        if (gap > bestGap) {
          bestGap = gap;
          longestGap = d;
        }
      }
    }
    const idOf = (t: Transaction | null) => (t ? `${t.id ?? ""}-${t.aptName}` : "");
    return { sorted: s, topRiserId: idOf(topRiser), longestGapId: idOf(longestGap) };
  }, [deals]);

  return (
    <div className="mx-auto w-[92%] max-w-[1800px] px-2 py-7">
      <div className="mb-1 text-xs font-semibold text-blue-400">국토교통부 실거래가 · 일자별 신고분</div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">오늘의 실거래</h1>
          <p className="mt-1 text-sm text-slate-400">계약일 기준 · {date} 신고 거래</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1">
            <button onClick={() => go(shiftDate(date, -1), sido, dataset)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700" aria-label="이전 날짜">‹</button>
            <label className="relative flex min-w-[150px] cursor-pointer items-center justify-center px-2 text-sm font-semibold text-slate-100">
              {date} ({dowOf(date)})
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && go(e.target.value, sido, dataset)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <button onClick={() => go(shiftDate(date, 1), sido, dataset)} disabled={isFuture || isToday} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="다음 날짜">›</button>
          </div>
          <button onClick={() => go(today, sido, dataset)} disabled={isToday} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40">오늘</button>
        </div>
      </div>

      {/* 데이터셋 탭 */}
      <div className="mb-3 flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => go(date, sido, t.key)} onMouseEnter={() => router.prefetch(hrefFor(date, sido, t.key, today))} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${dataset === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
        ))}
      </div>

      {/* 시도 필터 칩 */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SIDO_TABS.map((sd) => (
          <button
            key={sd}
            onClick={() => go(date, sd, dataset)}
            onMouseEnter={() => router.prefetch(hrefFor(date, sd, dataset, today))}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              sido === sd ? "bg-blue-600 text-white" : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            {sd}
          </button>
        ))}
      </div>

      {/* 그날 거래 요약 차트 */}
      {sorted.length > 0 && <TodayCharts deals={sorted} />}

      <div className="mb-3 text-sm font-medium text-slate-300">
        {isPending ? "불러오는 중…" : `${sorted.length}건`}
        {!isPending && sorted.length === 0 && <span className="ml-1 text-slate-500">· 이 날짜 신고된 거래가 없습니다</span>}
      </div>

      {/* 전환 중에는 직전 데이터를 흐리게 유지(스켈레톤 깜빡임 없이). 데이터 없으면 안내. */}
      {sorted.length === 0 && !isPending ? (
        <div className="py-16 text-center text-slate-500">{isFuture ? "아직 오지 않은 날짜입니다." : "‹ › 로 다른 날짜를 확인해보세요."}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-2 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${isPending ? "opacity-50" : ""}`}>
          {sorted.map((tx, i) => {
            const id = `${tx.id ?? ""}-${tx.aptName}`;
            const badges: { t: string; cls: string }[] = [];
            if (i === 0) badges.push({ t: "👑 최고가", cls: "bg-amber-500/20 text-amber-300" });
            if (id === topRiserId && typeof tx.rise === "number" && tx.rise > 0)
              badges.push({ t: `📈 최고 상승`, cls: "bg-emerald-500/20 text-emerald-300" });
            if (id === longestGapId && tx.prevDate)
              badges.push({ t: `⏳ ${daysBetween(tx.prevDate, tx.dealDate)}일만`, cls: "bg-violet-500/20 text-violet-300" });
            if (tx.isHigh) badges.push({ t: "🔥 신고가", cls: "bg-rose-500/20 text-rose-300" });
            else if (tx.isFirst) badges.push({ t: "🆕 첫거래", cls: "bg-sky-500/20 text-sky-300" });
            return (
              <button
                key={`${id}-${i}`}
                onClick={() => setSelected({ region: tx.sggCd ?? "", apt: tx.aptName, umdNm: tx.umdNm, jibun: tx.jibun })}
                className="flex flex-col gap-1.5 rounded-xl border border-slate-800 bg-[#111a2e] px-4 py-3 text-left transition hover:border-blue-500/60 hover:bg-[#13203a]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-semibold text-slate-100">{tx.aptName}</span>
                  <span className="shrink-0 text-base font-extrabold tracking-tight text-blue-400">{formatDeal(tx)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">
                    {regionName(tx.sggCd ?? "")} {tx.umdNm} · {pyeong(tx.area)}평 · {tx.floor}층
                  </span>
                  {typeof tx.rise === "number" && (
                    <span className={`shrink-0 text-[11px] font-semibold ${tx.rise >= 0 ? "text-rose-400" : "text-blue-400"}`}>
                      {tx.rise >= 0 ? "▲" : "▼"} {tx.rise >= 0 ? "+" : ""}{tx.rise}%
                    </span>
                  )}
                </div>
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {badges.map((b, bi) => (
                      <span key={bi} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.t}</span>
                    ))}
                  </div>
                )}
                {(() => {
                  const tr = (tx.trend ?? []).filter((v) => v > 0);
                  if (tr.length < 2) return null;
                  const up = (tx.rise ?? 0) >= 0;
                  return (
                    <div className="mt-1 w-full">
                      <Sparkline
                        values={tr}
                        width={240}
                        height={32}
                        responsive
                        stroke={up ? "#f43f5e" : "#60a5fa"}
                        fill={up ? "rgba(244,63,94,0.10)" : "rgba(96,165,250,0.10)"}
                      />
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ComplexDetail region={selected.region} apt={selected.apt} umdNm={selected.umdNm} jibun={selected.jibun} yyyymm={ymdOfDate(date)} dataset={dataset} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
