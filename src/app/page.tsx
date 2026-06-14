// 서버 컴포넌트: 당월 overview 를 서버에서 받아 HomeClient 에 seed.
// → 첫 페인트에 KPI·시도 카드가 실제 숫자로 즉시 표시(기존 "use client" 빈 껍데기 제거).
// ISR(revalidate)로 렌더 HTML 자체도 캐시 → 재방문 즉시. 클라이언트는 마운트 시 재fetch로 최신화.
import HomeClient from "@/components/HomeClient";
import { type OverviewResponse } from "@/lib/api";

export const revalidate = 120; // SSR HTML 2분 캐시(당월 데이터는 일 1회 갱신 → 충분)

const WORKER = process.env.WORKER_ORIGIN || "https://api.zihado.com";

// KST 당월 YYYYMM (서버는 UTC → +9h 보정, 클라 ymdOf(new Date())와 일치)
function kstYmd(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getInitialOverview(): Promise<OverviewResponse | null> {
  try {
    const r = await fetch(
      `${WORKER}/api/overview?dataset=aptTrade&scope=all&yyyymm=${kstYmd()}`,
      { next: { revalidate: 120 } }
    );
    if (!r.ok) return null;
    return (await r.json()) as OverviewResponse;
  } catch {
    return null; // 실패 시 클라이언트가 마운트에서 fetch (기존 동작)
  }
}

export default async function Page() {
  const initialData = await getInitialOverview();
  return <HomeClient initialData={initialData} />;
}
