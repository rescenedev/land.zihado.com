// 오늘의 실거래 — date/sido/dataset 를 경로 세그먼트로 받는 ISR 라우트.
//   /today                         → 오늘·전국·매매 (기본, 빌드 prerender)
//   /today/2026-06-12              → 날짜
//   /today/2026-06-12/경기          → 날짜·시도
//   /today/2026-06-12/경기/aptRent  → 날짜·시도·데이터셋
// searchParams 대신 경로 세그먼트라서 URL 별로 ISR 캐시(첫 히트 후 HIT ~14ms). 공유 가능.
import { notFound } from "next/navigation";
import { TodayDeals } from "@/components/TodayDeals";
import { ssrTodayDeals, ssrLatestDealDate, kstDate } from "@/lib/ssr";

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
  const hasExplicitDate = !!slug[0];
  const sido = slug[1] ? decodeURIComponent(slug[1]) : "전국";
  const dataset = slug[2] ?? "aptTrade";
  const scope = scopeOf(sido);

  let date = slug[0] ?? kstDate();
  let initialDeals = await ssrTodayDeals(dataset, scope, date);

  // 기본 진입(오늘)인데 오늘 계약분이 아직 0건이면(MOLIT 신고 지연) → 데이터 있는 최신 신고일로
  // 자동 점프. 사용자가 명시한 날짜(slug[0])는 그대로 둬서 ‹ › 빈날짜 탐색을 막지 않는다.
  if (!hasExplicitDate && (initialDeals?.length ?? 0) === 0) {
    const ym = `${date.slice(0, 4)}${date.slice(5, 7)}`;
    const latest = await ssrLatestDealDate(dataset, scope, ym);
    if (latest && latest !== date) {
      date = latest;
      initialDeals = await ssrTodayDeals(dataset, scope, latest);
    }
  }

  return (
    <TodayDeals
      initialDeals={initialDeals}
      initialDataset={dataset}
      initialSido={sido}
      initialDate={date}
    />
  );
}
