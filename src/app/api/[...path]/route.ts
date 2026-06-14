// Vercel Edge(ICN/서울) 프록시: CF 워커(api.zihado.com) 응답을 Vercel 서울 엣지에
// 캐시(s-maxage)해서 서빙. 재요청은 ICN 엣지에서 ~7ms RTT 로 직접 응답.
//
// filling 쇼트서킷: 캐시 MISS 일 때만 이 함수가 실행된다(HIT 는 CDN 이 함수 없이 응답).
// MISS 중 "아직 적재 안 된 구·월"은 도쿄 왕복 없이 서울에서 즉시 filling 응답(≤15ms) +
// 백그라운드 워커 적재 트리거. 판별용 manifest 는 워커 /api/ingested 를 서울엣지 캐시(워밍 cron 이
// 데움)에서 읽어 모듈 스코프 60s 캐시 → 프로비저닝/시크릿 없이 배포 즉시 동작.
import { after } from "next/server";

export const runtime = "edge";
// 함수 실행 리전을 서울로 고정 → 캐시 MISS 시 ICN 함수 → 도쿄 CF (싱가포르 우회 제거)
export const preferredRegion = ["icn1"];

const ORIGIN = process.env.WORKER_ORIGIN || "https://api.zihado.com";

// 적재 manifest: ds -> ym -> [적재된 시군구코드]. 워커 /api/ingested 가 출처(ingest_log).
type Manifest = Record<string, Record<string, string[]>>;
let _man: { t: number; data: Manifest | null } = { t: 0, data: null };

// 서울엣지 캐시된 /api/ingested 에서 manifest 읽기(모듈 60s 캐시). 느리거나 실패 시 null →
// 쇼트서킷 비활성(정상 프록시, 무회귀). origin 은 공개 호스트(self) → 서울엣지 HIT.
async function manifest(origin: string): Promise<Manifest | null> {
  const now = Date.now();
  if (now - _man.t < 60_000) return _man.data;
  try {
    const r = await fetch(`${origin}/api/ingested?months=13`, { signal: AbortSignal.timeout(800) });
    const j = (r.ok ? await r.json() : null) as { ingested?: Manifest } | null;
    _man = { t: now, data: j?.ingested ?? null };
  } catch {
    _man = { t: now, data: null };
  }
  return _man.data;
}

// "데이터 없음" 이 확실할 때만 true: 해당 월이 manifest 에 있고(=권위 있음) 그 구가 목록에 없음.
// 월 자체가 manifest 에 없으면(윈도우 밖) 모름 → false → 정상 프록시(워커가 판별).
function definitelyMissing(man: Manifest | null, ds: string, region: string, ym: string): boolean {
  const list = man?.[ds]?.[ym];
  if (!list) return false;
  return !list.includes(region);
}

function jsonResp(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store", // filling 은 캐시 금지(데이터 도착 후 정상 응답으로 교체돼야)
      "access-control-allow-origin": "*",
    },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;

  // 드릴다운 거래목록/추이만 쇼트서킷 대상(filling 응답 형태가 정의된 엔드포인트).
  if (p === "/api/transactions" || p === "/api/transactions/range") {
    const ds = url.searchParams.get("dataset") || "aptTrade";
    const region = url.searchParams.get("region") || "";
    const ym = url.searchParams.get("yyyymm") || url.searchParams.get("to") || "";
    if (region && ym) {
      const man = await manifest(url.origin);
      if (definitelyMissing(man, ds, region, ym)) {
        // 백그라운드 적재 트리거(워커 GET miss → enqueue). 응답은 서울에서 즉시.
        after(() => fetch(`${ORIGIN}${p}${url.search}`, { headers: { "accept-encoding": "br, gzip" } }).catch(() => {}));
        return jsonResp(
          p === "/api/transactions/range"
            ? { dataset: ds, region, trend: [], filling: true }
            : { dataset: ds, region, yyyymm: ym, source: "filling", count: 0, items: [], filling: true }
        );
      }
    }
  }

  const target = `${ORIGIN}${p}${url.search}`;
  const upstream = await fetch(target, { headers: { "accept-encoding": "br, gzip" } });
  const body = await upstream.arrayBuffer();
  const h = new Headers();
  h.set("content-type", upstream.headers.get("content-type") || "application/json");
  const upstreamCC = upstream.headers.get("cache-control") || "";
  if (upstreamCC.includes("no-store")) {
    h.set("cache-control", "no-store");
  } else {
    const m = /max-age=(\d+)/.exec(upstreamCC);
    const sMaxage = m ? Math.max(60, parseInt(m[1], 10)) : 300;
    const cdn = `public, s-maxage=${sMaxage}, stale-while-revalidate=604800`;
    // Vercel CDN(서울 엣지)이 캐시하도록: Vercel-CDN-Cache-Control 이 최우선.
    // 브라우저는 항상 엣지 재검증(작은 max-age) → HIT 시 ~수ms.
    h.set("vercel-cdn-cache-control", cdn);
    h.set("cdn-cache-control", cdn);
    h.set("cache-control", "public, max-age=0, must-revalidate");
  }
  h.set("access-control-allow-origin", "*");
  return new Response(body, { status: upstream.status, headers: h });
}
