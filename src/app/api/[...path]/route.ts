// Vercel Edge(ICN/서울) 프록시: CF 워커(api.zihado.com) 응답을 Vercel 서울 엣지에
// 캐시(s-maxage)해서 서빙. 재요청은 ICN 엣지에서 ~7ms RTT 로 직접 응답.
export const runtime = "edge";
// 함수 실행 리전을 서울로 고정 → 캐시 MISS 시 ICN 함수 → 도쿄 CF (싱가포르 우회 제거)
export const preferredRegion = ["icn1"];

const ORIGIN = process.env.WORKER_ORIGIN || "https://api.zihado.com";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = `${ORIGIN}${url.pathname}${url.search}`;
  const upstream = await fetch(target, {
    headers: { "accept-encoding": "br, gzip" },
  });
  const body = await upstream.arrayBuffer();
  const h = new Headers();
  h.set("content-type", upstream.headers.get("content-type") || "application/json");
  const upstreamCC = upstream.headers.get("cache-control") || "";
  if (upstreamCC.includes("no-store")) {
    h.set("cache-control", "no-store");
  } else {
    // 업스트림 max-age 를 그대로 s-maxage 로 사용(과거 날짜=장기). 만료돼도 SWR 로
    // 캐시본 즉시 서빙 + 백그라운드 갱신 → 사용자는 MISS 대기 안 함(최초 1회만).
    const m = /max-age=(\d+)/.exec(upstreamCC);
    const sMaxage = m ? Math.max(60, parseInt(m[1], 10)) : 300;
    h.set("cache-control", `public, s-maxage=${sMaxage}, stale-while-revalidate=604800`);
  }
  h.set("access-control-allow-origin", "*");
  return new Response(body, { status: upstream.status, headers: h });
}
