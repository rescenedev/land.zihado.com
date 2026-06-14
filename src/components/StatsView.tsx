"use client";

import { useEffect, useState } from "react";
import { fetchStatistics, type Statistics } from "@/lib/api";
import { formatEok } from "@/lib/format";

export function StatsView({
  yyyymm,
  scope,
  dataset = "aptTrade",
  initialData = null,
}: {
  yyyymm: string;
  scope: string;
  dataset?: string;
  initialData?: Statistics | null;
}) {
  // 서버 SSR 초기 통계(당월·전국·매매)로 seed → 첫 페인트에 차트 즉시("집계 중" 제거)
  const [data, setData] = useState<Statistics | null>(initialData);
  const [pending, setPending] = useState(!initialData);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setErr("");
    setPending(true);
    // 재조회 중에도 이전 통계를 화면에 유지(깜빡임 제거). 새 데이터 도착 시 교체.
    fetchStatistics(yyyymm, scope, dataset)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setPending(false));
    return () => {
      alive = false;
    };
  }, [yyyymm, scope, dataset]);

  // "통계 집계 중"은 최초 로드(이전 데이터 없음)에만 표시
  if (!data && pending) return <div className="py-20 text-center text-slate-500">통계 집계 중…</div>;
  if (err && !data) return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>;
  if (!data?.summary)
    return <div className="py-20 text-center text-slate-500">해당 월 데이터가 없습니다.</div>;

  const s = data.summary;
  const maxPrice = Math.max(...data.byPrice.map((b) => b.count), 1);
  const maxRegionAvg = Math.max(...data.byRegion.map((r) => r.avg), 1);
  const maxAreaAvg = Math.max(...data.byAreaBand.map((b) => b.avg), 1);
  const maxDecadeAvg = Math.max(...data.byDecade.map((b) => b.avg), 1);

  return (
    <div className={`space-y-6 transition-opacity ${pending ? "opacity-50" : ""}`}>
      <div className="text-xs text-slate-500">
        {scope === "all" ? "전국" : scope === "seoul" ? "서울 전체" : `${scope} 전체`} · {yyyymm.slice(0, 4)}.{yyyymm.slice(4, 6)} ·
        표본 {s.count.toLocaleString()}건 · 수집 {data.coverage.loaded}/{data.coverage.total}개 지역
      </div>

      {/* 핵심 통계 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Metric label="평균가" value={formatEok(s.avg)} accent />
        <Metric label="중앙값" value={formatEok(s.median)} accent />
        <Metric label="하위 25%" value={formatEok(s.p25)} />
        <Metric label="상위 25%" value={formatEok(s.p75)} />
        <Metric label="상위 10%" value={formatEok(s.p90)} />
        <Metric label="최고가" value={formatEok(s.max)} />
        <Metric label="최저가" value={formatEok(s.min)} />
        <Metric label="표준편차" value={formatEok(s.stdev)} />
        <Metric label="㎡당 평균" value={`${s.perArea.toLocaleString()}만`} />
        <Metric label="평당 평균" value={formatEok(Math.round(s.perArea * 3.305785))} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 가격 분포 */}
        <Panel title="가격대 분포">
          <div className="space-y-2">
            {data.byPrice.map((b) => (
              <div key={b.label} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-right text-slate-400">{b.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="flex h-full items-center justify-end rounded bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 shadow-[0_0_10px_rgba(59,130,246,0.5)] pr-1.5 text-[10px] font-semibold text-white"
                    style={{ width: `${Math.max(3, (b.count / maxPrice) * 100)}%` }}
                  >
                    {b.count > 0 ? b.count : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* 면적대별 */}
        <Panel title="면적대별 평균가">
          <div className="space-y-3">
            {data.byAreaBand.map((b) => (
              <BarRow
                key={b.band}
                label={b.band}
                count={b.count}
                value={b.avg}
                pct={(b.avg / maxAreaAvg) * 100}
              />
            ))}
          </div>
        </Panel>

        {/* 건축연대별 */}
        <Panel title="건축연대별 평균가">
          <div className="space-y-3">
            {data.byDecade.map((b) => (
              <BarRow
                key={b.decade}
                label={b.decade}
                count={b.count}
                value={b.avg}
                pct={(b.avg / maxDecadeAvg) * 100}
              />
            ))}
          </div>
        </Panel>

        {/* 지역 평균가 랭킹 */}
        <Panel title="지역 평균가 랭킹 (상위 12)">
          <div className="space-y-2">
            {data.byRegion.slice(0, 12).map((r, i) => (
              <div key={r.sggCd} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-right text-xs text-slate-500">{i + 1}</span>
                <span className="w-24 shrink-0 truncate text-slate-300">
                  {scope === "all" && r.sido ? `${r.sido} ` : ""}
                  {r.name}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${(r.avg / maxRegionAvg) * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right text-xs font-semibold text-slate-200">
                  {formatEok(r.avg)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BarRow({
  label,
  count,
  value,
  pct,
}: {
  label: string;
  count: number;
  value: number;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{count}건</span>
          <span className="font-bold text-blue-400">{formatEok(value)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#111a2e] p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? "text-blue-400" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111a2e] p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-200">{title}</h3>
      {children}
    </div>
  );
}
