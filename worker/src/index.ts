import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, BackfillJob } from "./env";
import { SGG_CODES, recentMonths, scopeCodes, REGION_NAMES, shiftYmd } from "./regions";
import { DATASETS, DEFAULT_DATASET, getDataset, enabledDatasets } from "./datasets";
import { ensureMonth, ensureComplexes, handleJob, geocodeRegion } from "./ingest";
import {
  monthlyTrend,
  searchComplexes,
  overviewByRegion,
  ingestedRegions,
  ingestedMonths,
  computeStatsSql,
  complexDeals,
  aptDealContext,
  areaBand,
  regionTrends,
  aptAggregatesRange,
  getCoords,
  putCoords,
  searchAptNames,
  recentDeals,
  aptPriorStats,
  aptMonthlySeries,
} from "./db";
import { cachedJson } from "./cache";
import { geocode } from "./geocode";
import { findNearby } from "./nearby";
import { fetchParcel } from "./vworld";
import { fetchMonth, SubscriptionError } from "./molit";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// 엣지 캐시(Cache API): colo-로컬 히트는 KV 왕복·연산을 건너뛰고 ~1ms에 응답.
// GET 200 응답을 URL 키로 colo 캐시에 저장. no-store 응답(수집 중 등)은 제외.
// cors 다음에 등록 → HIT/MISS 모두 cors가 바깥에서 CORS 헤더를 매번 부여.
// 실거래가는 하루 1회 갱신 → 신선 윈도우(s-maxage)를 12시간으로. 갱신은 일일 cron 워밍이
// CDN을 새로 채워 반영. SWR 7일이라 만료돼도 stale 즉시 서빙 + 백그라운드 갱신.
// 위치 기반(coord/nearby/parcel)은 불변 → 24시간.
const H12 = 60 * 60 * 12;
const D1 = 60 * 60 * 24;
const EDGE_TTL: Array<[RegExp, number]> = [
  [/\/api\/datasets/, H12],
  [/\/api\/overview/, H12],
  [/\/api\/recent/, H12],
  [/\/api\/statistics/, H12],
  [/\/api\/stats(\?|$)/, H12],
  [/\/api\/transactions\/range/, H12],
  [/\/api\/transactions(\?|$)/, H12],
  [/\/api\/aptmap/, H12],
  [/\/api\/complexes/, H12],
  [/\/api\/complex(\?|$)/, H12],
  [/\/api\/aptsearch/, H12],
  [/\/api\/nearby/, D1],
  [/\/api\/parcel/, D1],
  [/\/api\/coord/, D1],
];
function edgeTtl(url: string): number | null {
  const path = url.slice(url.indexOf("/api/"));
  for (const [re, t] of EDGE_TTL) if (re.test(path)) return t;
  return null;
}

app.use("*", async (c, next) => {
  if (c.req.method !== "GET") return next();
  const ttl = edgeTtl(c.req.url);
  if (ttl === null) return next();
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) {
    c.res = new Response(hit.body, hit);
    c.res.headers.set("x-edge-cache", "HIT");
    return;
  }
  await next();
  const res = c.res;
  const existingCC = res.headers.get("Cache-Control");
  if (res.status === 200 && existingCC !== "no-store") {
    const stored = new Response(res.clone().body, res);
    // 핸들러가 max-age 를 직접 지정했으면 존중(예: 과거 날짜 장기캐시), 아니면 기본 ttl
    const cc = existingCC && existingCC.includes("max-age") ? existingCC : `public, max-age=${ttl}`;
    stored.headers.set("Cache-Control", cc);
    c.executionCtx.waitUntil(cache.put(cacheKey, stored.clone()));
    stored.headers.set("x-edge-cache", "MISS");
    c.res = stored;
  }
});

const RE_SGG = /^\d{5}$/;
const RE_YMD = /^\d{6}$/;

// KV 응답 캐시 TTL: 당월/최근은 짧게(신선도), 과거는 길게
function curYmd(now = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// N일 전 날짜 YYYYMMDD (cron recent 워밍용)
function shiftDays(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function respTtl(yyyymm: string, now = new Date()): number {
  const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return yyyymm >= cur ? 60 * 60 * 25 : 60 * 60 * 24 * 7; // 당월 25시간(일1회 cron 워밍 주기>24h 보장) / 과거 7일
}

// SubscriptionError → 403, 그 외 → 500 으로 일관 처리
app.onError((err, c) => {
  if (err instanceof SubscriptionError) {
    return c.json(
      { error: err.message, hint: "data.go.kr 에서 해당 API 활용신청 후 사용하세요." },
      403
    );
  }
  console.error("unhandled", err);
  return c.json({ error: err.message || "internal error" }, 500);
});

app.get("/", (c) =>
  c.json({
    name: "landman-worker",
    desc: "국토교통부 실거래가 캐시 백엔드 (KV+Cache 우선, D1 부가)",
    datasets: Object.values(DATASETS).map((d) => ({
      key: d.key,
      label: d.label,
      enabled: d.enabled,
    })),
    endpoints: [
      "GET /api/datasets  (가용성 점검)",
      "GET /api/transactions?dataset=aptTrade&region=11680&yyyymm=202604",
      "GET /api/transactions/range?dataset=aptTrade&region=11680&from=202401&to=202412&apt=래미안",
      "GET /api/complexes?region=11680&q=래미안",
      "GET /api/stats?dataset=aptTrade&region=11680&yyyymm=202604",
      "POST /api/admin/backfill?months=12",
    ],
  })
);

// 데이터셋 가용성 실시간 점검 (서비스키가 어떤 API 에 활용신청됐는지). KV 1시간 캐시.
app.get("/api/datasets", async (c) => {
  const cacheKey = "health:datasets";
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) return c.json({ cached: true, ...(cached as object) });

  const results = await Promise.all(
    Object.values(DATASETS).map(async (d) => {
      try {
        const rows = await fetchMonth(c.env.MOLIT_SERVICE_KEY, d.key, "11680", "202604");
        return { key: d.key, label: d.label, status: "ok", sample: rows.length };
      } catch (e) {
        const status = e instanceof SubscriptionError ? "forbidden" : "error";
        return { key: d.key, label: d.label, status, sample: 0 };
      }
    })
  );
  const payload = { checkedAt: Date.now(), datasets: results };
  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 3600 });
  return c.json({ cached: false, ...payload });
});

