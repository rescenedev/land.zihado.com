// 데이터랩 지표 상세(/lab/[slug]) — 아직 데이터가 없는 지표의 "준비 중" 상세.
// href 가 매핑된 타일은 허브에서 기존 라우트로 바로 가므로 여기 오지 않는다(준비중 slug 만 정적 생성).
import { notFound } from "next/navigation";
import Link from "next/link";
import { LAB_TILE_BY_SLUG, LAB_SOON_SLUGS } from "@/components/lab/labTiles";
import { LAB_ICONS } from "@/components/lab/LabIcons";

export const dynamicParams = false; // 정의된 준비중 slug 외엔 404

export function generateStaticParams() {
  return LAB_SOON_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = LAB_TILE_BY_SLUG[(await params).slug];
  return t
    ? { title: `${t.label} · 데이터랩`, description: t.desc }
    : { title: "데이터랩" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const t = LAB_TILE_BY_SLUG[(await params).slug];
  if (!t) notFound();

  return (
    <div className="mx-auto w-[92%] max-w-[680px] px-2 py-10">
      <Link href="/lab" className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200">
        ‹ 데이터랩
      </Link>

      <div className="mt-8 flex flex-col items-center text-center">
        <span
          className="flex h-20 w-20 items-center justify-center rounded-3xl"
          style={{ backgroundColor: `${t.color}1f`, color: t.color }}
        >
          {LAB_ICONS[t.icon]}
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">{t.label}</h1>
        <p className="mt-2 max-w-[420px] text-sm leading-relaxed text-slate-400">{t.desc}</p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          준비 중인 지표입니다
        </div>

        {t.related && t.related.length > 0 && (
          <div className="mt-8 w-full border-t border-slate-800/80 pt-6">
            <div className="mb-3 text-xs font-medium text-slate-500">관련 메뉴</div>
            <div className="flex flex-wrap justify-center gap-2">
              {t.related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm text-slate-200 transition hover:border-blue-500/60 hover:bg-slate-800"
                >
                  {r.label} →
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
