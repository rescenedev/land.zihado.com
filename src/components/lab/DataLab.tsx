// 데이터랩 허브 — 참고 디자인(부동산 스터디)의 아이콘 타일 그리드.
// 타일 하단에 당월 헤드라인 수치(최고가·상승·하락·거래량 등)를 함께 노출. 큼직한 아이콘.
// 서버컴포넌트(클라 JS 0). summary 는 워밍된 /api/lab/summary → ISR·엣지 HIT.
import Link from "next/link";
import { LAB_TILES } from "./labTiles";
import { LAB_ICONS } from "./LabIcons";
import { formatAmountFull } from "@/lib/format";
import type { LabSummary } from "@/lib/ssr";

type Metric = { value: string; tone: "up" | "down" | "neutral" };

// 타일별 당월 헤드라인 수치. 데이터 없는 타일은 null.
function metricFor(slug: string, s: LabSummary | null): Metric | null {
  if (!s) return null;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  switch (slug) {
    case "top":
      return s.top.amount > 0 ? { value: formatAmountFull(s.top.amount), tone: "neutral" } : null;
    case "rise":
      return typeof s.rise.pct === "number" ? { value: `${sign(s.rise.pct)}${s.rise.pct}%`, tone: "up" } : null;
    case "decline":
      return typeof s.decline.pct === "number" ? { value: `${s.decline.pct}%`, tone: "down" } : null;
    case "hot-complex":
      return s["hot-complex"].count > 0 ? { value: `${s["hot-complex"].count}건`, tone: "neutral" } : null;
    case "volume":
      // 당월은 신고지연으로 미완성 → 완성된 전월과의 MoM 델타는 오도. 누적 건수만.
      return s.volume.count > 0 ? { value: `${s.volume.count.toLocaleString()}건`, tone: "neutral" } : null;
    case "volatility":
      // 평균가(당월 누적). MoM 델타는 미완성 편향이라 생략.
      return s.volatility.avg > 0 ? { value: formatAmountFull(s.volatility.avg), tone: "neutral" } : null;
    default:
      return null;
  }
}

const TONE: Record<Metric["tone"], string> = {
  up: "text-rose-400",
  down: "text-blue-400",
  neutral: "text-slate-300",
};

export function DataLab({ summary }: { summary: LabSummary | null }) {
  return (
    <div className="mx-auto w-[92%] max-w-[1120px] px-2 py-8">
      <header className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-white">데이터랩</h1>
        <span className="text-sm text-slate-400">부동산 데이터를 한눈에</span>
      </header>
      <p className="mb-6 text-xs text-slate-500">
        국토교통부 실거래가 기반 분석 지표 · 당월 전국 아파트 매매 기준
      </p>
      <div className="border-t border-slate-800/80 pt-7">
        <ul className="grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {LAB_TILES.map((t) => {
            const soon = !t.href && !t.view; // 데이터 없음 → 회색·클릭불가
            const m = metricFor(t.slug, summary);

            // 준비중: Link 아님(클릭불가) + 전체 회색 처리.
            if (soon) {
              return (
                <li key={t.slug}>
                  <div
                    title={`${t.desc} (준비 중)`}
                    aria-disabled="true"
                    className="flex cursor-not-allowed flex-col items-center gap-2.5 rounded-2xl px-1.5 py-3 text-center opacity-45 grayscale"
                  >
                    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-slate-700/30 text-slate-500">
                      {LAB_ICONS[t.icon]}
                    </span>
                    <span className="text-sm font-semibold leading-tight text-slate-400">{t.label}</span>
                    <span className="text-xs text-slate-500">준비중</span>
                  </div>
                </li>
              );
            }

            const href = t.href ?? `/lab/${t.slug}`;
            return (
              <li key={t.slug}>
                <Link
                  href={href}
                  prefetch={false}
                  title={t.desc}
                  className="group flex flex-col items-center gap-2.5 rounded-2xl px-1.5 py-3 text-center transition hover:bg-slate-800/40"
                >
                  <span
                    className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[20px] transition group-hover:scale-105"
                    style={{ backgroundColor: `${t.color}1f`, color: t.color }}
                  >
                    {LAB_ICONS[t.icon]}
                  </span>
                  <span className="text-sm font-semibold leading-tight text-slate-100">{t.label}</span>
                  {m ? (
                    <span className={`text-xs font-bold tabular-nums ${TONE[m.tone]}`}>{m.value}</span>
                  ) : (
                    <span className="text-xs text-slate-600">·</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
