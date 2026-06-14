// 통계(/stats) — 당월 overview(KPI/카드) + statistics(차트) SSR seed.
import HomeClient from "@/components/HomeClient";
import { ssrOverview, ssrStatistics } from "@/lib/ssr";

export const revalidate = 120;
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