// 대시보드: 한 달 × 여러 시군구 집계. 누락 지역은 즉시 일부 적재 + 나머지는 큐로.
app.get("/api/overview", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const yyyymm = c.req.query("yyyymm") ?? "";
  const scope = c.req.query("scope") ?? "seoul";
  const ensure = c.req.query("ensure") !== "0"; // 기본 자동 채움
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_YMD.test(yyyymm)) return c.json({ error: "yyyymm(YYYYMM) 필요" }, 400);

  const codes = scopeCodes(scope);
  const ovKey = `resp:ov:${dataset}:${scope}:${yyyymm}`;

  // KV 응답 캐시: 히트 시 ensure/집계 전부 스킵(즉시)
  const kvHit = await c.env.CACHE.get(ovKey, "json");
  if (kvHit) return c.json(kvHit as object, 200, { "Cache-Control": "public, max-age=60" });

  // 모든 scope: ingest check + 집계 3개 쿼리 동시 병렬 실행
  // 누락 지역은 항상 백그라운드 큐로 처리 (인라인 ensure 제거 → cold path ~60ms 단축)
  // 프론트엔드는 filling 상태를 감지해 폴링하므로 partial 응답도 정상 동작
  const [have, aggs, trendMap] = ensure
    ? await Promise.all([
        ingestedRegions(c.env, dataset, yyyymm),
        overviewByRegion(c.env, dataset, yyyymm, codes),
        regionTrends(c.env, dataset, codes, shiftYmd(yyyymm, -5), yyyymm),
      ])
    : [new Set<string>(),
       await overviewByRegion(c.env, dataset, yyyymm, codes),
       await regionTrends(c.env, dataset, codes, shiftYmd(yyyymm, -5), yyyymm)];

  if (ensure) {
    const missing = codes.filter((cd) => !have.has(cd));
    if (missing.length > 0)
      c.executionCtx.waitUntil(
        enqueue(c.env, missing.map((cd) => ({ type: "trades", sggCd: cd, dataset, dealYmd: yyyymm })))
      );
  }
  const byCode = new Map(aggs.map((a) => [a.sggCd, a]));
  // 6개월 공통 축 정렬 후 avg 배열만 전송 (month 키 제거 → payload 절반)
  const trendMonths = Array.from({ length: 6 }, (_, i) => shiftYmd(yyyymm, -(5 - i)));
  const regions = codes
    .map((cd) => {
      const a = byCode.get(cd);
      const info = REGION_NAMES[cd];
      const tByM = new Map((trendMap[cd] ?? []).map((t) => [t.month, t.avg]));
      return {
        sggCd: cd, sido: info?.sido ?? "", name: info?.name ?? cd,
        count: a?.count ?? 0, avg: a?.avg ?? 0, avg84: a?.avg84 ?? 0,
        max: a?.max ?? 0, min: a?.min ?? 0, loaded: !!a,
        trend: trendMonths.map((m) => tByM.get(m) ?? 0),
      };
    })
    .sort((x, y) => y.avg - x.avg);
  const loaded = regions.filter((r) => r.count > 0);
  const totalCount = loaded.reduce((s, r) => s + r.count, 0);
  const totals = {
    regions: codes.length,
    loaded: loaded.length,
    count: totalCount,
    avg: totalCount > 0 ? Math.round(loaded.reduce((s, r) => s + r.avg * r.count, 0) / totalCount) : 0,
    max: loaded.reduce((m, r) => Math.max(m, r.max), 0),
  };
  const payload = { dataset, yyyymm, scope, totals, regions };

  // 완료: 당월 25시간(일일 cron 워밍 주기>24h 보장) / 과거 7일. 수집 중: 60초 (KV 최소 TTL=60)
  const ovTtl = totals.loaded >= totals.regions
    ? (yyyymm >= curYmd() ? 60 * 60 * 25 : 60 * 60 * 24 * 7)
    : 60;
  // await (waitUntil 아님): 워밍 시 KV 쓰기 확실히 완료 → 코어 KV 바닥 보장
  await c.env.CACHE.put(ovKey, JSON.stringify(payload), { expirationTtl: ovTtl });

  return c.json(payload, 200, { "Cache-Control": "public, max-age=60" });
});

// 통계: 월 × scope 전체 데이터의 요약(평균/중앙값/분위수/분포/면적대/연대/지역)
app.get("/api/statistics", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const yyyymm = c.req.query("yyyymm") ?? "";
  const scope = c.req.query("scope") ?? "seoul";
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_YMD.test(yyyymm)) return c.json({ error: "yyyymm(YYYYMM) 필요" }, 400);

  const codes = scopeCodes(scope);
  const statsKey = `resp:stats:${dataset}:${scope}:${yyyymm}`;

  // KV 히트 시 ensure + 집계 전부 스킵 (overview 와 동일 패턴)
  // coverage(loaded/total) 를 캐시 payload 에 포함해 D1 재조회 불필요
  type StatsCached = { _loaded: number; _total: number; [k: string]: unknown };
  const kvHit = await c.env.CACHE.get(statsKey, "json") as StatsCached | null;
  if (kvHit) {
    const { _loaded, _total, ...stats } = kvHit;
    // 항상 엣지/프록시 캐시 허용. 미완이면 짧게(30s)·완료면 60s → coverage 신선도와 속도 양립
    const cc = _loaded >= _total ? "public, max-age=1800" : "public, max-age=600";
    return c.json(
      { dataset, yyyymm, scope, coverage: { loaded: _loaded, total: _total }, ...stats },
      200, { "Cache-Control": cc }
    );
  }

  // KV 미스: 동기 수집으로 막지 않음(MOLIT 실패 지역에서 멈춤 방지).
  // 누락 지역은 전부 백그라운드 큐로 보내고, 지금 적재된 데이터로 즉시 집계.
  const have = await ingestedRegions(c.env, dataset, yyyymm);
  const missing = codes.filter((cd) => !have.has(cd));
  if (missing.length > 0) {
    c.executionCtx.waitUntil(
      enqueue(c.env, missing.map((cd) => ({ type: "trades", sggCd: cd, dataset, dealYmd: yyyymm })))
    );
  }
  const loaded = codes.filter((cd) => have.has(cd)).length;
  const stats = await computeStatsSql(c.env, dataset, yyyymm, scope, REGION_NAMES);

  // loaded/total 을 payload 에 포함해 캐시 → KV 히트 시 D1 재조회 불필요.
  // ⚠️ await (waitUntil 아님): 고/저동시성 워밍에서도 KV 쓰기가 확실히 완료돼 바닥 보장
  //    (waitUntil 은 isolate 재활용 시 드롭 → KV 비어 매번 재집계됨, 실측).
  await c.env.CACHE.put(
    statsKey,
    JSON.stringify({ _loaded: loaded, _total: codes.length, ...stats }),
    { expirationTtl: respTtl(yyyymm) }
  );

  const cc = loaded >= codes.length ? "public, max-age=1800" : "public, max-age=600";
  return c.json(
    { dataset, yyyymm, scope, coverage: { loaded, total: codes.length }, ...stats },
    200, { "Cache-Control": cc }
  );
});

