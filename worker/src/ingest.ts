import type { Env, BackfillJob } from "./env";
import { fetchMonth, fetchComplexes, type Transaction } from "./molit";
import { DEFAULT_DATASET } from "./datasets";
import { getMonthKV, putMonthKV } from "./cache";
import { geocode } from "./geocode";
import { REGION_NAMES } from "./regions";
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
  return { rows, source: "molit" };
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
  if (job.type === "trades" && job.dealYmd) {
    await ensureMonth(env, job.dataset ?? DEFAULT_DATASET, job.sggCd, job.dealYmd);
  }
}
