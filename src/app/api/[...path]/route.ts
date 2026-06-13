// Vercel Edge(ICN/서울) 프록시: CF 워커(api.zihado.com) 응답을 Vercel 서울 엣지에
// 캐시(s-maxage)해서 서빙. 재요청은 ICN 엣지에서 ~7ms RTT 로 직접 응답.
export const runtime = "edge";

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
  // 수집 중(no-store) 응답은 캐시 금지, 그 외는 ICN 엣지 CDN 캐시
  const upstreamCC = upstream.headers.get("cache-control") || "";
  h.set(
    "cache-control",
    upstreamCC.includes("no-store")
      ? "no-store"
      : "public, s-maxage=300, stale-while-revalidate=600"
  );
  h.set("access-control-allow-origin", "*");
  return new Response(body, { status: upstream.status, headers: h });
}
