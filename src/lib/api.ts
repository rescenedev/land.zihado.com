// 빈 문자열 = 상대경로 → Vercel 서울 엣지 프록시(/api/[...path])를 통해 CF 워커 호출(캐시).
// 로컬은 .env.local 에서 http://localhost:8787 로 워커 직접 호출.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// 클라이언트 메모리 캐시 + 동일요청 합치기 → 눌렀던 페이지 재방문 즉시(네트워크 0)
type CacheEntry = { t: number; ok: boolean; data: unknown };
const _mem = new Map<string, CacheEntry>();
const _inflight = new Map<string, Promise<CacheEntry>>();
const MAX_MEM = 150;

function evictOldest(): void {
  if (_mem.size <= MAX_MEM) return;
  let oldestKey = "";
  let oldestT = Infinity;
  for (const [k, v] of _mem) {
    if (v.t < oldestT) { oldestT = v.t; oldestKey = k; }
  }
  if (oldestKey) _mem.delete(oldestKey);
}

async function cachedGet(
  url: string,
  ttlMs = 5 * 60 * 1000,
  // 캐시 가능 여부(기본: 성공이면 캐시). 수집 중(filling) 응답 등은 캐시 제외용.
  cacheable?: (data: unknown, ok: boolean) => boolean
): Promise<CacheEntry> {
  const now = Date.now();
  const hit = _mem.get(url);
  if (hit && now - hit.t < ttlMs) return hit;
  const flying = _inflight.get(url);
  if (flying) return flying;
  const p = (async () => {
    const res = await fetch(url);
    const data = await res.json();
    const entry: CacheEntry = { t: Date.now(), ok: res.ok, data };
    const store = cacheable ? cacheable(data, res.ok) : res.ok;
    if (store) { _mem.set(url, entry); evictOldest(); } // 성공(+조건) 만 캐시
    _inflight.delete(url);
    return entry;
  })().catch((e) => {
    _inflight.delete(url);
    throw e;
  });
  _inflight.set(url, p);
  return p;
}

export type RegionRow = {
  sggCd: string;
  sido: string;
  name: string;
  count: number;
  avg: number;
  avg84: number;
  max: number;
  min: number;
  loaded: boolean;
  trend: number[];
};

export type OverviewResponse = {
  dataset: string;
  yyyymm: string;
  scope: string;
  totals: {
    regions: number;
    loaded: number;
    count: number;
    avg: number;
    max: number;
  };
  regions: RegionRow[];
};

export type Transaction = {
  id?: string;
  sggCd?: string;
  aptName: string;
  dealAmount: number;
  deposit: number;
  monthlyRent: number;
  category?: string;
  area: number;
  floor: number;
  buildYear: number;
  umdNm: string;
  jibun: string;
  dealDate: string;
  cdealType: string;
  isHigh?: boolean;
  // 오늘의 실거래 게임화
  rise?: number | null; // 직전 거래가 대비 상승률(%)
  prevMax?: number;
  prevPrice?: number; // 직전 거래가 (이번 달 이전 마지막 거래)
  aptMax?: number; // 이 단지 전 기간 최고가
  prevDate?: string | null; // 직전 거래일
  isFirst?: boolean; // 이력 없는 첫 거래
  trend?: number[]; // 최근 6개월 월평균 시계열 (스파크라인)
};

export type TrendPoint = {
  month: string;
  count: number;
  avg: number;
  max: number;
  min: number;
};

export async function fetchOverview(
  yyyymm: string,
  scope: string,
  dataset = "aptTrade"
): Promise<OverviewResponse> {
  const e = await cachedGet(
    `${API_BASE}/api/overview?dataset=${dataset}&scope=${scope}&yyyymm=${yyyymm}`,
    30 * 1000 // 수집 진행 반영 위해 짧게
  );
  if (!e.ok) throw new Error((e.data as { error?: string }).error || "overview 실패");
  return e.data as OverviewResponse;
}

export async function fetchTransactions(
  region: string,
  yyyymm: string,
  dataset = "aptTrade"
): Promise<{ items: Transaction[]; source: string; filling: boolean }> {
  const e = await cachedGet(
    `${API_BASE}/api/transactions?dataset=${dataset}&region=${region}&yyyymm=${yyyymm}`,
    5 * 60 * 1000,
    // 수집 중 응답은 캐시하지 않음 (폴링이 빈 결과를 재사용하지 않도록)
    (d, ok) => ok && !(d as { filling?: boolean }).filling
  );
  const data = e.data as {
    error?: string;
    items?: Transaction[];
    source?: string;
    filling?: boolean;
  };
  if (!e.ok) throw new Error(data.error || "조회 실패");
  return { items: data.items ?? [], source: data.source ?? "", filling: !!data.filling };
}

// 오늘의 실거래: 계약일 최신순 거래. date(YYYY-MM-DD) 주면 그 날짜만.
export async function fetchRecent(
  yyyymm: string,
  scope = "all",
  dataset = "aptTrade",
  limit = 120,
  date?: string
): Promise<{ latest: string; deals: Transaction[] }> {
  const dateParam = date ? `&date=${date}` : "";
  const e = await cachedGet(
    `${API_BASE}/api/recent?dataset=${dataset}&scope=${scope}&yyyymm=${yyyymm}&limit=${limit}${dateParam}`,
    60 * 1000
  );
  const d = e.data as { latest?: string; deals?: Transaction[] };
  if (!e.ok) return { latest: "", deals: [] };
  return { latest: d.latest ?? "", deals: d.deals ?? [] };
}

