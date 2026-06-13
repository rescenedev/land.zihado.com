import type { StatRow } from "./db";
import type { RegionInfo } from "./regions";

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return Math.round(sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo));
}

const AREA_BANDS = [
  { band: "소형 (~60㎡)", min: 0, max: 60 },
  { band: "중형 (60~85㎡)", min: 60, max: 85 },
  { band: "중대형 (85~135㎡)", min: 85, max: 135 },
  { band: "대형 (135㎡~)", min: 135, max: Infinity },
];

// 만원 단위 가격 버킷
const PRICE_BUCKETS = [
  { label: "~3억", max: 30000 },
  { label: "3~5억", max: 50000 },
  { label: "5~7억", max: 70000 },
  { label: "7~10억", max: 100000 },
  { label: "10~15억", max: 150000 },
  { label: "15~20억", max: 200000 },
  { label: "20~30억", max: 300000 },
  { label: "30~50억", max: 500000 },
  { label: "50억~", max: Infinity },
];

export function computeStatistics(
  rows: StatRow[],
  names: Record<string, RegionInfo>
) {
  const amounts = rows.map((r) => r.amt).filter((v) => v > 0);
  const n = amounts.length;
  if (n === 0) {
    return { summary: null, byAreaBand: [], byPrice: [], byDecade: [], byRegion: [] };
  }
  const sorted = [...amounts].sort((a, b) => a - b);
  const sum = amounts.reduce((s, v) => s + v, 0);
  const avg = Math.round(sum / n);
  const variance = amounts.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
  const stdev = Math.round(Math.sqrt(variance));

  // ㎡당 평균가 (면적>0 인 것만)
  const perAreaVals = rows
    .filter((r) => r.area > 0 && r.amt > 0)
    .map((r) => r.amt / r.area);
  const perArea =
    perAreaVals.length > 0
      ? Math.round(perAreaVals.reduce((s, v) => s + v, 0) / perAreaVals.length)
      : 0;

  const summary = {
    count: n,
    avg,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    max: sorted[n - 1],
    min: sorted[0],
    stdev,
    perArea, // 만원/㎡
  };

  // 면적대별
  const byAreaBand = AREA_BANDS.map((b) => {
    const sub = rows.filter((r) => r.area >= b.min && r.area < b.max && r.amt > 0);
    const c = sub.length;
    const a = c ? Math.round(sub.reduce((s, r) => s + r.amt, 0) / c) : 0;
    return { band: b.band, count: c, avg: a };
  });

  // 가격 분포
  const byPrice = PRICE_BUCKETS.map((b, i) => {
    const lo = i === 0 ? 0 : PRICE_BUCKETS[i - 1].max;
    const c = amounts.filter((v) => v >= lo && v < b.max).length;
    return { label: b.label, count: c };
  });

  // 건축연대별
  const decadeMap = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    if (!r.buildYear || r.amt <= 0) continue;
    const dec = `${Math.floor(r.buildYear / 10) * 10}년대`;
    const e = decadeMap.get(dec) ?? { count: 0, sum: 0 };
    e.count += 1;
    e.sum += r.amt;
    decadeMap.set(dec, e);
  }
  const byDecade = [...decadeMap.entries()]
    .map(([decade, e]) => ({ decade, count: e.count, avg: Math.round(e.sum / e.count) }))
    .sort((a, b) => a.decade.localeCompare(b.decade));

  // 지역별 (시군구)
  const regionMap = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    if (r.amt <= 0) continue;
    const e = regionMap.get(r.sggCd) ?? { count: 0, sum: 0 };
    e.count += 1;
    e.sum += r.amt;
    regionMap.set(r.sggCd, e);
  }
  const byRegion = [...regionMap.entries()]
    .map(([sggCd, e]) => {
      const info = names[sggCd];
      return {
        sggCd,
        name: info?.name ?? sggCd,
        sido: info?.sido ?? "",
        count: e.count,
        avg: Math.round(e.sum / e.count),
      };
    })
    .sort((a, b) => b.avg - a.avg);

  return { summary, byAreaBand, byPrice, byDecade, byRegion };
}
