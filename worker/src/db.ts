import type { Env } from "./env";
import type { Transaction, Complex } from "./molit";
import { scopeSqlFilter } from "./regions";

// D1 batch 한 번에 넣을 바인딩 수 제한 회피용 청크
const CHUNK = 40;

export async function upsertTransactions(
  env: Env,
  rows: Transaction[]
): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO transactions
      (id, dataset, category, sgg_cd, deal_ymd, deal_date, umd_nm, jibun,
       apt_name, apt_dong, deal_amount, deposit, monthly_rent, area, floor,
       build_year, dealing_gbn, buyer_gbn, sler_gbn, rgst_date, agent_sgg,
       cdeal_type, cdeal_day, extra, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       rgst_date=excluded.rgst_date,
       cdeal_type=excluded.cdeal_type,
       cdeal_day=excluded.cdeal_day,
       extra=excluded.extra`
  );

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r) =>
      stmt.bind(
        r.id, r.dataset, r.category, r.sggCd, r.dealYmd, r.dealDate, r.umdNm,
        r.jibun, r.aptName, r.aptDong, r.dealAmount, r.deposit, r.monthlyRent,
        r.area, r.floor, r.buildYear, r.dealingGbn, r.buyerGbn, r.slerGbn,
        r.rgstDate, r.agentSgg, r.cdealType, r.cdealDay,
        JSON.stringify(r.extra ?? {}), now
      )
    );
    await env.DB.batch(batch);
  }
}

export async function upsertComplexes(
  env: Env,
  rows: Complex[]
): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO complexes
      (kapt_code, kapt_name, bjd_code, sgg_cd, sido, sigungu, dong, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(kapt_code) DO UPDATE SET
       kapt_name=excluded.kapt_name, bjd_code=excluded.bjd_code,
       sgg_cd=excluded.sgg_cd, updated_at=excluded.updated_at`
  );
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((c) =>
      stmt.bind(c.kaptCode, c.kaptName, c.bjdCode, c.sggCd, c.sido, c.sigungu, c.dong, now)
    );
    await env.DB.batch(batch);
  }
}

const logKey = (dataset: string, sggCd: string, dealYmd: string) =>
  `${dataset}:${sggCd}:${dealYmd}`;

export async function logIngest(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string,
  count: number,
  status: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ingest_log (key, dataset, sgg_cd, deal_ymd, count, status, ingested_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET count=excluded.count,
       status=excluded.status, ingested_at=excluded.ingested_at`
  )
    .bind(logKey(dataset, sggCd, dealYmd), dataset, sggCd, dealYmd, count, status, Date.now())
    .run();
}

export async function isIngested(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string
): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT status FROM ingest_log WHERE key=?`)
    .bind(logKey(dataset, sggCd, dealYmd))
    .first<{ status: string }>();
  return !!row && row.status !== "error";
}

export async function queryMonth(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string
): Promise<Transaction[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM transactions
     WHERE dataset=? AND sgg_cd=? AND deal_ymd=? ORDER BY deal_date DESC`
  )
    .bind(dataset, sggCd, dealYmd)
    .all();
  return (results as unknown[]).map(rowToTx);
}

// 최근 거래(계약일 최신순) — '오늘의 실거래' 용. codes=null 이면 전국.
// exactDate(YYYY-MM-DD) 주면 그 날짜 거래만.
export async function recentDeals(
  env: Env,
  dataset: string,
  dealYmd: string,
  codes: string[] | null,
  limit: number,
  exactDate?: string
): Promise<Transaction[]> {
  const amt = "(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)";
  let sql = `SELECT * FROM transactions WHERE dataset=? AND deal_ymd=?`;
  const binds: unknown[] = [dataset, dealYmd];
  if (exactDate) {
    sql += ` AND deal_date=?`;
    binds.push(exactDate);
  }
  if (codes && codes.length > 0) {
    sql += ` AND sgg_cd IN (${codes.map(() => "?").join(",")})`;
    binds.push(...codes);
  }
  sql += ` ORDER BY deal_date DESC, ${amt} DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return (results as unknown[]).map(rowToTx);
}

