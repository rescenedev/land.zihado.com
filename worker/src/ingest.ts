import type { Env, BackfillJob } from "./env";
import { fetchMonth, fetchComplexes, type Transaction } from "./molit";
import { DEFAULT_DATASET } from "./datasets";
import { getMonthKV, putMonthKV } from "./cache";
import { geocode } from "./geocode";
import { REGION_NAMES, shiftYmd, recentMonths } from "./regions";
import {
  upsertTransactions,
  upsertComplexes,
  upsertRegionAgg,
  logIngest,
  queryMonth,
  isIngested,
  distinctComplexes,
  getCoords,
  putCoords,
} from "./db";

/**
 * 한 데이터셋의 한 달치를 보장 적재. 우선순위: KV → D1 → MOLIT.
 */
export async function ensureMonth(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string
): Promise<{ rows: Transaction[]; source: "kv" | "d1" | "molit" }> {
  const kv = await getMonthKV(env, dataset, sggCd, dealYmd);
  if (kv) return { rows: kv, source: "kv" };

  if (await isIngested(env, dataset, sggCd, dealYmd)) {
    const rows = await queryMonth(env, dataset, sggCd, dealYmd);
    await putMonthKV(env, dataset, sggCd, dealYmd, rows);
    return { rows, source: "d1" };
  }

  const rows = await fetchMonth(env.MOLIT_SERVICE_KEY, dataset, sggCd, dealYmd);
  await putMonthKV(env, dataset, sggCd, dealYmd, rows);
  await upsertTransactions(env, rows);
  await upsertRegionAgg(env, dataset, sggCd, dealYmd, rows);
  await logIngest(env, dataset, sggCd, dealYmd, rows.length, rows.length ? "ok" : "empty");
  // 실거래 갱신 시점 워밍: 방금 적재된 지역·월의 사용자 캐시를 바로 데움(주기 cron 보완).
  await warmAfterIngest(dataset, sggCd, dealYmd, rows);
  return { rows, source: "molit" };
}

// 사용자가 닿는 Vercel(ICN) 엣지 캐시를 ingest 직후 데움. 최근 3개월만(과거 백필 제외).
const VERCEL = "https://land.zihado.com";
async function warmAfterIngest(
  dataset: string,
  sggCd: string,
  dealYmd: string,
  rows: Transaction[]
): Promise<void> {
  if (rows.length === 0) return;
  if (!recentMonths(3).includes(dealYmd)) return; // 최근 3개월만
  const from = shiftYmd(dealYmd, -11);
  const urls = [
    `${VERCEL}/api/transactions?dataset=${dataset}&region=${sggCd}&yyyymm=${dealYmd}`,
    `${VERCEL}/api/aptmap?dataset=${dataset}&region=${sggCd}&yyyymm=${dealYmd}&limit=40`,
    `${VERCEL}/api/transactions/range?dataset=${dataset}&region=${sggCd}&from=${from}&to=${dealYmd}`,
    `${VERCEL}/api/complexes?dataset=${dataset}&region=${sggCd}`,
  ];
  // 갱신된 단지들의 단지 상세 모달도 즉시 워밍(실거래 찍힌 단지)
  const apts = [...new Set(rows.map((r) => r.aptName).filter(Boolean))];
  for (const apt of apts)
    urls.push(`${VERCEL}/api/complex?dataset=${dataset}&region=${sggCd}&apt=${encodeURIComponent(apt)}&from=${from}&to=${dealYmd}`);
  await Promise.allSettled(urls.map((u) => fetch(u)));
}

/** 단지목록 적재 */
export async function ensureComplexes(env: Env, sggCd: string): Promise<number> {
  const rows = await fetchComplexes(env.MOLIT_SERVICE_KEY, sggCd);
  await upsertComplexes(env, rows);
  return rows.length;
}

function regionLabelOf(sggCd: string): string {
  const info = REGION_NAMES[sggCd];
  if (!info) return sggCd;
  return `${info.sido === "서울" ? "서울특별시" : info.sido} ${info.name}`;
}

/**
 * 한 시군구의 모든 단지 좌표를 사전 일괄 수집해 apt_coords 에 적재.
 * 지도(/api/aptmap)의 on-demand 지오코딩 병목 제거 → 즉시·완전 표시.
 * 이미 보유한 좌표는 건너뛰므로 멱등/증분.
 */
export async function geocodeRegion(
  env: Env,
  sggCd: string
): Promise<{ total: number; cached: number; geocoded: number; failed: number }> {
  const comps = await distinctComplexes(env, sggCd);
  const keyOf = (a: { umd: string; jibun: string }) => `${sggCd}|${a.umd}|${a.jibun}`;
  const have = await getCoords(env, comps.map(keyOf));
  const missing = comps.filter((a) => !have.has(keyOf(a)));
  const label = regionLabelOf(sggCd);

  const fresh: { k: string; apt: string; lat: number; lng: number }[] = [];
  const CONC = 10;
  for (let i = 0; i < missing.length; i += CONC) {
    const batch = missing.slice(i, i + CONC);
    const res = await Promise.all(
      batch.map((a) =>
        geocode(env.KAKAO_REST_KEY, label, a.umd, a.jibun, a.apt).then((ll) =>
          ll ? { k: keyOf(a), apt: a.apt, lat: ll.lat, lng: ll.lng } : null
        )
      )
    );
    for (const r of res) if (r) fresh.push(r);
  }
  if (fresh.length > 0) await putCoords(env, fresh);
  return {
    total: comps.length,
    cached: comps.length - missing.length,
    geocoded: fresh.length,
    failed: missing.length - fresh.length,
  };
}

/** Queue 소비자: 백필 작업 1건 처리 */
export async function handleJob(env: Env, job: BackfillJob): Promise<void> {
  if (job.type === "complexes") {
    await ensureComplexes(env, job.sggCd);
    return;
  }
  if (job.type === "geocode") {
    await geocodeRegion(env, job.sggCd);
    return;
  }
  if (job.type === "warmcomplex" && job.apt && job.dealYmd) {
    // 단지 상세 모달 KV 워밍: 워커 /api/complex 를 호출해 resp:complex 키를 채운다.
    // (모달은 워커 직접 호출 → KV HIT 시 D1 스캔 회피·서버 ~5ms). 큐로 분산해 subrequest 한도 회피.
    const ds = job.dataset ?? DEFAULT_DATASET;
    const from = shiftYmd(job.dealYmd, -11);
    await fetch(
      `https://api.zihado.com/api/complex?dataset=${ds}&region=${job.sggCd}` +
      `&apt=${encodeURIComponent(job.apt)}&from=${from}&to=${job.dealYmd}`
    );
    return;
  }
  if (job.type === "trades" && job.dealYmd) {
    await ensureMonth(env, job.dataset ?? DEFAULT_DATASET, job.sggCd, job.dealYmd);
  }
}
