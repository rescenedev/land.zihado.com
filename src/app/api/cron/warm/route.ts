// Vercel 서울(icn1) 엣지 워밍 cron — 사용자가 닿는 모든 GET 을 Vercel CDN 서울 엣지에 미리 적재.
//
// 왜 별도 cron 인가 (핵심):
//  - Vercel CDN 캐시는 colo(POP)별. "서울 엣지" 를 데우려면 요청이 icn1 POP 으로 들어와야 한다.
//  - 워커(CF) cron 이 land.zihado.com 을 fetch 하면 CF egress 기준 POP(도쿄/HK)을 데움 → 서울 POP 은
//    안 데워짐. 그래서 트래픽 적은 URL(구 드릴다운·통계·시도탭·과거월)은 한국 사용자에게 항상
//    서울엣지 MISS → 도쿄 워커 왕복(~60-400ms, 콜드 1.2s)이었다.
//  - 이 함수는 icn1(AWS 서울)에서 돌며 공개 호스트를 self-fetch → 서울 POP 에 적재 → 이후 실사용자
//    서울엣지 HIT(keep-alive 실측 ~11-15ms). 워커는 자기 KV(글로벌 바닥)를 계속 데움(이중화).
//
// ⚠️ 캐시 키는 프론트(src/lib/api.ts, ssr.ts)의 URL 과 1바이트도 다르면 안 됨(param 순서·값·인코딩 동일).
// ⚠️ 워커(CF) 백필이 당월+과거2월 전 구를 매일 00:30 UTC 적재(filling 제거) → 이 cron 은 02:00 UTC
//    에 돌아 워커 KV 가 더워진 뒤 적재(vercel.json crons). filling(미수집) 응답은 no-store 라 미적재.
// ⚠️ long-tail 다량 적재 → 핫 코어 evict 우려. 코어를 먼저 굽고(시간예산 보장), 실사용 트래픽이
//    코어를 sticky 유지. 배포 후 코어 x-vercel-cache HIT 유지 모니터(scripts/monitor.py).
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // AWS icn1 IP 로 egress → 서울 엣지로 되돌아옴
export const preferredRegion = ["icn1"];
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ORIGIN = process.env.WARM_ORIGIN || "https://land.zihado.com";
const ALL_DS = ["aptTrade", "aptRent", "silvTrade"];
// 통계/오늘의실거래 시도탭 (src/lib/api.ts WARM 대상과 동일). 한글은 fetch 가 UTF-8 percent-encode →
// encodeURIComponent 와 동일 키.
const SIDOS = ["all", "seoul", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
  "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const SSR_PAGES = ["/", "/today", "/stats", "/rent", "/presale", "/map", "/complex"];

// 프론트 ymdOf(new Date()) 와 동일: KST 당월 YYYYMM.
function kstNow(): Date { return new Date(Date.now() + 9 * 3600 * 1000); }
function kstYmd(): string {
  const k = kstNow();
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(yyyymm: string, delta: number): string {
  let y = Number(yyyymm.slice(0, 4));
  let m = Number(yyyymm.slice(4, 6)) + delta;
  while (m <= 0) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}${String(m).padStart(2, "0")}`;
}
// 오늘(KST)에서 i일 전 → {ymd:YYYYMMDD, date:YYYY-MM-DD}
function dayBack(i: number): { ymd: string; date: string } {
  const k = kstNow();
  const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - i));
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), dd = String(d.getUTCDate()).padStart(2, "0");
  return { ymd: `${y}${m}`, date: `${y}-${m}-${dd}` };
}

// 동시성 높여도 안전: icn1→서울엣지 캐시 적재(CDN write)는 워커 waitUntil KV-write-drop 과 무관
// (워커 KV 는 워커 자체 cron 이 저동시성으로 별도 확보). 콜드 부트 시간(>200s)을 줄이려 높게.
async function warm(urls: string[], conc = 20, rsc = false): Promise<number> {
  let ok = 0;
  const headers: Record<string, string> = { "accept-encoding": "br, gzip" };
  if (rsc) headers["RSC"] = "1";
  for (let i = 0; i < urls.length; i += conc) {
    const r = await Promise.allSettled(urls.slice(i, i + conc).map((u) => fetch(u, { headers })));
    ok += r.filter((x) => x.status === "fulfilled" && (x.value as Response).ok).length;
  }
  return ok;
}

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams;
  const monthCount = Math.min(Math.max(Number(q.get("months") ?? 3), 1), 3);
  const datasets = (q.get("datasets") ? q.get("datasets")!.split(",").map((s) => s.trim()) : ALL_DS)
    .filter((d) => ALL_DS.includes(d));
  const recentDays = Math.min(Math.max(Number(q.get("recentDays") ?? 30), 1), 31);
  const cur = kstYmd();
  const months = Array.from({ length: monthCount }, (_, i) => shiftMonth(cur, -i));
  const t0 = Date.now();
  const stat: Record<string, number> = {};

  // ── 1) 코어: overview / statistics / recent(전국·서울) — 대시보드·통계·오늘의실거래 진입 ──
  const core: string[] = [];
  for (const ds of datasets) {
    for (const ym of months) {
      core.push(`${ORIGIN}/api/overview?dataset=${ds}&scope=all&yyyymm=${ym}`);
      core.push(`${ORIGIN}/api/overview?dataset=${ds}&scope=seoul&yyyymm=${ym}`);
      for (const s of SIDOS)
        core.push(`${ORIGIN}/api/statistics?dataset=${ds}&scope=${encodeURIComponent(s)}&yyyymm=${ym}`);
    }
    core.push(`${ORIGIN}/api/recent?dataset=${ds}&scope=all&yyyymm=${cur}&limit=300`); // 대시보드 newByRegion(date 없음)
    for (let i = 0; i < recentDays; i++) {
      const { ymd, date } = dayBack(i);
      for (const s of ["all", "seoul"])
        core.push(`${ORIGIN}/api/recent?dataset=${ds}&scope=${s}&yyyymm=${ymd}&limit=300&date=${date}`);
    }
  }
  stat.core = await warm(core);

  // ── 2) 드릴다운: 구 거래목록 + 12개월 추이 (전 데이터셋 × 월 × 구). 가장 큰 long-tail ──
  const codesByDs: Record<string, string[]> = {};
  await Promise.all(datasets.map(async (ds) => {
    const ov = (await fetch(`${ORIGIN}/api/overview?dataset=${ds}&scope=all&yyyymm=${cur}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { regions?: { sggCd?: string }[] } | null;
    codesByDs[ds] = [...new Set((ov?.regions ?? []).map((r) => r.sggCd).filter(Boolean) as string[])];
  }));
  const region: string[] = [];
  for (const ds of datasets)
    for (const ym of months) {
      const from = shiftMonth(ym, -11);
      for (const cd of codesByDs[ds] ?? []) {
        region.push(`${ORIGIN}/api/transactions?dataset=${ds}&region=${cd}&yyyymm=${ym}`);
        region.push(`${ORIGIN}/api/transactions/range?dataset=${ds}&region=${cd}&from=${from}&to=${ym}`);
      }
    }
  stat.region = await warm(region);

  // ── 3) 오늘의실거래 시도탭: recent × 시도 × 최근일 (매매 full, 전월세/분양권 7일) ──
  const recentSido: string[] = [];
  const tabSidos = SIDOS.filter((s) => s !== "all" && s !== "seoul");
  for (const ds of datasets) {
    const days = ds === "aptTrade" ? recentDays : Math.min(7, recentDays);
    for (let i = 0; i < days; i++) {
      const { ymd, date } = dayBack(i);
      for (const s of tabSidos)
        recentSido.push(`${ORIGIN}/api/recent?dataset=${ds}&scope=${encodeURIComponent(s)}&yyyymm=${ymd}&limit=300&date=${date}`);
    }
  }
  stat.recentSido = await warm(recentSido);

  // ── 4) 지도/단지목록(aptTrade 당월) + SSR 페이지(HTML + RSC soft-nav) ──
  const extras: string[] = [];
  for (const cd of codesByDs["aptTrade"] ?? []) {
    extras.push(`${ORIGIN}/api/aptmap?dataset=aptTrade&region=${cd}&yyyymm=${cur}&limit=500`);
    extras.push(`${ORIGIN}/api/complexes?dataset=aptTrade&region=${cd}`);
  }
  stat.extras = await warm(extras);

  const pages = [...SSR_PAGES];
  for (let i = 1; i < 14; i++) pages.push(`/today/${dayBack(i).date}`);
  const pageUrls = pages.map((p) => ORIGIN + p);
  stat.ssrHtml = await warm(pageUrls);
  stat.ssrRsc = await warm(pageUrls, 20, true);

  const total = Object.values(stat).reduce((s, n) => s + n, 0);
  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "?",
    origin: ORIGIN,
    months,
    datasets,
    codes: Object.fromEntries(Object.entries(codesByDs).map(([k, v]) => [k, v.length])),
    warmed: stat,
    total,
    ms: Date.now() - t0,
  });
}