// 해당 월·스코프의 가장 최근 계약일(YYYY-MM-DD). 결과 없으면 null.
// recent 가 빈 날(오늘=신고지연)일 때 "최신 실거래일" 점프 타깃을 같은 응답에 실어
// SSR 의 별도 limit=1 프로브(직렬 워커 왕복)를 제거하기 위함.
export async function latestDealDateInMonth(
  env: Env,
  dataset: string,
  dealYmd: string,
  codes: string[] | null
): Promise<string | null> {
  let sql = `SELECT MAX(deal_date) AS d FROM transactions WHERE dataset=? AND deal_ymd=?`;
  const binds: unknown[] = [dataset, dealYmd];
  if (codes && codes.length > 0) {
    sql += ` AND sgg_cd IN (${codes.map(() => "?").join(",")})`;
    binds.push(...codes);
  }
  const row = await env.DB.prepare(sql).bind(...binds).first<{ d: string | null }>();
  return row?.d ?? null;
}

// 데이터랩 "많이산단지" — 월·스코프 내 단지별 거래건수 랭킹(GROUP BY apt_name, sgg_cd).
// 거래량 많은 순, 동률이면 최고가 순. 평균/최고가/마지막 거래일도 함께.
export type TradedComplex = {
  aptName: string;
  sggCd: string;
  umdNm: string | null;
  count: number;
  avgAmount: number; // 만원
  maxAmount: number; // 만원
  lastDate: string;
};
export async function tradedComplexes(
  env: Env,
  dataset: string,
  dealYmd: string,
  codes: string[] | null,
  limit: number,
): Promise<TradedComplex[]> {
  const amt = "(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)";
  let sql =
    `SELECT apt_name, sgg_cd, MAX(umd_nm) AS umd_nm, COUNT(*) AS cnt, ` +
    `ROUND(AVG(${amt})) AS avg_amt, MAX(${amt}) AS max_amt, MAX(deal_date) AS last_date ` +
    `FROM transactions WHERE dataset=? AND deal_ymd=?`;
  const binds: unknown[] = [dataset, dealYmd];
  if (codes && codes.length > 0) {
    sql += ` AND sgg_cd IN (${codes.map(() => "?").join(",")})`;
    binds.push(...codes);
  }
  sql += ` GROUP BY apt_name, sgg_cd ORDER BY cnt DESC, max_amt DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return (results as Record<string, unknown>[]).map((r) => ({
    aptName: String(r.apt_name ?? ""),
    sggCd: String(r.sgg_cd ?? ""),
    umdNm: (r.umd_nm as string | null) ?? null,
    count: Number(r.cnt ?? 0),
    avgAmount: Number(r.avg_amt ?? 0),
    maxAmount: Number(r.max_amt ?? 0),
    lastDate: String(r.last_date ?? ""),
  }));
}

// 단지별 직전(이번 달 이전) 최고가 + 마지막 거래일 — 오늘의 실거래 게임화용.
// keys: "sgg_cd|apt_name" 형태. 결과 Map 동일 키.
// 5자리 숫자 시군구 코드만 골라 SQL IN 리터럴로 생성(바인드 변수 절약·인젝션 안전).
function sggList5(sggCds?: string[]): string {
  if (!sggCds || sggCds.length === 0) return "";
  const safe = sggCds.filter((c) => /^\d{5}$/.test(c));
  return safe.length > 0 ? safe.map((c) => `'${c}'`).join(",") : "";
}

export async function aptPriorStats(
  env: Env,
  dataset: string,
  beforeYmd: string,
  aptNames: string[],
  sggCds?: string[]
): Promise<Map<string, { max: number; lastDate: string }>> {
  const out = new Map<string, { max: number; lastDate: string }>();
  if (aptNames.length === 0) return out;
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  // sgg_cd 까지 좁히면 흔한 단지명(자이/푸르지오 등)의 전국 스캔을 차단 → 스캔량 급감.
  // sgg는 검증된 5자리 숫자라 리터럴 인라인(바인드 제외) → D1 변수 100개 한도 회피.
  const sggIn = sggList5(sggCds);
  const sggFilter = sggIn ? ` AND sgg_cd IN (${sggIn})` : "";
  // D1 바인드 변수 한도(약 100개) 회피: 청크 분할. 청크는 병렬 조회(교차리전 왕복 누적 방지)
  const chunks: string[][] = [];
  for (let i = 0; i < aptNames.length; i += 80) chunks.push(aptNames.slice(i, i + 80));
  const parts = await Promise.all(
    chunks.map((chunk) => {
      const ph = chunk.map(() => "?").join(",");
      return env.DB.prepare(
        `SELECT sgg_cd, apt_name, MAX(${amt}) AS mx, MAX(deal_date) AS lastd
         FROM transactions
         WHERE dataset=? AND deal_ymd < ? AND apt_name IN (${ph})${sggFilter}
         GROUP BY sgg_cd, apt_name`
      ).bind(dataset, beforeYmd, ...chunk).all();
    })
  );
  for (const { results } of parts) {
    for (const r of results as { sgg_cd: string; apt_name: string; mx: number; lastd: string }[]) {
      out.set(`${r.sgg_cd}|${r.apt_name}`, { max: Number(r.mx) || 0, lastDate: String(r.lastd ?? "") });
    }
  }
  return out;
}

// 한 시군구 거래 카드용: "같은 평형(전용면적)" 기준 직전 거래가/거래일 + 동평형 최고가.
// 평형밴드 = ROUND(area) (㎡ 반올림). key = `apt_name|band`.
// beforeYmd(이번 달) 이전의 마지막 동평형 거래가와, 전 기간 동평형 최고가를 반환.
export const areaBand = (area: number) => Math.round(area || 0);

export async function aptDealContext(
  env: Env,
  dataset: string,
  sggCd: string,
  beforeYmd: string,
  aptNames: string[]
): Promise<Map<string, { prevPrice: number; prevDate: string; aptMax: number }>> {
  const out = new Map<string, { prevPrice: number; prevDate: string; aptMax: number }>();
  if (aptNames.length === 0) return out;
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  const band = `CAST(ROUND(area) AS INTEGER)`;
  for (let i = 0; i < aptNames.length; i += 80) {
    const chunk = aptNames.slice(i, i + 80);
    const ph = chunk.map(() => "?").join(",");
    // A) 직전 동평형 거래: deal_ymd < 이번달 중 가장 최근 거래의 가격(MAX(deal_date) 행의 bare 값)
    // B) 동평형 최고가: 전 기간 MAX(amt)
    const [a, b] = await Promise.all([
      env.DB.prepare(
        `SELECT apt_name, ${band} AS band, MAX(deal_date) AS lastd, ${amt} AS lastprice
         FROM transactions
         WHERE dataset=? AND sgg_cd=? AND deal_ymd<? AND apt_name IN (${ph})
         GROUP BY apt_name, band`
      ).bind(dataset, sggCd, beforeYmd, ...chunk).all(),
      env.DB.prepare(
        `SELECT apt_name, ${band} AS band, MAX(${amt}) AS allmax
         FROM transactions
         WHERE dataset=? AND sgg_cd=? AND apt_name IN (${ph})
         GROUP BY apt_name, band`
      ).bind(dataset, sggCd, ...chunk).all(),
    ]);
    for (const r of a.results as { apt_name: string; band: number; lastd: string; lastprice: number }[]) {
      out.set(`${r.apt_name}|${r.band}`, { prevPrice: Number(r.lastprice) || 0, prevDate: String(r.lastd ?? ""), aptMax: 0 });
    }
    for (const r of b.results as { apt_name: string; band: number; allmax: number }[]) {
      const k = `${r.apt_name}|${r.band}`;
      const e = out.get(k) ?? { prevPrice: 0, prevDate: "", aptMax: 0 };
      e.aptMax = Number(r.allmax) || 0;
      out.set(k, e);
    }
  }
  return out;
}

// 단지별 월평균 시계열 (오늘의 실거래 카드 스파크라인용). key="sgg_cd|apt_name" → {ymd: avg}
export async function aptMonthlySeries(
  env: Env,
  dataset: string,
  fromYmd: string,
  toYmd: string,
  aptNames: string[],
  sggCds?: string[]
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (aptNames.length === 0) return out;
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  const sggIn = sggList5(sggCds);
  const sggFilter = sggIn ? ` AND sgg_cd IN (${sggIn})` : "";
  // 청크 병렬 조회 (순차 await → 교차리전 왕복 누적 제거)
  const chunks: string[][] = [];
  for (let i = 0; i < aptNames.length; i += 80) chunks.push(aptNames.slice(i, i + 80));
  const parts = await Promise.all(
    chunks.map((chunk) => {
      const ph = chunk.map(() => "?").join(",");
      return env.DB.prepare(
        `SELECT sgg_cd, apt_name, deal_ymd, ROUND(AVG(${amt})) AS a
         FROM transactions
         WHERE dataset=? AND deal_ymd BETWEEN ? AND ? AND apt_name IN (${ph})${sggFilter}
         GROUP BY sgg_cd, apt_name, deal_ymd`
      ).bind(dataset, fromYmd, toYmd, ...chunk).all();
    })
  );
  for (const { results } of parts) {
    for (const r of results as { sgg_cd: string; apt_name: string; deal_ymd: string; a: number }[]) {
      const k = `${r.sgg_cd}|${r.apt_name}`;
      if (!out.has(k)) out.set(k, new Map());
      out.get(k)!.set(String(r.deal_ymd), Number(r.a) || 0);
    }
  }
  return out;
}

// 직전월까지의 단지별 최고가 (신고가 판정용)
export async function priorMaxByApt(
  env: Env,
  dataset: string,
  sggCd: string,
  beforeYmd: string
): Promise<Map<string, number>> {
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  const { results } = await env.DB.prepare(
    `SELECT apt_name AS apt, MAX(${amt}) AS mx
     FROM transactions
     WHERE dataset=? AND sgg_cd=? AND deal_ymd < ?
     GROUP BY apt_name`
  )
    .bind(dataset, sggCd, beforeYmd)
    .all();
  const m = new Map<string, number>();
  for (const r of results as { apt: string; mx: number }[]) m.set(r.apt, r.mx);
  return m;
}

// 단지 거래 이력 (한 시군구 내 같은 단지명, 기간 범위)
export async function complexDeals(
  env: Env,
  dataset: string,
  sggCd: string,
  apt: string,
  from: string,
  to: string
): Promise<Transaction[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM transactions
     WHERE dataset=? AND sgg_cd=? AND apt_name=? AND deal_ymd BETWEEN ? AND ?
     ORDER BY deal_date ASC`
  )
    .bind(dataset, sggCd, apt, from, to)
    .all();
  return (results as unknown[]).map(rowToTx);
}

