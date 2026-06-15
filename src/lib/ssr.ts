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

// deals 와 함께 latest(월·스코프 최신 계약일)도 반환 — 빈 날에도 워커가 latest 를 채워주므로
// SSR 이 같은 응답에서 점프 타깃을 얻는다(별도 limit=1 프로브 = 직렬 워커 왕복 제거).
export async function ssrTodayDeals(
  dataset = "aptTrade",
  scope = "all",
  date?: string
): Promise<{ deals: Transaction[] | null; latest: string | null }> {
  try {
    const day = date ?? kstDate();
    const ym = `${day.slice(0, 4)}${day.slice(5, 7)}`; // YYYY-MM-DD → YYYYMM
    const r = await fetch(
      `${WORKER}/api/recent?dataset=${dataset}&scope=${encodeURIComponent(scope)}&yyyymm=${ym}&limit=300&date=${day}`,
      { next: { revalidate: 1800 } }
    );
    if (!r.ok) return { deals: null, latest: null };
    const d = (await r.json()) as { deals?: Transaction[]; latest?: string };
    return { deals: d.deals ?? null, latest: d.latest || null };
  } catch {
    return { deals: null, latest: null };
  }
}

// 데이터랩 랭킹 소스 — 무날짜 recent(당월 top-300, rise/추이 포함). 최고가·최고상승·최근하락이
// 이 한 응답을 메트릭별로 재정렬해 쓴다(cron 으로 워밍 → 엣지 HIT).
export async function ssrLabRecent(
  dataset = "aptTrade",
  scope = "all",
  yyyymm?: string,
): Promise<Transaction[] | null> {
  try {
    const ym = yyyymm ?? kstYmd();
    const r = await fetch(
      `${WORKER}/api/recent?dataset=${dataset}&scope=${encodeURIComponent(scope)}&yyyymm=${ym}&limit=300`,
      { next: { revalidate: 1800 } },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as { deals?: Transaction[] };
    return d.deals ?? null;
  } catch {
    return null;
  }
}

export type TradedComplex = {
  aptName: string;
  sggCd: string;
  umdNm: string | null;
  count: number;
  avgAmount: number;
  maxAmount: number;
  lastDate: string;
};

// 데이터랩 "많이산단지" — 당월·스코프 단지별 거래건수 랭킹.
export async function ssrTraded(
  dataset = "aptTrade",
  scope = "all",
  yyyymm?: string,
): Promise<TradedComplex[] | null> {
  try {
    const ym = yyyymm ?? kstYmd();
    const r = await fetch(
      `${WORKER}/api/lab/traded?dataset=${dataset}&scope=${encodeURIComponent(scope)}&yyyymm=${ym}&limit=100`,
      { next: { revalidate: 1800 } },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as { complexes?: TradedComplex[] };
    return d.complexes ?? null;
  } catch {
    return null;
  }
}

// 데이터랩 갭투자(metric=gap)/월세수익(metric=yield) — 단지단위 매매⨝전월세.
export type InvestComplex = {
  aptName: string;
  sggCd: string;
  umdNm: string | null;
  sale: number; // 매매 평균(만원)
  ref: number; // gap=전세 평균, yield=월세 평균(만원)
  value: number; // gap=갭(만원), yield=수익률(%)
};
export async function ssrInvest(
  metric: "gap" | "yield",
  scope = "all",
  yyyymm?: string,
): Promise<InvestComplex[] | null> {
  try {
    const ym = yyyymm ?? kstYmd();
    const r = await fetch(
      `${WORKER}/api/lab/invest?metric=${metric}&scope=${encodeURIComponent(scope)}&yyyymm=${ym}&limit=100`,
      { next: { revalidate: 1800 } },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as { complexes?: InvestComplex[] };
    return d.complexes ?? null;
  } catch {
    return null;
  }
}

// 데이터랩 분양가비교 — 지역단위 분양권 평단가 vs 매매 평단가.
export type PresaleRegion = {
  sggCd: string;
  name: string; // 시도+시군구 (워커 REGION_NAMES)
  silvPpa: number;
  salePpa: number;
  silvN: number;
  saleN: number;
  diffPct: number;
};
export async function ssrPresale(scope = "all", yyyymm?: string): Promise<PresaleRegion[] | null> {
  try {
    const ym = yyyymm ?? kstYmd();
    const r = await fetch(
      `${WORKER}/api/lab/presale?scope=${encodeURIComponent(scope)}&yyyymm=${ym}&limit=60`,
      { next: { revalidate: 1800 } },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as { regions?: PresaleRegion[] };
    return d.regions ?? null;
  } catch {
    return null;
  }
}

// 데이터랩 허브 타일별 헤드라인 수치(당월·전국·매매).
export type LabSummary = {
  yyyymm: string;
  top: { amount: number };
  rise: { pct: number | null };
  decline: { pct: number | null };
  "hot-complex": { count: number };
  volume: { count: number; deltaPct: number | null };
  volatility: { avg: number; deltaPct: number | null };
};
export async function ssrLabSummary(yyyymm?: string): Promise<LabSummary | null> {
  try {
    const ym = yyyymm ?? kstYmd();
    const r = await fetch(`${WORKER}/api/lab/summary?yyyymm=${ym}`, { next: { revalidate: 1800 } });
    if (!r.ok) return null;
    return (await r.json()) as LabSummary;
  } catch {
    return null;
  }
}
