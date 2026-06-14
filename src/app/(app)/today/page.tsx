// 오늘의 실거래(/today) — 오늘·전국·매매 거래 SSR seed.
import { TodayDeals } from "@/components/TodayDeals";
import { ssrTodayDeals } from "@/lib/ssr";

export const revalidate = 120;

export const metadata = {
  title: "오늘의 실거래 · 실거래 대시보드",
  description: "국토교통부 실거래가 · 일자별 신고 거래",
};

export default async function Page() {
  const initialDeals = await ssrTodayDeals("aptTrade", "all");
  return <TodayDeals initialDeals={initialDeals} />;
}