// 다월 추이: 월별 건수/평균/최고/최저 (매매=거래금액, 전월세=보증금 기준)
export async function monthlyTrend(
  env: Env,
  dataset: string,
  sggCd: string,
  from: string,
  to: string,
  aptName?: string,
  rentFilter = ""
): Promise<
  { month: string; count: number; avg: number; max: number; min: number }[]
> {
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  let sql =
    `SELECT deal_ymd AS month, COUNT(*) AS count,
       CAST(AVG(${amt}) AS INTEGER) AS avg,
       MAX(${amt}) AS max, MIN(${amt}) AS min
     FROM transactions
     WHERE dataset=? AND sgg_cd=? AND deal_ymd BETWEEN ? AND ?${rentFilter}`;
  const binds: unknown[] = [dataset, sggCd, from, to];
  if (aptName) {
    sql += ` AND apt_name LIKE ?`;
    binds.push(`%${aptName}%`);
  }
  sql += ` GROUP BY deal_ymd ORDER BY deal_ymd ASC`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results as {
    month: string; count: number; avg: number; max: number; min: number;
  }[];
}

// 대시보드용: 여러 시군구의 한 달 집계를 한 번에
export type RegionAgg = {
  sggCd: string;
  count: number;
  avg: number;
  avg84: number; // 전용 80~86㎡ 대표면적 평균가
  max: number;
  min: number;
};

