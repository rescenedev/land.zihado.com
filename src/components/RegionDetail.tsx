"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchTransactions,
  fetchTrend,
  fetchOverview,
  fetchComplexDeals,
  shiftMonth,
  type Transaction,
  type TrendPoint,
  type RegionRow,
} from "@/lib/api";
import { formatAmountFull, formatDeal, formatEok, pyeong } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { ComplexDetail } from "./ComplexDetail";

const THIS_YEAR = new Date().getFullYear();

export function RegionDetail({
  sggCd,
  title,
  yyyymm,
  dataset = "aptTrade",
  seed,
  onBack,
}: {
  sggCd: string;
  title: string;
  yyyymm: string;
  dataset?: string;
  seed?: RegionRow | null; // overview 에서 이미 받은 이 구의 집계 → 카드·스파크라인 즉시 표시
  onBack: () => void;
}) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
  const [source, setSource] = useState("");
  const [peers, setPeers] = useState<RegionRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedApt, setSelectedApt] = useState<{ apt: string; umdNm: string; jibun: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setItems([]);
    setTrend([]);
    setFilling(false);

    // 거래목록 로드 — 수집 중이면 일정 간격으로 자동 폴링하여 갱신
    const load = async () => {
      const tx = await fetchTransactions(sggCd, yyyymm, dataset);
      if (!alive) return;
      setItems(tx.items);
      setSource(tx.source);
      setFilling(tx.filling);
      setLoading(false);
      if (tx.filling) timer = setTimeout(load, 2500);
      else fetchTrend(sggCd, shiftMonth(yyyymm, -11), yyyymm, dataset).then((tr) => alive && setTrend(tr));
    };
    load().catch(() => alive && setLoading(false));

    // 추이는 별도로 먼저 로드 (있는 만큼 즉시 표시)
    fetchTrend(sggCd, shiftMonth(yyyymm, -11), yyyymm, dataset).then(
      (tr) => alive && setTrend(tr)
    );
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [sggCd, yyyymm, dataset]);

  // 비교용: 전국 overview(캐시됨)에서 동일 시도 구/시 집계 확보
  useEffect(() => {
    let alive = true;
    fetchOverview(yyyymm, "all", dataset)
      .then((r) => alive && setPeers(r.regions))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [yyyymm, dataset]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return items;
    const k = keyword.trim().toLowerCase();
    return items.filter(
      (i) => i.aptName.toLowerCase().includes(k) || i.umdNm.toLowerCase().includes(k)
    );
  }, [items, keyword]);

  const stats = useMemo(() => {
    const a = filtered.map((i) => i.dealAmount || i.deposit).filter(Boolean);
    if (a.length === 0) return null;
    return {
      count: filtered.length,
      avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length),
      max: Math.max(...a),
      min: Math.min(...a),
    };
  }, [filtered]);

  // 카드에 표시할 통계: 실제 거래목록이 오기 전엔 overview seed 집계로 즉시 채움(− 방지).
  // 검색어가 있으면 필터 결과가 필요하므로 seed 미사용. 목록 도착 시 stats 로 자동 교체.
  const displayStats = useMemo(() => {
    if (stats) return stats;
    if (keyword.trim()) return null;
    if (seed && seed.count > 0)
      return { count: seed.count, avg: seed.avg, max: seed.max, min: seed.min };
    return null;
  }, [stats, keyword, seed]);

  // 스파크라인: 실제 추이 도착 전엔 seed.trend(월별 평균 number[])로 즉시 표시.
  const trendValues = useMemo(
    () => (trend.length ? trend.map((t) => t.avg) : seed?.trend ?? []),
    [trend, seed]
  );

  // 동일 시도 내 비교 (순위·평균·최고/최저 대비)
  const compare = useMemo(() => {
    if (peers.length === 0) return null;
    const me = peers.find((p) => p.sggCd === sggCd);
    if (!me) return null;
    const group = peers.filter((p) => p.sido === me.sido && p.count > 0);
    if (group.length < 2) return null;
    const n = group.length;
    const countRank = [...group].sort((a, b) => b.count - a.count).findIndex((p) => p.sggCd === sggCd) + 1;
    const avgRank = [...group].sort((a, b) => b.avg - a.avg).findIndex((p) => p.sggCd === sggCd) + 1;
    const avg84Group = group.filter((p) => p.avg84 > 0);
    const avg84Rank = me.avg84 > 0
      ? [...avg84Group].sort((a, b) => b.avg84 - a.avg84).findIndex((p) => p.sggCd === sggCd) + 1
      : 0;
    const totalCount = group.reduce((s, p) => s + p.count, 0);
    const sidoAvg = Math.round(group.reduce((s, p) => s + p.avg * p.count, 0) / totalCount);
    const sidoMax = group.reduce((m, p) => Math.max(m, p.max), 0);
    const mins = group.map((p) => p.min).filter((v) => v > 0);
    const sidoMin = mins.length ? Math.min(...mins) : 0;
    return { sido: me.sido, n, countRank, avgRank, avg84Rank, sidoAvg, sidoMax, sidoMin, meAvg: me.avg, meAvg84: me.avg84 };
  }, [peers, sggCd]);

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100"
      >
        ← 목록으로
      </button>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-slate-400">
            {yyyymm.slice(0, 4)}년 {yyyymm.slice(4, 6)}월 · {dataset === "silvTrade" ? "분양권" : dataset === "aptRent" ? "전월세" : "매매"}
          </p>
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="단지/동 검색 (예: 래미안)"
          className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* 시도 내 순위 배지 — overview 캐시 도착 즉시 표시 (거래 데이터 독립) */}
      {compare && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">{compare.sido} {compare.n}구 중</span>
          <PeerChip
            label={`가격 ${compare.avgRank}위`}
            rank={compare.avgRank}
            n={compare.n}
          />
          {compare.avg84Rank > 0 && (
            <PeerChip
              label={`84㎡ ${compare.avg84Rank}위`}
              rank={compare.avg84Rank}
              n={compare.n}
              muted
            />
          )}
          <PeerChip
            label={`거래량 ${compare.countRank}위`}
            rank={compare.countRank}
            n={compare.n}
            muted
          />
          {compare.sidoAvg > 0 && compare.meAvg > 0 && (() => {
            const pct = Math.round(((compare.meAvg - compare.sidoAvg) / compare.sidoAvg) * 100);
            const up = pct >= 0;
            return (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                up ? "bg-rose-500/15 text-rose-400" : "bg-blue-500/15 text-blue-400"
              }`}>
                {compare.sido} 평균 {up ? "+" : ""}{pct}%
              </span>
            );
          })()}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#111a2e] p-4 lg:col-span-1">
          <span className="text-sm font-medium text-slate-300">최근 12개월 평균가 추이</span>
          <div className="mt-2 w-full">
            <Sparkline values={trendValues} width={260} height={70} responsive />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>{trend[0]?.month?.slice(2)}</span>
            <span>{trend[trend.length - 1]?.month?.slice(2)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Stat
            label="거래 건수"
            value={displayStats ? `${displayStats.count}건` : "-"}
            sub={
              compare ? (
                <RankSub sido={compare.sido} n={compare.n} rank={compare.countRank} unit="거래량" />
              ) : null
            }
          />
          <Stat
            label="평균가"
            value={displayStats ? formatEok(displayStats.avg) : "-"}
            accent
            sub={
              displayStats && compare ? (
                <DiffSub
                  base={compare.sidoAvg}
                  value={displayStats.avg}
                  baseLabel={`${compare.sido} 평균 ${formatEok(compare.sidoAvg)}`}
                />
              ) : null
            }
          />
          <Stat
            label="최고가"
            value={displayStats ? formatEok(displayStats.max) : "-"}
            sub={
              displayStats && compare ? (
                <RatioSub
                  value={displayStats.max}
                  base={compare.sidoMax}
                  baseLabel={`${compare.sido} 최고 ${formatEok(compare.sidoMax)}`}
                />
              ) : null
            }
          />
          <Stat
            label="최저가"
            value={displayStats ? formatEok(displayStats.min) : "-"}
            sub={
              displayStats && compare ? (
                <span className="text-slate-500">
                  {compare.sido} 최저 {formatEok(compare.sidoMin)}
                  {displayStats.min <= compare.sidoMin && (
                    <span className="ml-1 text-amber-400">· 최저</span>
                  )}
                </span>
              ) : null
            }
          />
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">
          {loading ? "불러오는 중…" : filling ? "데이터 수집 중…" : `거래 ${filtered.length}건`}
        </span>
        {source && !loading && !filling && (
          <span className="text-[11px] text-slate-500">
            {source === "molit" ? "MOLIT 원본" : source === "kv" ? "KV 캐시" : "D1"}
          </span>
        )}
      </div>

      {/* 수집 중 안내 배너 (자동 갱신) */}
      {filling && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          국토교통부에서 이 지역·월 데이터를 처음 수집하고 있어요. 완료되면 자동으로 표시됩니다.
        </div>
      )}

      {loading || (filling && filtered.length === 0) ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-500">거래 내역이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((tx, i) => (
            <TxCard
              key={i}
              tx={tx}
              onClick={() => setSelectedApt({ apt: tx.aptName, umdNm: tx.umdNm, jibun: tx.jibun })}
              onHover={() => fetchComplexDeals(sggCd, tx.aptName, shiftMonth(yyyymm, -11), yyyymm, dataset).catch(() => {})}
            />
          ))}
        </div>
      )}

      {selectedApt && (
        <ComplexDetail
          region={sggCd}
          apt={selectedApt.apt}
          yyyymm={yyyymm}
          dataset={dataset}
          umdNm={selectedApt.umdNm}
          jibun={selectedApt.jibun}
          onClose={() => setSelectedApt(null)}
        />
      )}
    </div>
  );
}

function TxCard({ tx, onClick, onHover }: { tx: Transaction; onClick: () => void; onHover?: () => void }) {
  const age = tx.buildYear ? THIS_YEAR - tx.buildYear : 0;
  const cancelled = tx.cdealType === "O";
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className="rounded-2xl border border-slate-800 bg-[#111a2e] p-4 text-left transition hover:border-blue-500/60 hover:bg-[#13203a]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-slate-100">{tx.aptName}</span>
        <span className="flex shrink-0 gap-1">
          {tx.isHigh && (
            <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[11px] font-bold text-rose-400">
              신고가
            </span>
          )}
          {cancelled && (
            <span className="rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[11px] font-medium text-slate-300">
              해제
            </span>
          )}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">
        {tx.area}㎡ · {pyeong(tx.area)}평 · {tx.floor}층 · {tx.umdNm}
      </p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-xl font-extrabold tracking-tight text-blue-400">{formatDeal(tx)}</span>
        {typeof tx.rise === "number" && (
          <span className={`mb-0.5 text-xs font-semibold ${tx.rise >= 0 ? "text-rose-400" : "text-blue-400"}`}>
            {tx.rise >= 0 ? "▲" : "▼"} {tx.rise >= 0 ? "+" : ""}{tx.rise}%
          </span>
        )}
      </div>

      {/* 직전 거래가 / 단지 최고가 */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-800/40 px-2.5 py-1.5">
          <div className="text-[10px] text-slate-500">직전 거래 · 동평형</div>
          <div className="text-xs font-semibold text-slate-200">
            {tx.prevPrice && tx.prevPrice > 0 ? formatEok(tx.prevPrice) : "이력 없음"}
            {tx.prevDate && (
              <span className="ml-1 font-normal text-slate-500">{tx.prevDate.slice(2, 7)}</span>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/40 px-2.5 py-1.5">
          <div className="text-[10px] text-slate-500">동평형 최고가</div>
          <div className="text-xs font-semibold text-slate-200">
            {tx.aptMax && tx.aptMax > 0 ? formatEok(tx.aptMax) : "-"}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-500">
        <span>{tx.dealDate} 계약</span>
        <span>{tx.buildYear ? `${tx.buildYear}년 (${age}년차)` : "-"}</span>
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-800 bg-[#111a2e] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 w-28 rounded bg-slate-700/60" />
        <div className="h-4 w-10 rounded bg-slate-800" />
      </div>
      <div className="mt-2 h-3 w-40 rounded bg-slate-800" />
      <div className="mt-3 h-6 w-24 rounded bg-slate-700/60" />
      <div className="mt-3 flex justify-between border-t border-slate-800 pt-2">
        <div className="h-3 w-20 rounded bg-slate-800" />
        <div className="h-3 w-16 rounded bg-slate-800" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111a2e] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? "text-blue-400" : "text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] leading-tight">{sub}</div>}
    </div>
  );
}

// 헤더 배지 — 순위가 상위 30%면 초록, 하위 30%면 흐리게
function PeerChip({ label, rank, n, muted = false }: { label: string; rank: number; n: number; muted?: boolean }) {
  const top = rank <= Math.max(1, Math.ceil(n * 0.3));
  const bot = rank > Math.floor(n * 0.7);
  const cls = muted
    ? "bg-slate-800 text-slate-400"
    : top
      ? "bg-emerald-500/15 text-emerald-300"
      : bot
        ? "bg-slate-800/60 text-slate-500"
        : "bg-slate-800 text-slate-300";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

// 시도 내 순위 (상위 강조)
function RankSub({ sido, n, rank, unit }: { sido: string; n: number; rank: number; unit: string }) {
  const top = rank <= Math.max(1, Math.ceil(n * 0.3));
  return (
    <span className="text-slate-500">
      {sido} {n}곳 중{" "}
      <span className={top ? "font-semibold text-emerald-400" : "text-slate-300"}>{rank}위</span>
      <span className="ml-1 text-slate-600">· {unit}</span>
    </span>
  );
}

// 기준값 대비 증감률 (평균가 비교)
function DiffSub({ base, value, baseLabel }: { base: number; value: number; baseLabel: string }) {
  if (base <= 0) return <span className="text-slate-500">{baseLabel}</span>;
  const pct = Math.round(((value - base) / base) * 100);
  const up = pct >= 0;
  return (
    <span className="text-slate-500">
      {baseLabel}{" "}
      <span className={up ? "text-rose-400" : "text-blue-400"}>
        {up ? "▲" : "▼"} {up ? "+" : ""}
        {pct}%
      </span>
    </span>
  );
}

// 기준값의 몇 % 수준 (최고가 비교)
function RatioSub({ value, base, baseLabel }: { value: number; base: number; baseLabel: string }) {
  const pct = base > 0 ? Math.round((value / base) * 100) : 100;
  return (
    <span className="text-slate-500">
      {baseLabel}의 <span className="font-semibold text-slate-300">{pct}%</span>
    </span>
  );
}
