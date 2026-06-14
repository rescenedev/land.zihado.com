import HomeClient from "@/components/HomeClient";
import { ssrOverview } from "@/lib/ssr";
export const revalidate = 1800; // 일1회 데이터 → 30분 (cron 워밍이 재생성 흡수, PRERENDER 콜드 꼬리 15배↓)
export const metadata = { title: "전월세 · 실거래 대시보드" };
export default async function Page() {
  const initialData = await ssrOverview("aptRent", "all");
  return <HomeClient initialData={initialData} initialDataset="aptRent" initialView="cards" />;
}
