// 임시 인리전 성능 측정 — icn1 함수에서 메뉴 페이지 TTFB.
// node:https keepAlive Agent(maxSockets:1) → 단일 연결 재사용 → 연결 churn 스파이크 제거.
import { NextRequest } from "next/server";
import https from "node:https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MENUS = [
  "/", "/lab", "/today", "/stats", "/complex", "/map", "/presale", "/rent",
  "/lab/top", "/lab/rise", "/lab/decline", "/lab/hot-complex", "/lab/gap", "/lab/rent-yield", "/lab/presale-compare",
];

const agent = new https.Agent({ keepAlive: true, maxSockets: 1, keepAliveMsecs: 60_000 });

function timedGet(url: string): Promise<{ status: number; ttfb: number; cache: string }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const r = https.get(url, { agent, headers: { "accept-encoding": "gzip, br", "user-agent": "perf-probe-icn1" } }, (res) => {
      const ttfb = performance.now() - t0; // 응답 헤더 수신 = TTFB
      const cache = (res.headers["x-vercel-cache"] as string) ?? "?";
      const status = res.statusCode ?? 0;
      res.on("data", () => { /* drain */ });
      res.on("end", () => resolve({ status, ttfb, cache }));
      res.on("error", () => resolve({ status, ttfb, cache }));
    });
    r.on("error", () => resolve({ status: 0, ttfb: 0, cache: "err" }));
    r.setTimeout(10_000, () => { r.destroy(); resolve({ status: 0, ttfb: 0, cache: "timeout" }); });
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(Math.max(Number(sp.get("n") ?? 120), 1), 400);
  const base = sp.get("base") ?? "https://land.zihado.com";
  const paths = sp.get("paths") ? sp.get("paths")!.split(",") : MENUS;

  const pct = (a: number[], q: number) => a.length ? a[Math.min(a.length - 1, Math.round(a.length * q) - 1)] : 0;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const results = [];
  for (const p of paths) {
    const url = base + p;
    for (let w = 0; w < 5; w++) await timedGet(url); // 연결 워밍
    const ts: number[] = [];
    const cache: Record<string, number> = {};
    let status = 0;
    for (let i = 0; i < n; i++) {
      const r = await timedGet(url);
      status = r.status;
      if (r.status === 200) { ts.push(r.ttfb); cache[r.cache] = (cache[r.cache] ?? 0) + 1; }
    }
    ts.sort((a, b) => a - b);
    results.push({
      p, n: ts.length, status, cache,
      p50: r1(pct(ts, 0.5)), p90: r1(pct(ts, 0.9)), p95: r1(pct(ts, 0.95)), p99: r1(pct(ts, 0.99)), max: r1(ts[ts.length - 1] ?? 0),
    });
  }
  return Response.json({ base, region: process.env.VERCEL_REGION ?? "?", results });
}
