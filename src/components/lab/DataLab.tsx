// 데이터랩 허브 — 참고 이미지("부동산 스터디") 레이아웃의 아이콘 타일 그리드.
// 정적 서버컴포넌트(클라 JS 0) → prerender·엣지 HIT 로 즉시 응답.
import Link from "next/link";
import { LAB_TILES } from "./labTiles";
import { LAB_ICONS } from "./LabIcons";

export function DataLab() {
  return (
    <div className="mx-auto w-[92%] max-w-[1120px] px-2 py-8">
      <header className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-white">데이터랩</h1>
        <span className="text-sm text-slate-400">부동산 데이터를 한눈에</span>
      </header>
      <p className="mb-5 text-xs text-slate-500">국토교통부 실거래가 기반 분석 지표 모음</p>
      <div className="border-t border-slate-800/80 pt-6">
        <ul className="grid grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-4 md:grid-cols-5">
          {LAB_TILES.map((t) => {
            const href = t.href ?? `/lab/${t.slug}`;
            const soon = !t.href;
            return (
              <li key={t.slug}>
                <Link
                  href={href}
                  prefetch={false}
                  title={t.desc}
                  className="group flex flex-col items-center gap-2.5 rounded-2xl px-1.5 py-3 text-center transition hover:bg-slate-800/40"
                >
                  <span
                    className="relative flex h-14 w-14 items-center justify-center rounded-2xl transition group-hover:scale-105"
                    style={{ backgroundColor: `${t.color}1f`, color: t.color }}
                  >
                    {LAB_ICONS[t.icon]}
                    {soon && (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b1120] bg-slate-500"
                        aria-label="준비중"
                      />
                    )}
                  </span>
                  <span className="text-[13px] font-medium leading-tight text-slate-200">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