export type AptMapItem = {
  apt: string;
  umd: string;
  count: number;
  avg: number;
  max: number;
  lat: number;
  lng: number;
};

export async function fetchAptMap(
  region: string,
  yyyymm: string,
  dataset = "aptTrade"
): Promise<AptMapItem[]> {
  const e = await cachedGet(
    `${API_BASE}/api/aptmap?dataset=${dataset}&region=${region}&yyyymm=${yyyymm}&limit=500`
  );
  return e.ok ? ((e.data as { items?: AptMapItem[] }).items ?? []) : [];
}

export type ComplexHit = {
  kaptCode: string;
  kaptName: string;
  sggCd: string;
  sido: string;
  sigungu: string;
  dong: string;
};

export async function searchComplexCatalog(q: string): Promise<ComplexHit[]> {
  // 적재된 거래 데이터의 단지명 검색
  const e = await cachedGet(
    `${API_BASE}/api/aptsearch?dataset=aptTrade&q=${encodeURIComponent(q)}`
  );
  return e.ok ? ((e.data as { items?: ComplexHit[] }).items ?? []) : [];
}

export type NearbyHit = {
  name: string;
  distance: number;
  walkMin: number;
  lat: number;
  lng: number;
} | null;
export type Nearby = {
  subway: NearbyHit;
  hubs: { name: string; distance: number; carMin: number }[];
  facilities: { key: string; label: string; hit: NearbyHit }[];
};

export async function fetchNearby(lat: number, lng: number): Promise<Nearby | null> {
  const e = await cachedGet(`${API_BASE}/api/nearby?lat=${lat}&lng=${lng}`);
  return e.ok ? (e.data as Nearby) : null;
}

export async function fetchCoord(
  region: string,
  umd: string,
  jibun: string,
  apt: string
): Promise<{ lat: number; lng: number } | null> {
  const p = new URLSearchParams({ region, umd, jibun, apt });
  const e = await cachedGet(`${API_BASE}/api/coord?${p.toString()}`);
  const d = e.data as { lat?: number; lng?: number };
  return e.ok && typeof d.lat === "number" ? (d as { lat: number; lng: number }) : null;
}

// 단지 대지 경계 폴리곤 (VWorld 지적도). rings: 외곽 링들, 각 점은 [lng, lat].
export type Parcel = { jibun: string; addr: string; rings: [number, number][][] };

export async function fetchParcel(lat: number, lng: number): Promise<Parcel | null> {
  const e = await cachedGet(
    `${API_BASE}/api/parcel?lat=${lat}&lng=${lng}`,
    5 * 60 * 1000,
    // 빈(폴리곤 없음) 응답은 캐시하지 않음 → 일시적 미수집/키 미설정 시 자가 치유
    (d, ok) => ok && !!(d as Parcel).rings?.length
  );
  if (!e.ok) return null;
  const d = e.data as Parcel;
  return d.rings && d.rings.length > 0 ? d : null;
}

export async function fetchComplexDeals(
  region: string,
  apt: string,
  from: string,
  to: string,
  dataset = "aptTrade"
): Promise<Transaction[]> {
  const e = await cachedGet(
    `${API_BASE}/api/complex?dataset=${dataset}&region=${region}&apt=${encodeURIComponent(
      apt
    )}&from=${from}&to=${to}`
  );
  const data = e.data as { error?: string; deals?: Transaction[] };
  if (!e.ok) throw new Error(data.error || "단지 조회 실패");
  return data.deals ?? [];
}

export async function fetchTrend(
  region: string,
  from: string,
  to: string,
  dataset = "aptTrade"
): Promise<TrendPoint[]> {
  const e = await cachedGet(
    `${API_BASE}/api/transactions/range?dataset=${dataset}&region=${region}&from=${from}&to=${to}`
  );
  const data = e.data as { error?: string; trend?: TrendPoint[] };
  if (!e.ok) throw new Error(data.error || "추이 실패");
  return data.trend ?? [];
}

export type Statistics = {
  yyyymm: string;
  scope: string;
  coverage: { loaded: number; total: number };
  summary: {
    count: number;
    avg: number;
    median: number;
    p25: number;
    p75: number;
    p90: number;
    max: number;
    min: number;
    stdev: number;
    perArea: number;
  } | null;
  byAreaBand: { band: string; count: number; avg: number }[];
  byPrice: { label: string; count: number }[];
  byDecade: { decade: string; count: number; avg: number }[];
  byRegion: { sggCd: string; name: string; sido: string; count: number; avg: number }[];
};

export async function fetchStatistics(
  yyyymm: string,
  scope: string,
  dataset = "aptTrade"
): Promise<Statistics> {
  const e = await cachedGet(
    `${API_BASE}/api/statistics?dataset=${dataset}&scope=${scope}&yyyymm=${yyyymm}`
  );
  if (!e.ok) throw new Error((e.data as { error?: string }).error || "통계 실패");
  return e.data as Statistics;
}

// YYYYMM 유틸
export function ymdOf(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(yyyymm: string, delta: number): string {
  let y = Number(yyyymm.slice(0, 4));
  let m = Number(yyyymm.slice(4, 6)) + delta;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}${String(m).padStart(2, "0")}`;
}