// 월별 실거래 (주력: KV/엣지 캐시 히트 시 즉시)
// 오늘의 실거래: 계약일 최신순 거래 (전국 또는 scope). D1 직조회(가벼움), 짧은 캐시.
app.get("/api/recent", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const scope = c.req.query("scope") ?? "all";
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 120), 1), 300);
  const date = c.req.query("date") ?? "";
  const exactDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const yyyymm = exactDate ? exactDate.slice(0, 7).replace("-", "") : (c.req.query("yyyymm") ?? curYmd());
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_YMD.test(yyyymm)) return c.json({ error: "yyyymm(YYYYMM) 필요" }, 400);

  // KV 응답 캐시: 당월 10분 / exactDate(확정) 6시간 / 과거 7일
  const recentTtl = exactDate ? 25 * 3600 : (yyyymm >= curYmd() ? 25 * 3600 : 7 * 24 * 3600);
  const recentKey = `resp:recent:v2:${dataset}:${scope}:${yyyymm}:${exactDate ?? ""}:${limit}`;
  const payload = await cachedJson(c.env, recentKey, recentTtl, async () => {
    const codes = scope === "all" ? null : scopeCodes(scope);
    const deals = await recentDeals(c.env, dataset, yyyymm, codes, limit, exactDate);
    // 게임화: 단지별 직전 최고가/마지막 거래일 → 상승률·신고가·갱신 간격
    const names = [...new Set(deals.map((d) => d.aptName).filter(Boolean))];
    // 거래에 등장한 시군구만 → enrichment 스캔 범위를 해당 지역으로 한정(전국 스캔 차단)
    const sggs = [...new Set(deals.map((d) => d.sggCd).filter(Boolean) as string[])];
    // 최근 6개월 월평균 시계열(스파크라인) + 직전 최고가
    const months = Array.from({ length: 6 }, (_, i) => shiftYmd(yyyymm, -(5 - i)));
    const [prior, series] = await Promise.all([
      aptPriorStats(c.env, dataset, yyyymm, names, sggs),
      aptMonthlySeries(c.env, dataset, months[0], yyyymm, names, sggs),
    ]);
    const enriched = deals.map((d) => {
      const key = `${d.sggCd}|${d.aptName}`;
      const p = prior.get(key);
      const amount = d.dealAmount || d.deposit;
      const prevMax = p?.max ?? 0;
      const prevDate = p?.lastDate || null;
      const rise = prevMax > 0 ? Math.round(((amount - prevMax) / prevMax) * 1000) / 10 : null; // %
      const isHigh = prevMax > 0 && amount >= prevMax;
      const sm = series.get(key);
      const trend = months.map((m) => sm?.get(m) ?? 0);
      return { ...d, prevMax, prevDate, rise, isHigh, isFirst: prevMax === 0, trend };
    });
    const latest = enriched[0]?.dealDate ?? "";
    return { dataset, yyyymm, scope, date: exactDate ?? null, latest, count: enriched.length, deals: enriched };
  });
  // 과거 확정일(exactDate)은 불변 → 장기 캐시(6h). 당월/최신은 짧게.
  const cc = exactDate && exactDate.slice(0, 7).replace("-", "") < curYmd()
    ? "public, max-age=21600"
    : (exactDate ? "public, max-age=3600" : "public, max-age=300");
  return c.json(payload, 200, { "Cache-Control": cc });
});

app.get("/api/transactions", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const region = c.req.query("region") ?? "";
  const yyyymm = c.req.query("yyyymm") ?? "";
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_SGG.test(region)) return c.json({ error: "region(5자리) 필요" }, 400);
  if (!RE_YMD.test(yyyymm)) return c.json({ error: "yyyymm(YYYYMM) 필요" }, 400);

  const txKey = `resp:tx:v3:${dataset}:${region}:${yyyymm}`;

  // KV 히트 → ingestedMonths D1 쿼리 완전 스킵 (가장 빠른 경로)
  const kvHit = await c.env.CACHE.get(txKey, "json");
  if (kvHit) return c.json({ ...(kvHit as object), filling: false });

  // KV 미스: 적재 여부 확인 → 미적재면 큐 enqueue + filling 즉시 응답
  const have = await ingestedMonths(c.env, dataset, region);
  if (!have.has(yyyymm)) {
    c.executionCtx.waitUntil(
      enqueue(c.env, [{ type: "trades", sggCd: region, dataset, dealYmd: yyyymm }])
    );
    c.header("Cache-Control", "no-store"); // 수집 중 응답은 엣지 캐시 금지
    return c.json({ dataset, region, yyyymm, source: "filling", count: 0, items: [], filling: true });
  }

  // 적재 완료 → D1 에서 조회 후 KV 에 저장
  const payload = await cachedJson(
    c.env,
    txKey,
    respTtl(yyyymm),
    async () => {
      const { rows, source } = await ensureMonth(c.env, dataset, region, yyyymm);
      // 단지별 직전 거래가/거래일 + 단지 전체 최고가 (카드에 표시)
      const names = [...new Set(rows.map((r) => r.aptName).filter(Boolean))];
      const ctx = await aptDealContext(c.env, dataset, region, yyyymm, names);
      // 프론트엔드 Transaction 타입에 필요한 필드만 선택 (불필요 필드 제거로 ~50% 응답 경량화)
      const items = rows.map((r) => {
        const amount = r.dealAmount || r.deposit;
        const e = ctx.get(`${r.aptName}|${areaBand(r.area)}`); // 같은 평형 기준
        const prevPrice = e?.prevPrice ?? 0;
        const aptMax = e?.aptMax || amount;
        const rise = prevPrice > 0 ? Math.round(((amount - prevPrice) / prevPrice) * 1000) / 10 : null;
        return {
          aptName: r.aptName,
          dealAmount: r.dealAmount,
          deposit: r.deposit,
          monthlyRent: r.monthlyRent,
          category: r.category,
          area: r.area,
          floor: r.floor,
          buildYear: r.buildYear,
          umdNm: r.umdNm,
          jibun: r.jibun,
          dealDate: r.dealDate,
          cdealType: r.cdealType,
          prevPrice,
          prevDate: e?.prevDate || null,
          aptMax,
          rise,
          isHigh: prevPrice > 0 && amount >= aptMax, // 직전 거래 있고 단지 최고가 경신/동률
        };
      });
      return { dataset, region, yyyymm, source, count: items.length, items };
    }
  );
  return c.json({ ...payload, filling: false });
});

