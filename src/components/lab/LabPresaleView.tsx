// 데이터랩 분양가비교 — 지역(시군구)단위 분양권 평단가 vs 아파트 매매 평단가. 서버컴포넌트.
import Link from "next/link";
import type { PresaleRegion } from "@/lib/ssr";
import { ALL_DISTRICTS } from "@/lib/regions";

const regionName = (sggCd: string) =>
  ALL_DISTRICTS.find((d) => d.code === sggCd)?.name ?? sggCd;

const won = (manwon: number) => `${manwon.toLocaleString()}만`;

export function LabPresaleView({
  regions,
  label,
  desc,
  color,
  yyyymm,
}: {
  regions: PresaleRegion[];
  label: string;
  desc: string;
  color: string;
  yyyymm: string;
}) {
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
      <p className="mb-5 text-xs text-slate-500">{ym} · 평단가 = 평(3.3㎡)당 만원 · 분양권·매매 표본 충분한 {regions.length}개 지역</p>

      {regions.length === 0 ? (
        <div className="py-16 text-center text-slate-500">분양권·매매 비교가 가능한 지역이 없습니다.</div>
      ) : (
        <ol className="flex flex-col gap-2">
          {regions.map((r, i) => {
            const premium = r.diffPct >= 0;
            return (
              <li
                key={`${r.sggCd}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#111a2e] px-4 py-3"
              >
                <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums" style={{ color: i < 3 ? color : "#64748b" }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold text-slate-100">{regionName(r.sggCd)}</span>
                    <span className={`shrink-0 text-base font-extrabold tabular-nums ${premium ? "text-rose-400" : "text-blue-400"}`}>
                      {premium ? "+" : ""}{r.diffPct}%
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="text-slate-400">
                      분양권 <span className="font-semibold text-violet-300">{won(r.silvPpa)}</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      매매 <span className="font-semibold text-slate-200">{won(r.salePpa)}</span>
                    </span>
                    <span className="text-slate-500">분양권 {r.silvN} · 매매 {r.saleN}건</span>
                  </div>
                  {/* 분양권 평단가가 매매 대비 얼마나 높/낮은지 시각화 */}
                  <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full" style={{ width: `${Math.min(100, (r.salePpa / Math.max(r.silvPpa, r.salePpa)) * 100)}%`, backgroundColor: "#64748b" }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