// 한 달치 거래 rows(특정 dataset·sgg·ymd 전체)에서 집계행 1건 계산.
// overviewByRegion SQL과 동일 규칙: amt = deal_amount>0 ? deal_amount : deposit.
export function aggregateMonth(rows: Transaction[]): Omit<RegionAgg, "sggCd"> {
  if (rows.length === 0) return { count: 0, avg: 0, avg84: 0, max: 0, min: 0 };
  let sum = 0, max = 0, min = Infinity, cnt84 = 0, sum84 = 0;
  for (const r of rows) {
    const amt = r.dealAmount > 0 ? r.dealAmount : r.deposit;
    sum += amt;
    if (amt > max) max = amt;
    if (amt < min) min = amt;
    if (r.area >= 80 && r.area <= 86) { cnt84++; sum84 += amt; }
  }
  return {
    count: rows.length,
    avg: Math.trunc(sum / rows.length),      // CAST(AVG AS INTEGER)와 동일(절삭)
    avg84: cnt84 > 0 ? Math.trunc(sum84 / cnt84) : 0,
    max,
    min: min === Infinity ? 0 : min,
  };
}

// 적재 직후 호출: 해당 (dataset, sgg, ymd) 집계행을 rows로부터 재계산해 교체.
export async function upsertRegionAgg(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string,
  rows: Transaction[]
): Promise<void> {
  const a = aggregateMonth(rows);
  await env.DB.prepare(
    `INSERT INTO region_month_agg (dataset, deal_ymd, sgg_cd, count, avg, avg84, max, min)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(dataset, deal_ymd, sgg_cd) DO UPDATE SET
       count=excluded.count, avg=excluded.avg, avg84=excluded.avg84,
       max=excluded.max, min=excluded.min`
  ).bind(dataset, dealYmd, sggCd, a.count, a.avg, a.avg84, a.max, a.min).run();
}

