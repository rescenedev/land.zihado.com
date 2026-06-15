// 서버 컴포넌트 전용: 라우트별 초기 데이터를 워커에서 직접 받아 SSR seed.
// 워커 KV(글로벌, await 바닥)에서 즉시 + ISR(revalidate)로 렌더 HTML 캐시 → 첫 진입 빠름.
import { type OverviewResponse, type Transaction, type Statistics } from "@/lib/api";

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
      { next: { revalidate: 1800 } }
    );
    if (!r.ok) return null;
    return (await r.json()) as OverviewResponse;
  } catch {
    return null;
  }
}

export async function ssrStatistics(
  dataset = "aptTrade",
  scope = "all"
): Promise<Statistics | null> {
  try {
    const r = await fetch(
      `${WORKER}/api/statistics?dataset=${dataset}&scope=${scope}&yyyymm=${kstYmd()}`,
      { next: { revalidate: 1800 } }
    );
    if (!r.ok) return null;
    return (await r.json()) as Statistics;
  } catch {
    return null;
  }
}

// YYYYMM → 직전 월 YYYYMM (당월에 아직 신고분이 없을 때 폴백용)
function prevYm(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const d = new Date(Date.UTC(y, m - 2, 1)); // m-1=당월(0-based), 한 칸 더 빼면 직전 월
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 해당 월의 최신 계약일(YYYY-MM-DD)만 싸게 탐색(limit=1). 당월이 비면 직전 월로 1회 폴백.
// 오늘 계약분이 아직 0건일 때 "데이터 있는 최근일"로 자동 점프하기 위한 프로브.
export async function ssrLatestDealDate(
  dataset = "aptTrade",
  scope = "all",
  ym?: string
): Promise<string | null> {
  const probe = async (m: string): Promise<string | null> => {
    try {
      const r = await fetch(
        `${WORKER}/api/recent?dataset=${dataset}&scope=${encodeURIComponent(scope)}&yyyymm=${m}&limit=1`,
        { next: { revalidate: 1800 } }
      );
      if (!r.ok) return null;
      const d = (await r.json()) as { latest?: string };
      return d.latest || null;
    } catch {
      return null;
    }
  };
  const base = ym ?? kstYmd();
  return (await probe(base)) ?? (await probe(prevYm(base)));
}

export async function ssrTodayDeals(
  dataset = "aptTrade",
  scope = "all",
  date?: string
): Promise<Transaction[] | null> {
  try {
    const day = date ?? kstDate();
    const ym = `${day.slice(0, 4)}${day.slice(5, 7)}`; // YYYY-MM-DD → YYYYMM
    const r = await fetch(
      `${WORKER}/api/recent?dataset=${dataset}&scope=${encodeURIComponent(scope)}&yyyymm=${ym}&limit=300&date=${day}`,
      { next: { revalidate: 1800 } }
    );
    if (!r.ok) return null;
    const d = (await r.json()) as { deals?: Transaction[] };
    return d.deals ?? null;
  } catch {
    return null;
  }
}
