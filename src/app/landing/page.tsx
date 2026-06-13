import type { Metadata } from "next";
import Link from "next/link";
import { formatEok } from "@/lib/format";

const SITE = "https://land.zihado.com";
const DESC =
  "국토교통부 실거래가 기반 전국 아파트 실거래 대시보드. 지도 단지 시세, 오늘의 실거래, 입지 스코어링, 통계까지 한 곳에서.";

export const metadata: Metadata = {
  title: "땅값 · 전국 아파트 실거래 대시보드",
  description: DESC,
  alternates: { canonical: `${SITE}/landing` },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${SITE}/landing`,
    siteName: "땅값 실거래 대시보드",
    title: "전국 아파트 실거래, 한눈에",
    description: DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "전국 아파트 실거래, 한눈에",
    description: DESC,
  },
};

type Totals = { count: number; avg: number; max: number; loaded: number; regions: number };

async function getStats(): Promise<Totals | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE || "https://api.zihado.com";
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  try {
    const r = await fetch(`${base}/api/overview?dataset=aptTrade&scope=all&yyyymm=${ym}`, {
      next: { revalidate: 600 },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { totals?: Totals };
    return d.totals ?? null;
  } catch {
    return null;
  }
}

const FEATURES = [
  {
    icon: "🗺️",
    title: "지도 단지 시세",
    desc: "시도 → 구 → 단지 드릴다운. 단지를 가격 색상 버블로, 겹치면 클러스터링하고 확대할수록 상세하게.",
  },
  {
    icon: "📈",
    title: "오늘의 실거래",
    desc: "계약일 기준 최신 신고분. 최고가·최고상승·신고가 뱃지와 가격대·지역별 차트까지.",
  },
  {
    icon: "🏅",
    title: "입지 스코어링",
    desc: "지하철·학교·병원·생활편의 등 주변 인프라를 점수화해 단지 입지를 S~D 등급으로.",
  },
  {
    icon: "🧮",
    title: "동평형 비교 · 통계",
    desc: "같은 평형 기준 직전 거래가·최고가, 12개월 추이, 분위수·면적대·연식 분포 통계.",
  },
];

export default async function Landing() {
  const t = await getStats();
  const stats = [
    { label: "전국 거래(당월)", value: t ? `${t.count.toLocaleString()}건` : "—" },
    { label: "84㎡ 평균가", value: t && t.avg ? formatEok(t.avg) : "—" },
    { label: "최고 거래가", value: t && t.max ? formatEok(t.max) : "—" },
    { label: "수집 지역", value: t ? `${t.loaded}/${t.regions}` : "—" },
  ];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100">
      {/* 배경 글로우 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-[90%] max-w-[1100px] px-2">
        {/* 헤더 */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">실</div>
            <span className="text-sm font-bold">땅값 · 실거래 대시보드</span>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-sm text-slate-300 transition hover:border-blue-500/60 hover:text-white"
          >
            대시보드 →
          </Link>
        </header>

        {/* 히어로 */}
        <section className="pt-16 pb-12 text-center sm:pt-24">
          <span className="inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
            국토교통부 실거래가 공개시스템 기반
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            전국 아파트 실거래,
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              지도 위에서 한눈에
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-base leading-relaxed text-slate-400 sm:text-lg">
            {DESC}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
            >
              대시보드 바로가기 →
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              오늘의 실거래 보기
            </Link>
          </div>
        </section>

        {/* 라이브 지표 */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-800 bg-[#111a2e] px-4 py-5 text-center">
              <div className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{s.value}</div>
              <div className="mt-1 text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </section>
        <p className="mt-2 text-center text-[11px] text-slate-600">실시간 집계 · 당월 기준 (10분 캐시)</p>

        {/* 기능 */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-bold tracking-tight">무엇을 볼 수 있나요</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-800 bg-[#111a2e] p-6 transition hover:border-blue-500/40">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 text-lg font-bold text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-20 rounded-3xl border border-slate-800 bg-gradient-to-b from-[#13203a] to-[#0f1729] px-6 py-14 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">지금 우리 동네 시세를 확인해보세요</h2>
          <p className="mt-3 text-sm text-slate-400">설치·로그인 없이 바로. 전국 모든 시군구 · 매매 / 전월세 / 분양권.</p>
          <Link
            href="/"
            className="mt-7 inline-block rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
          >
            대시보드 바로가기 →
          </Link>
        </section>

        {/* 푸터 */}
        <footer className="mt-16 space-y-1.5 border-t border-slate-800/60 py-8 text-center text-[11px] text-slate-600">
          <div>
            데이터: 국토교통부 실거래가 공개시스템 (data.go.kr) · 지도 © Kakao · 지적도 VWorld
          </div>
          <div>프론트 Vercel · API Cloudflare Workers (D1 · KV · Queue)</div>
        </footer>
      </div>
    </div>
  );
}