// (dataset, deal_ymd) 의 region_month_agg 를 transactions 원본에서 전 지역 한 번에 재구축.
// 과거 적재분이 agg 누락된 경우(ensureMonth d1분기가 agg 미갱신했던 버그) 일괄 복구용.
// amt/avg84 정의는 aggregateMonth 와 동일(amt = deal_amount>0 ? deal_amount : deposit, 84㎡=80~86).
export async function rebuildAgg(env: Env, dataset: string, dealYmd: string): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO region_month_agg (dataset, deal_ymd, sgg_cd, count, avg, avg84, max, min)
     SELECT dataset, deal_ymd, sgg_cd,
       COUNT(*),
       CAST(AVG(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END) AS INTEGER),
       CAST(COALESCE(AVG(CASE WHEN area>=80 AND area<=86 THEN (CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END) END),0) AS INTEGER),
       MAX(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END),
       MIN(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)
     FROM transactions WHERE dataset=? AND deal_ymd=? GROUP BY dataset, deal_ymd, sgg_cd
     ON CONFLICT(dataset, deal_ymd, sgg_cd) DO UPDATE SET
       count=excluded.count, avg=excluded.avg, avg84=excluded.avg84, max=excluded.max, min=excluded.min`
  ).bind(dataset, dealYmd).run();
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM region_month_agg WHERE dataset=? AND deal_ymd=?`
  ).bind(dataset, dealYmd).all();
  return Number((results[0] as { n?: number })?.n ?? 0);
}

// 사전집계 테이블에서 (dataset, deal_ymd)의 지역별 집계를 즉시 룩업.
// 기존 raw GROUP BY(수십만 행)를 PK prefix 스캔(수백 행)으로 대체.
// rentFilter 인자는 호출부에서 사용하지 않아(항상 "") 시그니처 호환용으로만 유지.
export async function overviewByRegion(
  env: Env,
  dataset: string,
  dealYmd: string,
  sggList: string[],
  _rentFilter = ""
): Promise<RegionAgg[]> {
  if (sggList.length === 0) return [];
  const { results } = await env.DB.prepare(
    `SELECT sgg_cd AS sggCd, count, avg, avg84, max, min
       FROM region_month_agg WHERE dataset=? AND deal_ymd=?`
  ).bind(dataset, dealYmd).all();
  const set = new Set(sggList);
  return (results as RegionAgg[]).filter((r) => set.has(r.sggCd));
}

// 지역별 월별 평균가 추이 — 사전집계 테이블 범위 스캔. 카드 스파크라인용.
export async function regionTrends(
  env: Env,
  dataset: string,
  sggList: string[],
  from: string,
  to: string,
  _rentFilter = ""
): Promise<Record<string, { month: string; avg: number }[]>> {
  if (sggList.length === 0) return {};
  const { results } = await env.DB.prepare(
    `SELECT sgg_cd AS sggCd, deal_ymd AS month, avg
       FROM region_month_agg WHERE dataset=? AND deal_ymd BETWEEN ? AND ?
       ORDER BY deal_ymd ASC`
  ).bind(dataset, from, to).all();
  const set = new Set(sggList);
  const out: Record<string, { month: string; avg: number }[]> = {};
  for (const r of results as { sggCd: string; month: string; avg: number }[]) {
    if (!set.has(r.sggCd)) continue;
    (out[r.sggCd] ??= []).push({ month: r.month, avg: r.avg });
  }
  return out;
}

// 한 시군구에서 이미 적재된 deal_ymd 집합 (월별 isIngested 반복 조회 대체)
export async function ingestedMonths(
  env: Env,
  dataset: string,
  sggCd: string
): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `SELECT deal_ymd FROM ingest_log WHERE dataset=? AND sgg_cd=? AND status!='error'`
  )
    .bind(dataset, sggCd)
    .all();
  return new Set((results as { deal_ymd: string }[]).map((r) => r.deal_ymd));
}

// 이미 적재된 (dataset, deal_ymd) 의 시군구코드 집합
export async function ingestedRegions(
  env: Env,
  dataset: string,
  dealYmd: string
): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `SELECT sgg_cd FROM ingest_log WHERE dataset=? AND deal_ymd=? AND status!='error'`
  )
    .bind(dataset, dealYmd)
    .all();
  return new Set((results as { sgg_cd: string }[]).map((r) => r.sgg_cd));
}