// 월별 집계 통계
app.get("/api/stats", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const region = c.req.query("region") ?? "";
  const yyyymm = c.req.query("yyyymm") ?? "";
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_SGG.test(region)) return c.json({ error: "region(5자리) 필요" }, 400);
  if (!RE_YMD.test(yyyymm)) return c.json({ error: "yyyymm(YYYYMM) 필요" }, 400);

  const payload = await cachedJson(
    c.env,
    `resp:stats1:${dataset}:${region}:${yyyymm}`,
    respTtl(yyyymm),
    async () => {
      const { rows } = await ensureMonth(c.env, dataset, region, yyyymm);
      const rent = getDataset(dataset)!.category === "rent";
      const vals = rows.map((r) => (rent ? r.deposit : r.dealAmount)).filter((v) => v > 0);
      const stats =
        vals.length === 0
          ? null
          : {
              count: rows.length,
              avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
              max: Math.max(...vals),
              min: Math.min(...vals),
              basis: rent ? "deposit" : "dealAmount",
            };
      return { dataset, region, yyyymm, stats };
    }
  );
  return c.json(payload);
});

// 다월 추이 (D1 집계). 범위 내 누락 월은 즉시 적재 후 집계.
app.get("/api/transactions/range", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const region = c.req.query("region") ?? "";
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  const apt = c.req.query("apt") || undefined;
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_SGG.test(region)) return c.json({ error: "region(5자리) 필요" }, 400);
  if (!RE_YMD.test(from) || !RE_YMD.test(to))
    return c.json({ error: "from/to(YYYYMM) 필요" }, 400);

  // 논블로킹: D1에 있는 건 즉시 집계, 없는 달은 백그라운드 큐로 (월 집합 1쿼리)
  const months = monthsBetween(from, to).slice(0, 36);
  const have = await ingestedMonths(c.env, dataset, region);
  const missing = months.filter((m) => !have.has(m));
  if (missing.length > 0) {
    c.executionCtx.waitUntil(
      enqueue(c.env, missing.map((m) => ({ type: "trades", sggCd: region, dataset, dealYmd: m })))
    );
  }
  const trend = await monthlyTrend(c.env, dataset, region, from, to, apt);
  return c.json({ dataset, region, from, to, apt: apt ?? null, trend, filling: missing.length });
});

// 지도 단지 레이어: 한 시군구의 단지별 좌표+가격 (줌인 시 사용). 좌표는 캐시 후 지오코딩.
app.get("/api/aptmap", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const region = c.req.query("region") ?? "";
  const yyyymm = c.req.query("yyyymm") ?? "";
  const limit = Math.min(Number(c.req.query("limit") ?? "500"), 600);
  if (!RE_SGG.test(region)) return c.json({ error: "region(5자리) 필요" }, 400);
  if (!RE_YMD.test(yyyymm)) return c.json({ error: "yyyymm(YYYYMM) 필요" }, 400);

  // 지도: 선택 월 1개가 아니라 "이 지역 최근 1년" 단지를 폭넓게 표시 (max=기간 최고가)
  const fromYmd = shiftYmd(yyyymm, -11);

  // KV 응답 캐시: 지오코딩 결과가 안정적이면 재활용 (줌인 반복 시 즉시 응답). v2=12개월 윈도우.
  const aptmapKey = `resp:aptmap:v3:${dataset}:${region}:${fromYmd}-${yyyymm}`;
  const kvHit = await c.env.CACHE.get(aptmapKey, "json");
  // KV 히트 = 지오코딩 안정된 엔트리(좌표 불변) → 일1회 데이터 주기로 길게 캐시(s-maxage=300
  // 5분 revalidation 폭주 제거, p99 꼬리 완화). SWR 7일이라 만료돼도 stale 즉시.
  if (kvHit) return c.json(kvHit as object, 200, { "Cache-Control": `public, max-age=${respTtl(yyyymm)}` });

  await ensureMonth(c.env, dataset, region, yyyymm);
  const aggs = (await aptAggregatesRange(c.env, dataset, region, fromYmd, yyyymm)).slice(0, limit);

  const keyOf = (a: { umd: string; jibun: string }) => `${region}|${a.umd}|${a.jibun}`;
  const coordCache = await getCoords(c.env, aggs.map(keyOf));

  const regionLabel = REGION_NAMES[region]
    ? `${REGION_NAMES[region].sido === "서울" ? "서울특별시" : REGION_NAMES[region].sido} ${REGION_NAMES[region].name}`
    : region;

  // 미캐시 단지만 지오코딩 (동시성 제한)
  const toGeocode = aggs.filter((a) => !coordCache.has(keyOf(a)));
  const fresh: { k: string; apt: string; lat: number; lng: number }[] = [];
  const CONC = 10;
  for (let i = 0; i < toGeocode.length; i += CONC) {
    const batch = toGeocode.slice(i, i + CONC);
    const res = await Promise.all(
      batch.map((a) =>
        geocode(c.env.KAKAO_REST_KEY, regionLabel, a.umd, a.jibun, a.apt).then((ll) =>
          ll ? { k: keyOf(a), apt: a.apt, lat: ll.lat, lng: ll.lng } : null
        )
      )
    );
    for (const r of res) if (r) fresh.push(r);
  }
  if (fresh.length > 0) {
    await putCoords(c.env, fresh);
    for (const f of fresh) coordCache.set(f.k, { lat: f.lat, lng: f.lng });
  }

  const items = aggs
    .map((a) => {
      const ll = coordCache.get(keyOf(a));
      if (!ll) return null;
      return { apt: a.apt, umd: a.umd, count: a.count, avg: a.avg, max: a.max, lat: ll.lat, lng: ll.lng };
    })
    .filter(Boolean);

  const result = { region, yyyymm, count: items.length, items };
  // 전부 지오코딩되면 정상 TTL, 일부 실패 시 짧은 TTL(좌표는 apt_coords 에 영속 →
  // 다음 요청에서 누락분만 재시도하며 점진적으로 채워짐). aggs 가 비면 캐시 안 함.
  // ≥97% 지오코딩되면 정상 TTL(25h). 불량주소 소수(영구 실패)는 허용 — 안 그러면
  // 그 구 aptmap 이 영영 300s 콜드(items>=aggs 영원히 거짓). 좌표는 apt_coords 에 영속.
  // HTTP Cache-Control 도 동일: 완성=길게(CDN revalidation 폭주 제거), 미완성=300s(좌표 채움 유도).
  const complete = aggs.length > 0 && items.length >= Math.floor(aggs.length * 0.97);
  const maxAge = complete ? respTtl(yyyymm) : 300;
  if (aggs.length > 0) {
    c.executionCtx.waitUntil(
      c.env.CACHE.put(aptmapKey, JSON.stringify(result), { expirationTtl: maxAge })
    );
  }
  return c.json(result, 200, { "Cache-Control": `public, max-age=${maxAge}` });
});

