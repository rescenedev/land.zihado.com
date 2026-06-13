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

// ingest 직후 워커 KV 직접 워밍. 워커(api.zihado.com) 자기 엔드포인트를 호출해 resp:* KV 를 채운다.
// 단지모달은 워커 직접 호출이므로 반드시 워커 KV 를 데워야 HIT(이전엔 Vercel 워밍이라 모달엔 무효였음).
// worker→Vercel→worker 루프 제거. 최근 3개월만(과거 백필 제외).
const WARM_ORIGIN = "https://api.zihado.com";
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
    `${WARM_ORIGIN}/api/transactions?dataset=${dataset}&region=${sggCd}&yyyymm=${dealYmd}`,
    `${WARM_ORIGIN}/api/aptmap?dataset=${dataset}&region=${sggCd}&yyyymm=${dealYmd}&limit=40`,
    `${WARM_ORIGIN}/api/transactions/range?dataset=${dataset}&region=${sggCd}&from=${from}&to=${dealYmd}`,
    `${WARM_ORIGIN}/api/complexes?dataset=${dataset}&region=${sggCd}`,
  ];
  // 갱신된 단지들의 단지 상세 모달도 즉시 워밍(실거래 찍힌 단지) → 워커 KV → 모달 직접호출 HIT
  const apts = [...new Set(rows.map((r) => r.aptName).filter(Boolean))];
  for (const apt of apts)
    urls.push(`${WARM_ORIGIN}/api/complex?dataset=${dataset}&region=${sggCd}&apt=${encodeURIComponent(apt)}&from=${from}&to=${dealYmd}`);
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
    // 단지 상세 모달 워밍: 모달이 누르는 순간 부르는 3종(complex 거래 + coord 좌표 + nearby 주변시설)을
    // 프론트와 동일 경로(land.zihado.com 프록시)로 구워 Vercel CDN + 워커 KV 양 레이어 HIT.
    // coord 는 D1(apt_coords), nearby 는 KV(30일) 캐시 → Kakao 호출은 단지당 1회뿐.
    const ds = job.dataset ?? DEFAULT_DATASET;
    const from = shiftYmd(job.dealYmd, -11);
    // long-tail(단지 수천 개) → 워커 직결로 KV 만 워밍. 프록시로 구우면 Vercel CDN(용량 한계)이
    // 핫 코어를 evict 한다. 프록시 MISS 는 워커 KV HIT(~60-120ms)로 처리.
    const PROXY = "https://api.zihado.com";
    const r = await fetch(
      `${PROXY}/api/complex?dataset=${ds}&region=${job.sggCd}` +
      `&apt=${encodeURIComponent(job.apt)}&from=${from}&to=${job.dealYmd}`
    );
    // 거래에서 대표 지번(umd/jibun)을 뽑아 좌표·주변시설까지 사전 워밍 (모달 흐름과 동일).
    try {
      const body = (await r.json()) as { deals?: { umdNm?: string; jibun?: string }[] };
      const deals = body.deals ?? [];
      const rep = deals.find((d) => d.jibun) ?? deals[0];
      if (rep?.umdNm) {
        const p = new URLSearchParams({ region: job.sggCd, umd: rep.umdNm, jibun: rep.jibun ?? "", apt: job.apt });
        const cr = await fetch(`${PROXY}/api/coord?${p.toString()}`);
        const ll = (await cr.json()) as { lat?: number; lng?: number };
        if (typeof ll.lat === "number" && typeof ll.lng === "number") {
          await fetch(`${PROXY}/api/nearby?lat=${ll.lat}&lng=${ll.lng}`);
        }
      }
    } catch {
      // coord/nearby 워밍 실패는 무시(복원력) — complex 거래는 이미 구워짐.
    }
    return;
  }
  if (job.type === "trades" && job.dealYmd) {
    await ensureMonth(env, job.dataset ?? DEFAULT_DATASET, job.sggCd, job.dealYmd);
  }
}