// 단지별 집계 (지도 단지 레이어용). 대표 동/지번 포함.
export type AptAgg = {
  apt: string;
  umd: string;
  jibun: string;
  count: number;
  avg: number;
  max: number;
};

export async function aptAggregates(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string,
  rentFilter = ""
): Promise<AptAgg[]> {
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  // 단일 MAX(amt) → bare umd_nm/jibun 은 최고가 행 값 (SQLite 동작)
  const sql =
    `SELECT apt_name AS apt, umd_nm AS umd, jibun AS jibun,
       COUNT(*) AS count, CAST(AVG(${amt}) AS INTEGER) AS avg, MAX(${amt}) AS max
     FROM transactions
     WHERE dataset=? AND sgg_cd=? AND deal_ymd=? AND ${amt} > 0${rentFilter}
     GROUP BY apt_name ORDER BY max DESC`;
  const { results } = await env.DB.prepare(sql).bind(dataset, sggCd, dealYmd).all();
  return results as AptAgg[];
}

// 지도용: 한 시군구의 [from, to] 기간(예: 최근 12개월) 단지별 집계.
// 단일 월(거래 몇 건)이 아니라 지역 전체 단지를 폭넓게 보여주기 위함.
// max = 기간 내 최고가(원 안 라벨용), bare umd/jibun = 최고가 행 값(지오코딩용).
export async function aptAggregatesRange(
  env: Env,
  dataset: string,
  sggCd: string,
  fromYmd: string,
  toYmd: string,
  rentFilter = ""
): Promise<AptAgg[]> {
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  const sql =
    `SELECT apt_name AS apt, umd_nm AS umd, jibun AS jibun,
       COUNT(*) AS count, CAST(AVG(${amt}) AS INTEGER) AS avg, MAX(${amt}) AS max
     FROM transactions
     WHERE dataset=? AND sgg_cd=? AND deal_ymd BETWEEN ? AND ? AND ${amt} > 0${rentFilter}
     GROUP BY apt_name ORDER BY max DESC`;
  const { results } = await env.DB.prepare(sql).bind(dataset, sggCd, fromYmd, toYmd).all();
  return results as AptAgg[];
}

// 한 시군구의 좌표 수집 대상: distinct (umd, jibun) 위치. 좌표키 = sgg|umd|jibun 과 정합.
// apt 는 키워드 폴백용 대표 단지명. 데이터셋 무관(물리적 위치) → dataset 필터 없음.
export async function distinctComplexes(
  env: Env,
  sggCd: string
): Promise<{ umd: string; jibun: string; apt: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT umd_nm AS umd, jibun AS jibun, MIN(apt_name) AS apt
       FROM transactions
       WHERE sgg_cd=? AND jibun IS NOT NULL AND jibun<>''
       GROUP BY umd_nm, jibun`
  ).bind(sggCd).all();
  return results as { umd: string; jibun: string; apt: string }[];
}

export async function getCoords(
  env: Env,
  keys: string[]
): Promise<Map<string, { lat: number; lng: number }>> {
  const out = new Map<string, { lat: number; lng: number }>();
  if (keys.length === 0) return out;
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const ph = chunk.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT k, lat, lng FROM apt_coords WHERE k IN (${ph})`
    )
      .bind(...chunk)
      .all();
    for (const r of results as { k: string; lat: number; lng: number }[]) {
      out.set(r.k, { lat: r.lat, lng: r.lng });
    }
  }
  return out;
}