// 단지 좌표 사전 배치 수집(단일 구, 동기). 그 구의 모든 distinct 단지를 즉시 지오코딩→apt_coords.
// 이후 /api/aptmap 은 apt_coords 캐시 히트로 즉시·완전 표시.
app.get("/api/admin/geocode", async (c) => {
  const region = c.req.query("region") ?? "";
  if (!RE_SGG.test(region)) return c.json({ error: "region(5자리) 필요" }, 400);
  const r = await geocodeRegion(c.env, region);
  return c.json({ region, ...r });
});

// 좌표 사전 수집 일괄 트리거: scope 내 모든 시군구를 큐에 등록(비동기). 프로덕션용.
app.get("/api/admin/geocode-all", async (c) => {
  const scope = c.req.query("scope") ?? "all";
  const codes = scopeCodes(scope);
  await enqueue(c.env, codes.map((sggCd) => ({ type: "geocode", sggCd } as BackfillJob)));
  return c.json({ scope, enqueued: codes.length });
});

// 단지 거래 이력 (한 단지의 기간 내 모든 거래). 범위 월 누락 시 즉시 적재.
app.get("/api/complex", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const region = c.req.query("region") ?? "";
  const apt = c.req.query("apt") ?? "";
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!getDataset(dataset)) return c.json({ error: `unknown dataset '${dataset}'` }, 400);
  if (!RE_SGG.test(region)) return c.json({ error: "region(5자리) 필요" }, 400);
  if (!apt) return c.json({ error: "apt(단지명) 필요" }, 400);
  if (!RE_YMD.test(from) || !RE_YMD.test(to))
    return c.json({ error: "from/to(YYYYMM) 필요" }, 400);

  // 없는 달은 백그라운드 큐로 (캐시 히트와 무관하게 보장)
  const months = monthsBetween(from, to).slice(0, 36);
  const have = await ingestedMonths(c.env, dataset, region);
  const missing = months.filter((m) => !have.has(m));
  if (missing.length > 0) {
    c.executionCtx.waitUntil(
      enqueue(c.env, missing.map((m) => ({ type: "trades", sggCd: region, dataset, dealYmd: m })))
    );
  }
  // KV 응답 캐시 (단지 이력은 같은 키로 자주 재조회됨)
  const payload = await cachedJson(
    c.env,
    `resp:complex:${dataset}:${region}:${apt}:${from}:${to}`,
    respTtl(to),
    async () => {
      const rows = await complexDeals(c.env, dataset, region, apt, from, to);
      const deals = rows.map((r) => ({
        aptName: r.aptName, dealAmount: r.dealAmount, deposit: r.deposit,
        monthlyRent: r.monthlyRent, category: r.category,
        area: r.area, floor: r.floor, buildYear: r.buildYear,
        umdNm: r.umdNm, jibun: r.jibun, dealDate: r.dealDate, cdealType: r.cdealType,
      }));
      return { region, apt, from, to, count: deals.length, deals };
    }
  );
  return c.json({ ...payload, filling: missing.length });
});

// 펀팩트: 좌표 주변 시설(관공서/경찰/소방/학교/스타벅스/올리브영/다이소) + 가장 가까운 지하철역
app.get("/api/nearby", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return c.json({ error: "lat/lng 필요" }, 400);
  const key = `near:v6:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = await c.env.CACHE.get(key, "json");
  if (cached) return c.json(cached as object);
  const data = await findNearby(c.env.KAKAO_REST_KEY, lat, lng);
  await c.env.CACHE.put(key, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 30 });
  return c.json(data);
});

// 단지 대지 경계 폴리곤 (VWorld 연속지적도). 좌표가 속한 필지(지번) 폴리곤.
app.get("/api/parcel", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return c.json({ error: "lat/lng 필요" }, 400);
  const key = `parcel:v1:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  const cached = await c.env.CACHE.get(key, "json");
  if (cached) return c.json(cached as object);
  const domain = c.env.VWORLD_DOMAIN || "land.zihado.com";
  const parcel = await fetchParcel(c.env.VWORLD_KEY, domain, lat, lng);
  const payload = parcel ?? { jibun: "", addr: "", rings: [] };
  // 지적 경계는 거의 불변 → 장기 캐시 (성공 시에만)
  if (parcel) await c.env.CACHE.put(key, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 180 });
  return c.json(payload);
});

