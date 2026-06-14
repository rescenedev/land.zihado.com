// Vercel 서울(icn1) 엣지 워밍 cron — 구 드릴다운 거래목록/추이를 Vercel CDN 서울 엣지에 미리 캐시.
//
// 왜 별도 cron 인가:
//  - 워커(CF) cron 은 long-tail(구 transactions)을 WORKER_BASE(도쿄 KV)에만 굽는다.
//    → 한국 사용자의 첫 드릴다운은 항상 Vercel 서울엣지 MISS → 도쿄 워커 왕복(~60-120ms).
//  - Vercel CDN 캐시는 colo 별이라 "서울 엣지" 를 데우려면 요청이 icn1 POP 으로 들어와야 한다.
//    CF egress 는 icn1 을 보장 못 함 → 이 함수를 icn1(AWS 서울)에서 돌려 공개 호스트를 self-fetch
//    → icn1 엣지에 캐시 적재. 이후 실사용자는 서울엣지 HIT(~10ms).
//
// ⚠️ 캐시 키는 프론트(src/lib/api.ts)의 URL 과 1바이트도 다르면 안 됨(param 순서·값 동일).
// ⚠️ long-tail 을 CDN 에 과하게 구우면 핫 코어를 evict 할 수 있음 → 기본은 당월·매매로 bounded.
//    필요시 ?months=2&datasets=aptTrade,aptRent 로 확장(배포 후 코어 HIT 유지 확인).
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // AWS icn1 IP 로 egress → 서울 엣지로 되돌아옴
export const preferredRegion = ["icn1"];
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 실사용자가 접속하는 공개 호스트(엣지 캐시 키의 host). 배포 alias 가 아닌 운영 도메인 고정.
const ORIGIN = process.env.WARM_ORIGIN || "https://land.zihado.com";

// 프론트 ymdOf(new Date()) 와 동일: KST 기준 당월 YYYYMM (서버 UTC → +9h).
function kstYmd(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}
// 프론트 shiftMonth 와 동일.
function shiftMonth(yyyymm: string, delta: number): string {
  let y = Number(yyyymm.slice(0, 4));
  let m = Number(yyyymm.slice(4, 6)) + delta;
  while (m <= 0) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}${String(m).padStart(2, "0")}`;
}

// 동시 N개씩 fetch (엣지에 캐시 적재가 목적이라 응답 본문은 버림).
async function warm(urls: string[], conc = 8): Promise<number> {
  let ok = 0;
  for (let i = 0; i < urls.length; i += conc) {
    const r = await Promise.allSettled(
      urls.slice(i, i + conc).map((u) => fetch(u, { headers: { "accept-encoding": "br, gzip" } }))
    );
    ok += r.filter((x) => x.status === "fulfilled" && (x.value as Response).ok).length;
  }
  return ok;
}

export async function GET(req: Request): Promise<Response> {
  // Vercel cron 은 Authorization: Bearer ${CRON_SECRET} 를 보냄. 설정돼 있으면 검증.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams;
  const monthCount = Math.min(Math.max(Number(q.get("months") ?? 1), 1), 3); // 당월(+과거 N-1월)
  const datasets = (q.get("datasets") ?? "aptTrade").split(",").map((s) => s.trim()).filter(Boolean);
  const cur = kstYmd();
  const months = Array.from({ length: monthCount }, (_, i) => shiftMonth(cur, -i));

  // 전국 구 코드를 overview 에서 확보(이미 코어 워밍되는 호출 → 추가비용 ~0).
  const ov = (await fetch(`${ORIGIN}/api/overview?dataset=aptTrade&scope=all&yyyymm=${cur}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { regions?: { sggCd?: string }[] } | null;
  const codes = [...new Set((ov?.regions ?? []).map((r) => r.sggCd).filter(Boolean) as string[])];

  if (codes.length === 0) {
    return NextResponse.json({ ok: false, reason: "no region codes from overview", origin: ORIGIN }, { status: 200 });
  }

  // 프론트와 동일 URL: fetchTransactions / fetchTrend(from=shiftMonth(ym,-11)).
  const urls: string[] = [];
  for (const ds of datasets) {
    for (const ym of months) {
      const from = shiftMonth(ym, -11);
      for (const cd of codes) {
        urls.push(`${ORIGIN}/api/transactions?dataset=${ds}&region=${cd}&yyyymm=${ym}`);
        urls.push(`${ORIGIN}/api/transactions/range?dataset=${ds}&region=${cd}&from=${from}&to=${ym}`);
      }
    }
  }

  const t0 = Date.now();
  const warmed = await warm(urls);
  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "?",
    origin: ORIGIN,
    months,
    datasets,
    codes: codes.length,
    urls: urls.length,
    warmed,
    ms: Date.now() - t0,
  });
}
