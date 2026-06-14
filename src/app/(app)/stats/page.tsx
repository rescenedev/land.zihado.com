// 통계(/stats) — 당월 overview(KPI/카드) + statistics(차트) SSR seed.
import HomeClient from "@/components/HomeClient";
import { ssrOverview, ssrStatistics } from "@/lib/ssr";

export const revalidate = 1800; // 일1회 데이터 → 30분 (cron 워밍이 재생성 흡수, PRERENDER 콜드 꼬리 15배↓)
export const metadata = { title: "통계 · 실거래 대시보드" };

export default async function Page() {
  const [initialData, initialStats] = await Promise.all([
    ssrOverview("aptTrade", "all"),
    ssrStatistics("aptTrade", "all"),
  ]);
  return (
    <HomeClient
      initialData={initialData}
      initialStats={initialStats}
      initialDataset="aptTrade"
      initialView="stats"
    />
  );
}
