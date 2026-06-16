// 임시 인리전 성능 측정 — icn1 함수에서 HTTP/2 영속 세션으로 메뉴 TTFB.
// 단일 h2 connection 재사용(재핸드셰이크 0) → 연결 churn 스파이크 제거 검증.
import { NextRequest } from "next/server";
import http2 from "node:http2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MENUS = [
  "/", "/lab", "/today", "/stats", "/complex", "/map", "/presale", "/rent",
  "/lab/top", "/lab/rise", "/lab/decline", "/lab/hot-complex", "/lab/gap", "/lab/rent-yield", "/lab/presale-compare",
];

function h2get(client: http2.ClientHttp2Session, path: string): Promise<{ status: number; ttfb: number; cache: string }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = client.request({ ":path": path, "accept-encoding": "gzip, br", "user-agent": "perf-probe-h2" });
    let ttfb = 0, status = 0, cache = "?";
    req.on("response", (h) => { ttfb = performance.now() - t0; status = Number(h[":status"]) || 0; cache = (h["x-vercel-cache"] as string) ?? "?"; });
    req.on("data", () => { /* drain */ });
    req.on("end", () => resolve({ status, ttfb, cache }));
    req.on("error", () => resolve({ status: 0, ttfb: 0, cache: "err" }));
    req.setTimeout(10_000, () => { req.close(); resolve({ status: 0, ttfb: 0, cache: "timeout" }); });
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(Math.max(Number(sp.get("n") ?? 200), 1), 500);
  const base = sp.get("base") ?? "https://land.zihado.com";
  const paths = sp.get("paths") ? sp.get("paths")!.split(",") : MENUS;

  const client = http2.connect(base);
  await new Promise<void>((res, rej) => { client.on("connect", () => res()); client.on("error", rej); });

  const pct = (a: number[], q: number) => a.length ? a[Math.min(a.length - 1, Math.round(a.length * q) - 1)] : 0;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const results = [];
  for (const p of paths) {
    for (let w = 0; w < 5; w++) await h2get(client, p); // 세션/엣지 워밍
    const ts: number[] = [];
    const cache: Record<string, number> = {};
    let status = 0;
    for (let i = 0; i < n; i++) {
      const r = await h2get(client, p);
      status = r.status;
      if (r.status === 200) { ts.push(r.ttfb); cache[r.cache] = (cache[r.cache] ?? 0) + 1; }
    }
    ts.sort((a, b) => a - b);
    results.push({ p, n: ts.length, status, cache, p50: r1(pct(ts, 0.5)), p90: r1(pct(ts, 0.9)), p95: r1(pct(ts, 0.95)), p99: r1(pct(ts, 0.99)), max: r1(ts[ts.length - 1] ?? 0) });
  }
  client.close();
  return Response.json({ base, region: process.env.VERCEL_REGION ?? "?", proto: "h2", results });
}
