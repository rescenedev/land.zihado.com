"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchComplexDeals,
  fetchCoord,
  fetchNearby,
  shiftMonth,
  type Transaction,
  type Nearby,
  type Parcel,
} from "@/lib/api";
import { fetchParcelClient } from "@/lib/vworld-client";
import { formatDeal, formatEok, pyeong } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { MiniMap, type MapMarker } from "./MiniMap";

const THIS_YEAR = new Date().getFullYear();

export function ComplexDetail({
  region,
  apt,
  yyyymm,
  dataset = "aptTrade",
  umdNm: umdNmProp,
  jibun: jibunProp,
  onClose,
}: {
  region: string;
  apt: string;
  yyyymm: string;
  dataset?: string;
  umdNm?: string;
  jibun?: string;
  onClose: () => void;
}) {
  const [deals, setDeals] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [parcel, setParcel] = useState<Parcel | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCoord(null);
    setNearby(null);
    setParcel(null);
    fetchComplexDeals(region, apt, shiftMonth(yyyymm, -11), yyyymm, dataset)
      .then((d) => alive && setDeals(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [region, apt, yyyymm, dataset]);

  // 좌표: props로 umdNm/jibun이 있으면 deals 대기 없이 즉시 fetch (deals와 병렬)
  useEffect(() => {
    if (!umdNmProp) return;
    let alive = true;
    fetchCoord(region, umdNmProp, jibunProp ?? "", apt).then((c) => {
      if (!alive || !c) return;
      setCoord(c);
      fetchNearby(c.lat, c.lng).then((n) => alive && setNearby(n));
      fetchParcelClient(c.lat, c.lng).then((p) => alive && setParcel(p));
    });
    return () => { alive = false; };
  }, [region, apt, umdNmProp, jibunProp]);

  // 좌표 fallback: props 없을 때 deals 도착 후 지오코딩
  useEffect(() => {
    if (umdNmProp) return; // 위 effect가 처리
    if (deals.length === 0) return;
    const rep = deals.find((d) => d.jibun) ?? deals[0];
    let alive = true;
    fetchCoord(region, rep.umdNm, rep.jibun, apt).then((c) => {
      if (!alive || !c) return;
      setCoord(c);
      fetchNearby(c.lat, c.lng).then((n) => alive && setNearby(n));
      fetchParcelClient(c.lat, c.lng).then((p) => alive && setParcel(p));
    });
    return () => {
      alive = false;
    };
  }, [deals, region, apt, umdNmProp]);

  // ESC 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // 월별 평균 시계열 (면적 혼재로 들쭉날쭉한 것 방지)
  const series = useMemo(() => {
    const byMonth = new Map<string, { sum: number; n: number }>();
    for (const d of deals) {
      const v = d.dealAmount || d.deposit;
      if (!v) continue;
      const m = d.dealDate.slice(0, 7);
      const e = byMonth.get(m) ?? { sum: 0, n: 0 };
      e.sum += v;
      e.n += 1;
      byMonth.set(m, e);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, e]) => Math.round(e.sum / e.n));
  }, [deals]);

  // 주변 시설 → 지도 마커
  const FAC_COLOR: Record<string, string> = {
    office: "#0ea5e9", police: "#3b82f6", fire: "#ef4444",
    elem: "#22c55e", middle: "#16a34a", high: "#15803d",
    starbucks: "#0f7b3f", oliveyoung: "#84cc16", daiso: "#f59e0b", musinsa: "#a855f7",
    hospital: "#14b8a6",
  };
  // 입지 점수: 주변 시설 가중치 × 근접도(0~100)
  const locScore = useMemo(() => {
    if (!nearby) return null;
    // [가중치, 만점거리(m) — 이보다 가까우면 근접 만점]
    const W: Record<string, { w: number; far: number }> = {
      subway: { w: 24, far: 2000 }, // 교통 최우선
      hospital: { w: 10, far: 5000 },
      elem: { w: 9, far: 1200 },
      middle: { w: 7, far: 1500 },
      high: { w: 6, far: 1500 },
      office: { w: 5, far: 1500 },
      police: { w: 5, far: 2000 },
      fire: { w: 4, far: 2500 },
      starbucks: { w: 8, far: 1000 },
      oliveyoung: { w: 6, far: 1200 },
      daiso: { w: 5, far: 1200 },
      musinsa: { w: 3, far: 2000 },
    };
    const entries: [string, { distance: number } | null][] = [
      ["subway", nearby.subway],
      ...nearby.facilities.map((f) => [f.key, f.hit] as [string, { distance: number } | null]),
    ];
    let earned = 0;
    let total = 0;
    let present = 0;
    for (const [key, hit] of entries) {
      const cfg = W[key];
      if (!cfg) continue;
      total += cfg.w;
      if (hit) {
        present += 1;
        // 존재 0.5 + 근접 0.5 (가까울수록 만점)
        const prox = Math.max(0, Math.min(1, (cfg.far - hit.distance) / (cfg.far - 200)));
        earned += cfg.w * (0.5 + 0.5 * prox);
      }
    }
    const score = total ? Math.round((earned / total) * 100) : 0;
    const grade =
      score >= 90 ? "S" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
    return { score, grade, present, count: entries.length };
  }, [nearby]);

  const facilityMarkers: MapMarker[] = useMemo(() => {
    if (!nearby) return [];
    const out: MapMarker[] = [];
    if (nearby.subway?.lat)
      out.push({ label: `🚇 ${nearby.subway.name}`, lat: nearby.subway.lat, lng: nearby.subway.lng, color: "#2563eb" });
    for (const f of nearby.facilities) {
      if (f.hit?.lat)
        out.push({ label: f.label, lat: f.hit.lat, lng: f.hit.lng, color: FAC_COLOR[f.key] ?? "#64748b" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby]);

  const reversedDeals = useMemo(() => [...deals].reverse(), [deals]);

  const info = useMemo(() => {
    if (deals.length === 0) return null;
    const valued = deals.filter((d) => d.dealAmount || d.deposit);
    const amts = valued.map((d) => d.dealAmount || d.deposit);
    const last = deals[deals.length - 1];
    const peak = Math.max(...amts);
    const peakDeal = valued.find((d) => (d.dealAmount || d.deposit) === peak) ?? last;
    const avg = amts.length ? Math.round(amts.reduce((s, v) => s + v, 0) / amts.length) : 0;
    const buildYear = deals.find((d) => d.buildYear)?.buildYear ?? 0;
    // 면적(평) 종류
    const areas = [...new Set(deals.map((d) => Math.round(d.area)))].sort((a, b) => a - b);
    return {
      count: deals.length,
      last,
      peak,
      peakDate: peakDeal.dealDate,
      avg,
      buildYear,
      areas,
      latest: last.dealAmount || last.deposit,
    };
  }, [deals]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-[90vw] max-w-[1500px] overflow-y-auto rounded-t-2xl border border-slate-800 bg-[#0f172a] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{apt}</h3>
            {info && (
              <p className="mt-0.5 text-xs text-slate-400">
                {deals[deals.length - 1]?.umdNm} ·{" "}
                {info.buildYear
                  ? `${info.buildYear}년 (${THIS_YEAR - info.buildYear}년차)`
                  : ""}{" "}
                · 최근 12개월 {info.count}건 (최근 10건 표시)
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* 데이터 없음 (로딩 완료 후) */}
        {!loading && !info ? (
          <div className="py-16 text-center text-slate-500">거래 이력이 없습니다.</div>
        ) : (
          <>
            {/* 추이 + 요약 — 로딩 중 스켈레톤 */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              {loading ? (
                <>
                  <div className="animate-pulse rounded-xl border border-slate-800 bg-[#111a2e] p-3 h-24" />
                  <div className="animate-pulse rounded-xl border border-slate-800 bg-[#111a2e] p-3 h-24" />
                  <div className="animate-pulse rounded-xl border border-slate-800 bg-[#111a2e] p-3 h-24" />
                  <div className="animate-pulse rounded-xl border border-slate-800 bg-[#111a2e] p-3 h-24" />
                </>
              ) : info ? (
                <>
                  <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-[#13203a] to-[#0f172a] p-3">
                    <span className="text-xs text-slate-400">월별 평균가 추이</span>
                    <div className="mt-1 w-full">
                      <Sparkline values={series} width={220} height={56} responsive />
                    </div>
                  </div>
                  {/* 최근 거래 — 12개월 평균 대비 변동 */}
                  <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-[#0f172a] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                      최근 거래
                    </div>
                    <div className="mt-1 text-base font-bold text-blue-400">
                      {formatEok(info.latest)}
                    </div>
                    {(() => {
                      const diff = info.avg > 0 ? (info.latest - info.avg) / info.avg : 0;
                      const up = diff >= 0;
                      return (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold ${
                              up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {up ? "▲" : "▼"} 평균比 {up ? "+" : ""}
                            {Math.round(diff * 100)}%
                          </span>
                          <span className="text-slate-500">
                            {info.last.dealDate.slice(2)} · {pyeong(info.last.area)}평
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  {/* 전고점 — 달성 시점 */}
                  <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-[#0f172a] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                      전고점
                    </div>
                    <div className="mt-1 text-base font-bold text-amber-300">
                      {formatEok(info.peak)}
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500">
                      {info.peakDate} 달성
                    </div>
                  </div>
                  {/* 신고가까지 + % + 바 */}
                  <div className="rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-[#0f172a] p-3">
                    <div className="text-[11px] text-slate-400">신고가까지</div>
                    {(() => {
                      const ratio = info.peak > 0 ? info.latest / info.peak : 1;
                      const beat = info.latest >= info.peak;
                      return (
                        <>
                          <div className="mt-1 text-base font-bold text-rose-300">
                            {beat ? "🔥 신고가 경신" : formatEok(info.peak - info.latest)}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            전고점의 {Math.round(ratio * 100)}%
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500"
                              style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : null}
            </div>

            {/* 위치 미니맵 — coord 도착 즉시 표시, 마커/폴리곤은 나중에 추가됨 */}
            <div className="mb-4">
              {coord ? (
                <MiniMap
                  lat={coord.lat}
                  lng={coord.lng}
                  label={apt}
                  height={460}
                  markers={facilityMarkers}
                  parcel={parcel?.rings}
                />
              ) : (
                <div
                  style={{ height: 460 }}
                  className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50"
                />
              )}
            </div>

            {/* 주변 시설 */}
            {nearby && (
              <div className="mb-4 rounded-xl border border-slate-800 bg-[#111a2e] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-200">📍 주변 시설</div>
                  {locScore && (
                    <div className="flex items-center gap-2.5">
                      <div className="text-right leading-none">
                        <div className="mb-1 text-[10px] text-slate-400">입지 점수</div>
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className={`text-xl font-extrabold ${gradeText(locScore.grade)}`}>
                            {locScore.score}
                          </span>
                          <span className="text-[11px] text-slate-500">/100</span>
                        </div>
                      </div>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white ${gradeBg(locScore.grade)}`}
                        title={`주변 ${locScore.present}/${locScore.count}개 시설 충족`}
                      >
                        {locScore.grade}
                      </div>
                    </div>
                  )}
                </div>
                {locScore && (
                  <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${gradeBar(locScore.grade)}`}
                      style={{ width: `${locScore.score}%` }}
                    />
                  </div>
                )}
                {/* 교통: 지하철 */}
                {nearby.subway?.name && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-sm">
                    <span className="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[11px] font-bold text-white">지하철</span>
                    <span className="font-semibold text-slate-100">{nearby.subway.name}</span>
                    <span className="text-slate-400">도보 {nearby.subway.walkMin}분 · {nearby.subway.distance.toLocaleString()}m</span>
                  </div>
                )}

                {/* 주요 도심 접근성 (수도권만) */}
                {nearby.hubs && nearby.hubs.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400">주요 도심</span>
                    {nearby.hubs.map((h) => (
                      <span key={h.name} className="rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1 text-xs text-slate-300">
                        {h.name} <span className="text-slate-400">{(h.distance / 1000).toFixed(1)}km·차 {h.carMin}분</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {[...nearby.facilities]
                    // 거리순 정렬: 가까운 순, 없음(hit 없음)은 맨 뒤
                    .sort((a, b) => {
                      if (!a.hit && !b.hit) return 0;
                      if (!a.hit) return 1;
                      if (!b.hit) return -1;
                      return a.hit.distance - b.hit.distance;
                    })
                    .map((f) => {
                      if (!f.hit) {
                        return (
                          <span
                            key={f.key}
                            className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs text-slate-600"
                          >
                            {f.label}
                            <span className="ml-1 text-slate-600">없음</span>
                          </span>
                        );
                      }
                      // 가까울수록 진하게: 0~1500m → 진함(0.42) ~ 연함(0.06)
                      const t = Math.max(0, Math.min(1, (1500 - f.hit.distance) / 1500));
                      const bg = 0.06 + 0.34 * t;
                      const bd = 0.2 + 0.5 * t;
                      const textOp = 0.55 + 0.45 * t;
                      return (
                        <span
                          key={f.key}
                          className="rounded-lg border px-2.5 py-1 text-xs"
                          style={{
                            backgroundColor: `rgba(59,130,246,${bg.toFixed(2)})`,
                            borderColor: `rgba(59,130,246,${bd.toFixed(2)})`,
                            color: `rgba(226,232,240,${textOp.toFixed(2)})`,
                          }}
                        >
                          {f.label}
                          <span className="ml-1" style={{ color: `rgba(148,163,184,${textOp.toFixed(2)})` }}>
                            {f.hit.walkMin}분·{f.hit.distance.toLocaleString()}m
                          </span>
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 거래 목록 (최신순) — 로딩 중 스켈레톤 */}
            {loading ? (
              <div className="animate-pulse rounded-xl border border-slate-800 bg-[#111a2e] p-6 text-center text-sm text-slate-600">
                거래 이력 불러오는 중…
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800">
                <div className="max-h-[228px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#1a2438] text-left text-xs text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">계약일</th>
                        <th className="px-3 py-2 font-medium">전용</th>
                        <th className="px-3 py-2 font-medium">층</th>
                        <th className="px-3 py-2 text-right font-medium">거래가</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reversedDeals.map((d, i) => (
                        <tr key={i} className={d.cdealType === "O" ? "opacity-50" : ""}>
                          <td className="px-3 py-2 text-slate-300">
                            {d.dealDate}
                            {d.cdealType === "O" && (
                              <span className="ml-1 text-[10px] text-slate-500">해제</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            {d.area}㎡ ({pyeong(d.area)}평)
                          </td>
                          <td className="px-3 py-2 text-slate-400">{d.floor}층</td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-400">
                            {formatDeal(d)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 입지 등급별 색상
function gradeText(g: string): string {
  return { S: "text-violet-300", A: "text-emerald-300", B: "text-blue-300", C: "text-amber-300", D: "text-slate-400" }[g] ?? "text-slate-300";
}
function gradeBg(g: string): string {
  return { S: "bg-violet-500", A: "bg-emerald-500", B: "bg-blue-500", C: "bg-amber-500", D: "bg-slate-600" }[g] ?? "bg-slate-600";
}
function gradeBar(g: string): string {
  return {
    S: "bg-gradient-to-r from-indigo-400 to-violet-500",
    A: "bg-gradient-to-r from-emerald-400 to-teal-500",
    B: "bg-gradient-to-r from-sky-400 to-blue-500",
    C: "bg-gradient-to-r from-amber-400 to-orange-500",
    D: "bg-gradient-to-r from-slate-500 to-slate-600",
  }[g] ?? "bg-slate-600";
}