// 단건 좌표 (단지 상세 미니맵). 캐시 → 지오코딩.
app.get("/api/coord", async (c) => {
  const region = c.req.query("region") ?? "";
  const umd = c.req.query("umd") ?? "";
  const jibun = c.req.query("jibun") ?? "";
  const apt = c.req.query("apt") ?? "";
  if (!RE_SGG.test(region)) return c.json({ error: "region 필요" }, 400);
  const key = `${region}|${umd}|${jibun}`;
  const cached = await getCoords(c.env, [key]);
  if (cached.has(key)) return c.json(cached.get(key));
  const info = REGION_NAMES[region];
  const label = info ? `${info.sido === "서울" ? "서울특별시" : info.sido} ${info.name}` : region;
  const ll = await geocode(c.env.KAKAO_REST_KEY, label, umd, jibun, apt);
  if (!ll) return c.json({ error: "좌표를 찾지 못했습니다" }, 404);
  await putCoords(c.env, [{ k: key, apt, lat: ll.lat, lng: ll.lng }]);
  return c.json(ll);
});

// 단지명 검색 (커맨드 팔레트): 적재된 거래 데이터 기준
app.get("/api/aptsearch", async (c) => {
  const dataset = c.req.query("dataset") ?? DEFAULT_DATASET;
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json({ items: [] });
  // KV 캐시 (검색어별, 전체 스캔이라 무거움)
  const payload = await cachedJson(
    c.env,
    `resp:apts:${dataset}:${q}`,
    60 * 60 * 6,
    async () => {
      const rows = await searchAptNames(c.env, dataset, q, 10);
      const items = rows.map((r) => ({
        kaptCode: `${r.sggCd}:${r.apt}`,
        kaptName: r.apt,
        sggCd: r.sggCd,
        sido: REGION_NAMES[r.sggCd]?.sido ?? "",
        sigungu: REGION_NAMES[r.sggCd]?.name ?? "",
        dong: r.umd,
      }));
      return { q, count: items.length, items };
    }
  );
  return c.json(payload, 200, { "Cache-Control": "public, max-age=600" });
});

// 단지 검색 (D1 카탈로그). 지역에 데이터 없으면 즉시 수집.
app.get("/api/complexes", async (c) => {
  const region = c.req.query("region") || undefined;
  const q = c.req.query("q") || undefined;
  if (region && !RE_SGG.test(region))
    return c.json({ error: "region(5자리) 형식 오류" }, 400);

  let results = await searchComplexes(c.env, region, q);
  if (results.length === 0 && region) {
    await ensureComplexes(c.env, region);
    results = await searchComplexes(c.env, region, q);
  }
  return c.json({ region: region ?? null, q: q ?? null, count: results.length, items: results });
});

// 백필 트리거: 활용신청된 전 데이터셋 × 전 지역 × 최근 N개월 + 단지목록
app.post("/api/admin/backfill", async (c) => {
  const months = Number(c.req.query("months") ?? c.env.BACKFILL_MONTHS ?? "12");
  const jobs = buildBackfillJobs(months);
  await enqueue(c.env, jobs);
  return c.json({ enqueued: jobs.length, months, datasets: enabledDatasets().map((d) => d.key) });
});

// 캐시 워밍 즉시 트리거 (cron 안 기다리고 Vercel+CF 전부 데움)
app.post("/api/admin/warm", async (c) => {
  const which = c.req.query("which"); // core | recent-sido | regions | regions-past | complexes | (기본 전부)
  // 각 which 는 단일 invocation(≤1000 subrequest) — 데이터셋을 cron 과 동일하게 분할.
  c.executionCtx.waitUntil(
    which === "core" ? warmCore()
      : which === "recent-sido" ? (async () => { await warmRecentSido(["aptTrade"]); await warmRecentSido(["aptRent", "silvTrade"], 7); })()
      : which === "regions" ? warmRegions(["aptTrade", "aptRent"])
      : which === "regions-past" ? (async () => { await warmRegionsPast(["aptTrade"]); await warmRegions(["silvTrade"]); })()
      : which === "complexes" ? enqueueComplexWarm(c.env)
      : warmCaches(c.env)
  );
  return c.json({ ok: true, started: true, which: which ?? "all" });
});

