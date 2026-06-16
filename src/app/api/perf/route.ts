// 임시 인리전 성능 측정 — icn1 함수에서 메뉴 페이지 TTFB 를 잰다.
// Vercel 내부 IP(신선·WAF 미플래그) + icn1↔icn1 ~0 RTT + undici keepalive(연결 재사용).
// 호출은 단발 1회면 되고, 무거운 측정은 함수 내부(클린)에서 수행.
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MENUS = [
  "/", "/lab", "/today", "/stats", "/complex", "/map", "/presale", "/rent",
  "/lab/top", "/lab/rise", "/lab/decline", "/lab/hot-complex", "/lab/gap", "/lab/rent-yield", "/lab/presale-compare",
];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(Math.max(Number(sp.get("n") ?? 120), 1), 400);
  const base = sp.get("base") ?? "https://land.zihado.com";
  const paths = sp.get("paths") ? sp.get("paths")!.split(",") : MENUS;
  const H = { "Accept-Encoding": "gzip, br", "User-Agent": "perf-probe-icn1" };

  const pct = (a: number[], q: number) => a.length ? a[Math.min(a.length - 1, Math.round(a.length * q) - 1)] : 0;
  const results = [];
  for (const p of paths) {
    const url = base + p;
    for (let w = 0; w < 3; w++) { try { await (await fetch(url, { headers: H, cache: "no-store" })).arrayBuffer(); } catch { /* */ } }
    const ts: number[] = [];
    const cache: Record<string, number> = {};
    let status = 0;
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      try {
        const r = await fetch(url, { headers: H, cache: "no-store" });
        const ttfb = performance.now() - t0; // 헤더 수신 = TTFB
        status = r.status;
        const cv = r.headers.get("x-vercel-cache") ?? "?";
        await r.arrayBuffer();
        if (r.status === 200) { ts.push(ttfb); cache[cv] = (cache[cv] ?? 0) + 1; }
      } catch { /* skip */ }
    }
    ts.sort((a, b) => a - b);
    const r1 = (x: number) => Math.round(x * 10) / 10;
    results.push({
      p, n: ts.length, status, cache,
      p50: r1(pct(ts, 0.5)), p90: r1(pct(ts, 0.9)), p95: r1(pct(ts, 0.95)), p99: r1(pct(ts, 0.99)), max: r1(ts[ts.length - 1] ?? 0),
    });
  }
  return Response.json({ base, region: process.env.VERCEL_REGION ?? "?", results });
}
