// 오늘의 실거래 — date/sido/dataset 를 경로 세그먼트로 받는 ISR 라우트.
//   /today                         → 오늘·전국·매매 (기본, 빌드 prerender)
//   /today/2026-06-12              → 날짜
//   /today/2026-06-12/경기          → 날짜·시도
//   /today/2026-06-12/경기/aptRent  → 날짜·시도·데이터셋
// searchParams 대신 경로 세그먼트라서 URL 별로 ISR 캐시(첫 히트 후 HIT ~14ms). 공유 가능.
import { notFound } from "next/navigation";
import { TodayDeals } from "@/components/TodayDeals";
import { ssrTodayDeals, kstDate } from "@/lib/ssr";

export const revalidate = 1800; // 일1회 데이터 → 30분 (cron 워밍이 재생성 흡수)
export const dynamicParams = true; // prerender 안 된 조합은 첫 요청시 on-demand ISR

export const metadata = {
  title: "오늘의 실거래 · 실거래 대시보드",
  description: "국토교통부 실거래가 · 일자별 신고 거래",
};

const scopeOf = (sido: string) =>
  sido === "전국" ? "all" : sido === "서울" ? "seoul" : sido;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

// 기본(오늘) 페이지를 빌드 prerender → 랜딩 즉시 HIT. 나머지는 on-demand ISR.
export function generateStaticParams() {
  return [{ slug: [] as string[] }];
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const slug = (await params).slug ?? [];
  if (slug[0] && !RE_DATE.test(slug[0])) notFound();
  const date = slug[0] ?? kstDate();
  const sido = slug[1] ? decodeURIComponent(slug[1]) : "전국";
  const dataset = slug[2] ?? "aptTrade";
  const initialDeals = await ssrTodayDeals(dataset, scopeOf(sido), date);
  return (
    <TodayDeals
      initialDeals={initialDeals}
      initialDataset={dataset}
      initialSido={sido}
      initialDate={date}
    />
  );
}