export async function putCoords(
  env: Env,
  rows: { k: string; apt: string; lat: number; lng: number }[]
): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO apt_coords (k, apt, lat, lng, ts) VALUES (?,?,?,?,?)
     ON CONFLICT(k) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, ts=excluded.ts`
  );
  await env.DB.batch(rows.map((r) => stmt.bind(r.k, r.apt, r.lat, r.lng, now)));
}

// SQL 집계 통계 (6만 행 끌어오지 않고 DB에서 직접 계산 → 콜드도 빠름)
const AMT = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;

export async function computeStatsSql(
  env: Env,
  dataset: string,
  yyyymm: string,
  scope: string,
  names: Record<string, { sido: string; name: string }>,
  rentFilter = ""
) {
  // scope: all/seoul/시도명 → SQL 필터 (IN 절 없이 → 바인드 제한 회피)
  const where = `dataset=? AND deal_ymd=? AND ${AMT}>0${scopeSqlFilter(scope)}${rentFilter}`;
  const b = [dataset, yyyymm];

  // 면적대별 / 가격대 / 건축연대 / 지역별 — 4쿼리를 batch로 한 번에 실행
  const areaSql = `SELECT
    CASE WHEN area<60 THEN '소형 (~60㎡)' WHEN area<85 THEN '중형 (60~85㎡)'
         WHEN area<135 THEN '중대형 (85~135㎡)' ELSE '대형 (135㎡~)' END band,
    COUNT(*) count, CAST(AVG(${AMT}) AS INT) avg
    FROM transactions WHERE ${where} GROUP BY band`;
  const priceSql = `SELECT CASE
    WHEN ${AMT}<30000 THEN '~3억' WHEN ${AMT}<50000 THEN '3~5억'
    WHEN ${AMT}<70000 THEN '5~7억' WHEN ${AMT}<100000 THEN '7~10억'
    WHEN ${AMT}<150000 THEN '10~15억' WHEN ${AMT}<200000 THEN '15~20억'
    WHEN ${AMT}<300000 THEN '20~30억' WHEN ${AMT}<500000 THEN '30~50억'
    ELSE '50억~' END label, COUNT(*) count
    FROM transactions WHERE ${where} GROUP BY label`;
  const decSql = `SELECT (CAST(build_year/10 AS INT)*10)||'년대' decade, COUNT(*) count, CAST(AVG(${AMT}) AS INT) avg
    FROM transactions WHERE ${where} AND build_year>0 GROUP BY decade ORDER BY decade`;
  const regSql = `SELECT sgg_cd sggCd, COUNT(*) count, CAST(AVG(${AMT}) AS INT) avg
    FROM transactions WHERE ${where} GROUP BY sgg_cd ORDER BY avg DESC`;
  const sumSql = `SELECT COUNT(*) n, CAST(AVG(${AMT}) AS INT) avg, MIN(${AMT}) min, MAX(${AMT}) max,
       CAST(AVG(CASE WHEN area>0 THEN ${AMT}*1.0/area END) AS INT) perArea,
       SUM(${AMT}*1.0) s, SUM(${AMT}*1.0*${AMT}) ss
     FROM transactions WHERE ${where}`;
  const sortedSql = `SELECT ${AMT} v FROM transactions WHERE ${where} ORDER BY ${AMT}`;

  // 6쿼리 전부 단일 batch → 교차리전 왕복 1회 (기존 3회에서 단축)
  const [sumRes, sortedRes, areaRes, priceRes, decRes, regRes] = await env.DB.batch([
    env.DB.prepare(sumSql).bind(...b),
    env.DB.prepare(sortedSql).bind(...b),
    env.DB.prepare(areaSql).bind(...b),
    env.DB.prepare(priceSql).bind(...b),
    env.DB.prepare(decSql).bind(...b),
    env.DB.prepare(regSql).bind(...b),
  ]);

  const sum = (sumRes.results as { n: number; avg: number; min: number; max: number; perArea: number; s: number; ss: number }[])[0];
  if (!sum || sum.n === 0) {
    return { summary: null, byAreaBand: [], byPrice: [], byDecade: [], byRegion: [] };
  }
  const n = sum.n;
  const stdev = Math.round(Math.sqrt(Math.max(0, sum.ss / n - (sum.s / n) ** 2)));
  const sorted = (sortedRes.results as { v: number }[]).map((r) => r.v);
  const at = (p: number) => sorted[Math.round(p * (n - 1))] ?? 0;
  const summary = {
    count: n, avg: sum.avg, median: at(0.5), p25: at(0.25), p75: at(0.75), p90: at(0.9),
    max: sum.max, min: sum.min, stdev, perArea: sum.perArea ?? 0,
  };

  const bandOrder = ["소형 (~60㎡)", "중형 (60~85㎡)", "중대형 (85~135㎡)", "대형 (135㎡~)"];
  const areaRows = areaRes.results as { band: string; count: number; avg: number }[];
  const byAreaBand = bandOrder.map((band) =>
    areaRows.find((r) => r.band === band) ?? { band, count: 0, avg: 0 });

  const priceOrder = ["~3억","3~5억","5~7억","7~10억","10~15억","15~20억","20~30억","30~50억","50억~"];
  const priceRows = priceRes.results as { label: string; count: number }[];
  const byPrice = priceOrder.map((label) =>
    priceRows.find((r) => r.label === label) ?? { label, count: 0 });

  const byDecade = decRes.results as { decade: string; count: number; avg: number }[];

  const byRegion = (regRes.results as { sggCd: string; count: number; avg: number }[]).map((r) => ({
    ...r, name: names[r.sggCd]?.name ?? r.sggCd, sido: names[r.sggCd]?.sido ?? "",
  }));

  return { summary, byAreaBand, byPrice, byDecade, byRegion };
}

// 통계용 원자료 (월 × scope 지역). 중앙값/분위수는 Worker(JS)에서 계산.
export type StatRow = {
  amt: number;
  area: number;
  buildYear: number;
  sggCd: string;
};

export async function rawForStats(
  env: Env,
  dataset: string,
  dealYmd: string,
  sggList: string[],
  limit = 60000
): Promise<StatRow[]> {
  if (sggList.length === 0) return [];
  const amt = `(CASE WHEN deal_amount>0 THEN deal_amount ELSE deposit END)`;
  // D1 바인드 변수 100개 제한 → IN 절 없이 조회 후 JS 필터
  const sql =
    `SELECT ${amt} AS amt, area AS area, build_year AS buildYear, sgg_cd AS sggCd
     FROM transactions
     WHERE dataset=? AND deal_ymd=? AND ${amt} > 0
     LIMIT ?`;
  const { results } = await env.DB.prepare(sql).bind(dataset, dealYmd, limit).all();
  const set = new Set(sggList);
  return (results as StatRow[]).filter((r) => set.has(r.sggCd));
}

// 적재된 거래 데이터에서 단지명 검색 (커맨드 팔레트용)
export async function searchAptNames(
  env: Env,
  dataset: string,
  q: string,
  limit = 10
): Promise<{ apt: string; sggCd: string; umd: string; cnt: number }[]> {
  const { results } = await env.DB.prepare(
    `SELECT apt_name AS apt, sgg_cd AS sggCd, umd_nm AS umd, COUNT(*) AS cnt
     FROM transactions WHERE dataset=? AND apt_name LIKE ?
     GROUP BY apt_name, sgg_cd ORDER BY cnt DESC LIMIT ?`
  )
    .bind(dataset, `%${q}%`, limit)
    .all();
  return results as { apt: string; sggCd: string; umd: string; cnt: number }[];
}

export async function searchComplexes(
  env: Env,
  sggCd: string | undefined,
  q: string | undefined,
  limit = 50
): Promise<Complex[]> {
  let sql = `SELECT * FROM complexes WHERE 1=1`;
  const binds: unknown[] = [];
  if (sggCd) {
    sql += ` AND sgg_cd=?`;
    binds.push(sggCd);
  }
  if (q) {
    sql += ` AND kapt_name LIKE ?`;
    binds.push(`%${q}%`);
  }
  sql += ` ORDER BY kapt_name LIMIT ?`;
  binds.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return (results as Record<string, unknown>[]).map((r) => ({
    kaptCode: String(r.kapt_code),
    kaptName: String(r.kapt_name),
    bjdCode: String(r.bjd_code ?? ""),
    sggCd: String(r.sgg_cd ?? ""),
    sido: String(r.sido ?? ""),
    sigungu: String(r.sigungu ?? ""),
    dong: String(r.dong ?? ""),
  }));
}

function rowToTx(r: unknown): Transaction {
  const o = r as Record<string, unknown>;
  // 주의: o.extra(원본 MOLIT 태그)는 응답에 싣지 않는다 — 프론트 미사용, 레코드 크기 ~2배 군살.
  // D1 에는 계속 저장(쓰기경로 유지), 읽기 응답에서만 제외.
  return {
    id: String(o.id),
    dataset: String(o.dataset ?? "aptTrade"),
    category: (String(o.category ?? "trade") as Transaction["category"]),
    sggCd: String(o.sgg_cd),
    dealYmd: String(o.deal_ymd),
    dealDate: String(o.deal_date),
    umdNm: String(o.umd_nm ?? ""),
    jibun: String(o.jibun ?? ""),
    aptName: String(o.apt_name ?? ""),
    aptDong: String(o.apt_dong ?? ""),
    dealAmount: Number(o.deal_amount ?? 0),
    deposit: Number(o.deposit ?? 0),
    monthlyRent: Number(o.monthly_rent ?? 0),
    area: Number(o.area ?? 0),
    floor: Number(o.floor ?? 0),
    buildYear: Number(o.build_year ?? 0),
    dealingGbn: String(o.dealing_gbn ?? ""),
    buyerGbn: String(o.buyer_gbn ?? ""),
    slerGbn: String(o.sler_gbn ?? ""),
    rgstDate: String(o.rgst_date ?? ""),
    agentSgg: String(o.agent_sgg ?? ""),
    cdealType: String(o.cdeal_type ?? ""),
    cdealDay: String(o.cdeal_day ?? ""),
  };
}
