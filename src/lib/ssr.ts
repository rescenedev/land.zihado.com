// 서버 컴포넌트 전용: 라우트별 초기 데이터를 워커에서 직접 받아 SSR seed.
// 워커 KV(글로벌, await 바닥)에서 즉시 + ISR(revalidate)로 렌더 HTML 캐시 → 첫 진입 빠름.
import { type OverviewResponse, type Transaction } from "@/lib/api";

const WORKER = process.env.WORKER_ORIGIN || "https://api.zihado.com";

// KST 당월 YYYYMM (서버 UTC → +9h, 클라 ymdOf(new Date())와 일치)
export function kstYmd(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

// KST 오늘 YYYY-MM-DD (TodayDeals todayStr() 와 일치)
export function kstDate(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}

export async function ssrOverview(
  dataset = "aptTrade",
  scope = "all"
): Promise<OverviewResponse | null> {
  try {
    const r = await fetch(
      `${WORKER}/api/overview?dataset=${dataset}&scope=${scope}&yyyymm=${kstYmd()}`,
      { next: { revalidate: 120 } }
    );
    if (!r.ok) return null;
    return (await r.json()) as OverviewResponse;
  } catch {
    return null;
  }
}

export async function ssrTodayDeals(
  dataset = "aptTrade",
  scope = "all"
): Promise<Transaction[] | null> {
  try {
    const date = kstDate();
    const r = await fetch(
      `${WORKER}/api/recent?dataset=${dataset}&scope=${scope}&yyyymm=${kstYmd()}&limit=300&date=${date}`,
      { next: { revalidate: 120 } }
    );
    if (!r.ok) return null;
    const d = (await r.json()) as { deals?: Transaction[] };
    return d.deals ?? null;
  } catch {
    return null;
  }
}
