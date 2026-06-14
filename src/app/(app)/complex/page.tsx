import HomeClient from "@/components/HomeClient";
import { ssrOverview } from "@/lib/ssr";
export const revalidate = 120;
export const metadata = { title: "단지 검색 · 실거래 대시보드" };
export default async function Page() {
  const initialData = await ssrOverview("aptTrade", "all");
  return <HomeClient initialData={initialData} initialDataset="aptTrade" initialView="cards" initialPaletteOpen />;
}