// 자체 엔드포인트 호출로 KV 응답 캐시 워밍 (콜드 제거)
const SELF = "https://landman-worker.zihado.workers.dev";
const WARM_SIDOS = [
  "all", "seoul", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
  "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];
// 워밍 대상 베이스:
//  - VERCEL_BASE(프록시): Vercel CDN + 워커 KV 동시 워밍. 핫 bounded(core) 전용.
//  - WORKER_BASE(워커 직결): 워커 KV 만 워밍. long-tail(지역·시도탭) 전용 →
//    ⚠️ long-tail 을 CDN 에 구우면 CDN(용량 한계·LRU)이 핫 코어를 evict 한다(실측 확인).
//    long-tail 은 KV(무한)만 채우고, 프록시 MISS 는 워커 KV HIT(~60-120ms)로 처리.
const VERCEL_BASE = "https://land.zihado.com";
const WORKER_BASE = "https://api.zihado.com";

// 경로들을 동시 5개씩 fetch. base 로 CDN 포함 여부 결정.
// ⚠️ 동시성을 낮춰야(5) 핸들러의 waitUntil KV 쓰기가 isolate 재활용 전에 완료됨
//    (고동시성 시 KV 쓰기 드롭 → 워밍해도 KV 바닥이 비는 현상 실측).
async function warmPaths(paths: string[], base: string = VERCEL_BASE): Promise<void> {
  const all = paths.map((p) => base + p);
  const CONC = 5;
  for (let i = 0; i < all.length; i += CONC) {
    await Promise.allSettled(all.slice(i, i + CONC).map((u) => fetch(u)));
  }
}

// cron A (코어): 대시보드 + 통계 + 오늘의실거래(전국/서울 30일). 전 데이터셋. (~150 요청)
// ⚠️ URL 파라미터 순서·값을 프론트(src/lib/api.ts)와 정확히 일치시켜야 같은 캐시 키.
async function warmCore(): Promise<void> {
  const months = recentMonths(3); // 당월 + 과거 2개월 (기준월 네비)
  const dsets = enabledDatasets().map((d) => d.key); // 매매/전월세/분양권
  const paths: string[] = [];
  for (const ds of dsets) {
    for (const ym of months) {
      paths.push(`/api/overview?dataset=${ds}&scope=all&yyyymm=${ym}`);
      paths.push(`/api/overview?dataset=${ds}&scope=seoul&yyyymm=${ym}`);
      for (const s of WARM_SIDOS)
        paths.push(`/api/statistics?dataset=${ds}&scope=${encodeURIComponent(s)}&yyyymm=${ym}`);
    }
    // 오늘의실거래 전국/서울 30일 (시도탭은 cron C 에서)
    for (let i = 0; i < 30; i++) {
      const dt = shiftDays(i);
      if (!dt) continue;
      const ym = dt.slice(0, 6);
      const d = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
      for (const s of ["all", "seoul"])
        paths.push(`/api/recent?dataset=${ds}&scope=${s}&yyyymm=${ym}&limit=300&date=${d}`);
    }
  }
  // 코어는 양 레이어 확보: 워커 KV(글로벌 바닥, CDN evict 돼도 ~55ms) + Vercel CDN(핫 ~15ms).
  // ⚠️ 프록시 고동시성 워밍은 KV 쓰기(waitUntil)를 드롭함 → KV 는 워커직결로 별도 워밍.
  await warmPaths(paths, WORKER_BASE);
  await warmPaths(paths);
  // SSR HTML 라우트(ISR)는 위 API 데이터가 데워진 뒤 마지막에 재생성 → 콜드 PRERENDER
  // 꼬리를 실사용자가 아닌 cron 이 흡수. revalidate(1800s)와 일1회 cron 으로 거의 항상 HIT.
  await warmSsrPages();
}

// SSR HTML 라우트(Vercel ISR 전용 — 워커는 HTML 미서빙). 데이터 워밍 직후 호출해야
// 페이지 재생성이 신선한 KV 를 끌어온다. src/app/(app)/*/page.tsx 라우트와 1:1.
const SSR_PAGES = ["/", "/today", "/stats", "/rent", "/presale", "/map", "/complex"];

// ⚠️ Vercel ISR 의 RSC 페이로드는 HTML 과 별도 캐시 엔트리(RSC 헤더로 vary). 날짜 클릭=soft-nav
//    은 RSC 만 받으므로 HTML 만 구우면 RSC MISS 콜드(실측 741ms). HTML·RSC 둘 다 굽는다.
async function warmPathsRsc(paths: string[]): Promise<void> {
  const all = paths.map((p) => VERCEL_BASE + p);
  const CONC = 5;
  for (let i = 0; i < all.length; i += CONC) {
    await Promise.allSettled(all.slice(i, i + CONC).map((u) => fetch(u, { headers: { RSC: "1" } })));
  }
}

async function warmSsrPages(): Promise<void> {
  // 오늘의실거래 최근 14일 날짜 경로(/today/[date], 전국·매매) — soft-nav 대상.
  const todayDates: string[] = [];
  for (let i = 1; i < 14; i++) {
    const dt = shiftDays(i);
    if (dt) todayDates.push(`/today/${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`);
  }
  const pages = [...SSR_PAGES, ...todayDates];
  await warmPaths(pages); // HTML 진입
  await warmPathsRsc(pages); // RSC soft-nav (HTML 과 별도 캐시)
}

// 오늘의실거래 시도탭: recent 시도 × 최근 N일. 데이터셋별로 cron 분할 호출해
// subrequest 한도(1000/invocation)와 Vercel CDN 용량을 동시에 회피.
// (전국/서울은 warmCore 가 30일치 굽고, 여기서는 16개 시도탭만.)
const RECENT_SIDOS = WARM_SIDOS.filter((s) => s !== "all" && s !== "seoul");
const RECENT_WARM_DAYS = 31; // 한달치(롤링) — 날짜 네비가 한달 안이면 항상 워밍됨
async function warmRecentSido(dsets: string[], days = RECENT_WARM_DAYS): Promise<void> {
  const paths: string[] = [];
  for (const ds of dsets) {
    for (let i = 0; i < days; i++) {
      const dt = shiftDays(i);
      if (!dt) continue;
      const ym = dt.slice(0, 6);
      const d = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
      for (const s of RECENT_SIDOS)
        paths.push(`/api/recent?dataset=${ds}&scope=${encodeURIComponent(s)}&yyyymm=${ym}&limit=300&date=${d}`);
    }
  }
  await warmPaths(paths, WORKER_BASE); // long-tail → 워커 KV 만(CDN 코어 evict 방지). ds당 496 요청
}

// cron B (지역-당월): 지역상세가 부르는 거래목록(transactions)+12개월 추이(range)를 전 데이터셋
// 워밍. 지도(aptmap)·단지목록(complexes)은 무겁고 aptTrade 위주라 aptTrade 만.
// ⚠️ subrequest 1000/invocation 한도 → 데이터셋을 cron 별로 분할(scheduled 참고).
async function warmRegions(datasets: string[] = ["aptTrade"]): Promise<void> {
  const curM = curYmd();
  const from = shiftYmd(curM, -11); // fetchTrend(sggCd, shiftMonth(yyyymm,-11), yyyymm)
  const paths: string[] = [];
  for (const ds of datasets) {
    for (const cd of SGG_CODES) {
      paths.push(`/api/transactions?dataset=${ds}&region=${cd}&yyyymm=${curM}`);
      paths.push(`/api/transactions/range?dataset=${ds}&region=${cd}&from=${from}&to=${curM}`);
      if (ds === "aptTrade") {
        paths.push(`/api/aptmap?dataset=${ds}&region=${cd}&yyyymm=${curM}&limit=500`); // 프론트 fetchAptMap 과 동일 키
        paths.push(`/api/complexes?dataset=${ds}&region=${cd}`);
      }
    }
  }
  await warmPaths(paths, WORKER_BASE); // 지역상세 long-tail → 워커 KV 만
}

// cron D (지역-과거월): 거래목록 × 과거 2개월(기준월 네비). 지도는 aptTrade 만.
async function warmRegionsPast(datasets: string[] = ["aptTrade"]): Promise<void> {
  const past = recentMonths(3).slice(0, 2); // 당월 제외 과거 2개월
  const paths: string[] = [];
  for (const ds of datasets) {
    for (const ym of past) {
      for (const cd of SGG_CODES) {
        paths.push(`/api/transactions?dataset=${ds}&region=${cd}&yyyymm=${ym}`);
        if (ds === "aptTrade")
          paths.push(`/api/aptmap?dataset=${ds}&region=${cd}&yyyymm=${ym}&limit=500`); // 프론트 fetchAptMap 과 동일 키
      }
    }
  }
  await warmPaths(paths, WORKER_BASE); // 지역상세 과거월 long-tail → 워커 KV 만
}

// cron E (단지 상세): 실거래 찍힌 단지(단지 상세 모달)를 미리 굽는다.
// 당월 거래 있는 distinct (sgg,apt) 수천 개 → 한 호출 subrequest 한도 회피 위해
// KV 오프셋으로 청크 순환. ORDER BY sgg_cd → 서울(11)·경기(41) 먼저 워밍.
// from/to 는 ComplexDetail 의 fetchComplexDeals(region,apt,yyyymm-11,yyyymm) 과 정확히 일치.
const COMPLEX_CHUNK = 900;
async function warmComplexes(env: Env): Promise<void> {
  const curM = curYmd();
  const from = shiftYmd(curM, -11);
  const offKey = "warm:complex:off";
  const off = Number(await env.CACHE.get(offKey)) || 0;
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT sgg_cd, apt_name FROM transactions
     WHERE dataset='aptTrade' AND deal_ymd=? ORDER BY sgg_cd, apt_name LIMIT ? OFFSET ?`
  ).bind(curM, COMPLEX_CHUNK, off).all();
  const rows = results as { sgg_cd: string; apt_name: string }[];
  const paths = rows.map(
    (r) => `/api/complex?dataset=aptTrade&region=${r.sgg_cd}&apt=${encodeURIComponent(r.apt_name)}&from=${from}&to=${curM}`
  );
  await warmPaths(paths);
  // 끝까지 갔으면 0으로 되돌려 다음 사이클(SWR 7일이라 이미 구운 건 유지)
  const next = rows.length < COMPLEX_CHUNK ? 0 : off + COMPLEX_CHUNK;
  await env.CACHE.put(offKey, String(next));
}

// 수동 트리거(admin/warm)·초기화용: 전부 순차 실행.
async function warmCaches(env: Env): Promise<void> {
  await warmCore();
  await warmRecentSido(enabledDatasets().map((d) => d.key));
  await warmRegions();
  await warmRegionsPast();
  await warmComplexes(env);
}

function buildBackfillJobs(months: number): BackfillJob[] {
  const ymds = recentMonths(months);
  const datasets = enabledDatasets().map((d) => d.key);
  const jobs: BackfillJob[] = [];
  for (const sggCd of SGG_CODES) {
    jobs.push({ type: "complexes", sggCd });
    for (const dataset of datasets) {
      for (const dealYmd of ymds) jobs.push({ type: "trades", sggCd, dataset, dealYmd });
    }
  }
  return jobs;
}

// 당월 거래 단지 전부를 단지모달 KV 워밍 작업으로 큐 적재 (큐가 분산 처리 → subrequest 한도 회피).
async function enqueueComplexWarm(env: Env): Promise<void> {
  const curM = curYmd();
  // 큐 기반(subrequest 한도 무관) → 전 데이터셋 당월 거래 단지를 모두 워밍 대상으로.
  const jobs: BackfillJob[] = [];
  for (const d of enabledDatasets()) {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT sgg_cd, apt_name FROM transactions WHERE dataset=? AND deal_ymd=?`
    ).bind(d.key, curM).all();
    for (const r of results as { sgg_cd: string; apt_name: string }[])
      jobs.push({ type: "warmcomplex", sggCd: r.sgg_cd, apt: r.apt_name, dataset: d.key, dealYmd: curM } as BackfillJob);
  }
  await enqueue(env, jobs);
}

