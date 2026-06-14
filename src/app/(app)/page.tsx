// 대시보드(/) — 당월 overview SSR seed.
import HomeClient from "@/components/HomeClient";
import { ssrOverview } from "@/lib/ssr";

export const revalidate = 120;

export default async function Page() {
  const initialData = await ssrOverview("aptTrade", "all");
  return <HomeClient initialData={initialData} initialDataset="aptTrade" initialView="cards" />;
}
