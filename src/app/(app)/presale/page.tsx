import HomeClient from "@/components/HomeClient";
import { ssrOverview } from "@/lib/ssr";
export const revalidate = 120;
export const metadata = { title: "분양권 · 실거래 대시보드" };
export default async function Page() {
  const initialData = await ssrOverview("silvTrade", "all");
  return <HomeClient initialData={initialData} initialDataset="silvTrade" initialView="cards" />;
}