async function enqueue(env: Env, jobs: BackfillJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += 100) {
    const batch = jobs.slice(i, i + 100).map((body) => ({ body }));
    await env.BACKFILL_Q.sendBatch(batch);
  }
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(4, 6));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(4, 6));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    if (out.length > 60) break;
  }
  return out;
}

export default {
  fetch: app.fetch,

  // 1일 1회(분 stagger). subrequest 한도(1000/invocation) 회피 위해 워밍을 cron 별로 분할.
  //   30 0 → 백필(당월+전월) + 코어 워밍(대시보드/통계/오늘의실거래 전국·서울 30일, 전 데이터셋)
  //   32 0 → 오늘의실거래 시도탭 aptTrade × 31일 (16시도 = 496요청)
  //   34 0 → 지역상세 당월: 거래목록+단지지도+추이+단지목록 (128×4 = 512요청)
  //   36 0 → 지역상세 과거2월: 거래목록+단지지도 (128×2×2 = 512요청)
  //   42 0 → 단지 상세 모달 KV 워밍(큐 분산)
  // CDN 용량은 2천 한계 아님(실측: today's-deals 1674 + 지역상세 512 + 코어 동시 sticky HIT 확인).
  // → long-tail(지역상세·시도탭)도 CDN+KV 에 워밍해 콜드 제거. 각 cron 은 subrequest 한도 내(≤512).
  // 참고: aptRent/silvTrade 시도탭은 트래픽 적어 cron 제외(warmCore 가 전국/서울은 커버, SWR 7일).
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === "32 0 * * *") {
      // 오늘의실거래 시도탭: 매매 31일 + 전월세·분양권 7일 (한도 내, 720req)
      ctx.waitUntil((async () => {
        await warmRecentSido(["aptTrade"]);
        await warmRecentSido(["aptRent", "silvTrade"], 7);
      })());
    } else if (event.cron === "34 0 * * *") {
      ctx.waitUntil(warmRegions(["aptTrade", "aptRent"])); // 당월: 매매 full + 전월세 tx/range
    } else if (event.cron === "36 0 * * *") {
      ctx.waitUntil((async () => {
        await warmRegionsPast(["aptTrade"]); // 과거 2개월 매매
        await warmRegions(["silvTrade"]);    // 당월 분양권 tx/range
      })());
    } else if (event.cron === "42 0 * * *") {
      ctx.waitUntil(enqueueComplexWarm(env)); // 단지 상세 모달 KV 워밍(당월 단지 전부, 큐 분산)
    } else {
      ctx.waitUntil(enqueue(env, buildBackfillJobs(2)));
      ctx.waitUntil(warmCore());              // 대시보드/통계/오늘의실거래 전국·서울 30일
    }
  },

  // Queue 소비자: 백필 작업 처리
  async queue(batch: MessageBatch<BackfillJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleJob(env, msg.body);
        msg.ack();
      } catch (e) {
        console.error("backfill job failed", msg.body, e);
        msg.retry();
      }
    }
  },
};
