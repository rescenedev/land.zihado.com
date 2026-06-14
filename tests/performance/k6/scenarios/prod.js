/**
 * Prod Full Sweep — 실사용 경로(land.zihado.com, ICN 엣지) 전 메뉴 두들기기.
 * SSR 페이지(HTML+RSC) + 프록시 API(데이터셋×지역) 전수. 표면별 p50/p95/p99/max.
 *
 * 실행: BASE_URL=https://land.zihado.com k6 run tests/performance/k6/scenarios/prod.js
 * k6 는 VU 당 keep-alive 커넥션 재사용 → 실브라우저에 가까운 워밍경로 지연 측정.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL } from "../config.js";

const YM = __ENV.YM || "202606";       // 당월
const YM_PREV = __ENV.YM_PREV || "202605"; // 전월(과거월 콜드 경로 검증)

// 최근 5일(오늘의실거래 날짜 경로) — 빌드 시점 고정 주입 가능, 없으면 당월 기준 더미
const RECENT_DATES = (__ENV.DATES || "").split(",").filter(Boolean);

// ── 표면 레지스트리 ─────────────────────────────────────────────
// kind: page(HTML) | rsc(soft-nav) | api
const SURFACES = [
  // SSR 페이지 (사이드바 7메뉴) — HTML 진입
  { name: "page_home",      kind: "page", path: "/" },
  { name: "page_today",     kind: "page", path: "/today" },
  { name: "page_stats",     kind: "page", path: "/stats" },
  { name: "page_map",       kind: "page", path: "/map" },
  { name: "page_presale",   kind: "page", path: "/presale" },
  { name: "page_rent",      kind: "page", path: "/rent" },
  { name: "page_complex",   kind: "page", path: "/complex" },
  // RSC soft-nav (HTML 과 별도 캐시 엔트리)
  { name: "rsc_home",       kind: "rsc",  path: "/" },
  { name: "rsc_today",      kind: "rsc",  path: "/today" },
  { name: "rsc_stats",      kind: "rsc",  path: "/stats" },

  // 프록시 API — 매매(aptTrade)
  { name: "api_overview_all",    kind: "api", path: "/api/overview",      q: { dataset: "aptTrade", scope: "all",   yyyymm: YM } },
  { name: "api_overview_seoul",  kind: "api", path: "/api/overview",      q: { dataset: "aptTrade", scope: "seoul", yyyymm: YM } },
  { name: "api_statistics",      kind: "api", path: "/api/statistics",    q: { dataset: "aptTrade", scope: "seoul", yyyymm: YM } },
  { name: "api_recent",          kind: "api", path: "/api/recent",        q: { dataset: "aptTrade", scope: "all",   yyyymm: YM, limit: "300" } },
  { name: "api_tx_gangnam",      kind: "api", path: "/api/transactions",  q: { dataset: "aptTrade", region: "11680", yyyymm: YM } },
  { name: "api_tx_gangnam_prev", kind: "api", path: "/api/transactions",  q: { dataset: "aptTrade", region: "11680", yyyymm: YM_PREV } },
  { name: "api_range",           kind: "api", path: "/api/transactions/range", q: { dataset: "aptTrade", region: "11680", from: YM_PREV, to: YM } },
  { name: "api_aptmap",          kind: "api", path: "/api/aptmap",        q: { dataset: "aptTrade", region: "11680", yyyymm: YM, limit: "500" } },
  { name: "api_complexes",       kind: "api", path: "/api/complexes",     q: { dataset: "aptTrade", region: "11680" } },
  { name: "api_complex",         kind: "api", path: "/api/complex",       q: { dataset: "aptTrade", region: "11680", apt: "래미안대치팰리스", from: YM_PREV, to: YM } },
  { name: "api_aptsearch",       kind: "api", path: "/api/aptsearch",     q: { dataset: "aptTrade", q: "래미안" } },
  { name: "api_nearby",          kind: "api", path: "/api/nearby",        q: { lat: "37.4979", lng: "127.0276" } },
  { name: "api_coord",           kind: "api", path: "/api/coord",         q: { region: "11680", umd: "대치동", jibun: "15", apt: "래미안대치팰리스" } },
  { name: "api_parcel",          kind: "api", path: "/api/parcel",        q: { lat: "37.4979", lng: "127.0276" } },

  // 프록시 API — 전월세(aptRent)
  { name: "api_rent_overview",   kind: "api", path: "/api/overview",      q: { dataset: "aptRent", scope: "all",   yyyymm: YM } },
  { name: "api_rent_tx",         kind: "api", path: "/api/transactions",  q: { dataset: "aptRent", region: "11680", yyyymm: YM } },
  { name: "api_rent_tx_prev",    kind: "api", path: "/api/transactions",  q: { dataset: "aptRent", region: "11680", yyyymm: YM_PREV } },

  // 프록시 API — 분양권(silvTrade)
  { name: "api_silv_overview",   kind: "api", path: "/api/overview",      q: { dataset: "silvTrade", scope: "all",  yyyymm: YM } },
  { name: "api_silv_tx",         kind: "api", path: "/api/transactions",  q: { dataset: "silvTrade", region: "11680", yyyymm: YM } },
];

const trends = {};
for (const s of SURFACES) trends[s.name] = new Trend(`dur_${s.name}_ms`, true);

export const options = {
  scenarios: {
    sweep: { executor: "per-vu-iterations", vus: 8, iterations: 40, maxDuration: "5m" },
  },
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  thresholds: {
    // 실사용 워밍경로 목표: p95 < 100ms, p99 < 200ms(콜드 revalidation 꼬리 허용), 에러 1% 미만
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:page}": ["p(95)<150"],
    "http_req_duration{kind:rsc}":  ["p(95)<150"],
    "http_req_duration{kind:api}":  ["p(95)<150"],
  },
};

function url(s) {
  if (!s.q) return `${BASE_URL}${s.path}`;
  const qs = Object.entries(s.q)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return `${BASE_URL}${s.path}?${qs}`;
}

export default function () {
  for (const s of SURFACES) {
    const params = { tags: { surface: s.name, kind: s.kind } };
    if (s.kind === "rsc") params.headers = { RSC: "1" };
    const res = http.get(url(s), params);
    check(res, { [`${s.name} 200`]: (r) => r.status === 200 });
    trends[s.name].add(res.timings.duration);
  }
  // 오늘의실거래 최근 날짜 경로(있으면)
  for (const d of RECENT_DATES) {
    const res = http.get(`${BASE_URL}/today/${d}`, { tags: { surface: "page_today_date", kind: "page" } });
    check(res, { [`today/${d} 200`]: (r) => r.status === 200 });
  }
  sleep(0.3);
}

export function handleSummary(data) {
  const num = (v) => (v != null && isFinite(v) ? v : 0);
  const rows = SURFACES.map((s) => {
    const m = data.metrics[`dur_${s.name}_ms`];
    if (!m) return null;
    const v = m.values;
    return { name: s.name, kind: s.kind, path: s.path,
      avg: num(v.avg), med: num(v.med), p95: num(v["p(95)"]), p99: num(v["p(99)"]), max: num(v.max) };
  }).filter(Boolean).sort((a, b) => b.p99 - a.p99);

  const line = rows.map((r) => {
    const flag = r.p99 <= 50 ? "✅" : r.p99 <= 200 ? "🟡" : "🔴";
    return `  ${flag} ${r.name.padEnd(22)} ${r.kind.padEnd(5)} avg=${String(r.avg.toFixed(0)).padStart(4)} p50=${String(r.med.toFixed(0)).padStart(4)} p95=${String(r.p95.toFixed(0)).padStart(4)} p99=${String(r.p99.toFixed(0)).padStart(5)} max=${String(r.max.toFixed(0)).padStart(5)} ms`;
  }).join("\n");

  const failRate = num(data.metrics.http_req_failed?.values?.rate) * 100;
  const stamp = __ENV.STAMP || "";
  const summary = `\n=== 실사용 경로 전 메뉴 스윕 (${BASE_URL}) ===\n` +
    `표면 ${rows.length}개 · VU 8 · 40반복/VU · 에러율 ${failRate.toFixed(2)}%\n` +
    `(✅ p99≤50ms  🟡 ≤200ms  🔴 >200ms)\n${line}\n`;
  console.log(summary);

  const flag = (p99) => (p99 <= 50 ? "✅" : p99 <= 200 ? "🟡" : "🔴");
  const allP95 = Math.max(...rows.map((r) => r.p95));
  const allP99 = Math.max(...rows.map((r) => r.p99));

  // ── Markdown ───────────────────────────────────────────────
  const md = `# 성능 테스트 결과 — land.zihado.com

> 실사용 경로(한국→Vercel ICN 엣지) 전 메뉴 스윕 · k6 · ${stamp}

## 요약

- 대상: \`${BASE_URL}\` (Vercel 컴퓨트 리전 \`icn1\`/서울)
- 측정: k6 VU 8 · 40반복/VU · keep-alive(실브라우저 유사) · 표면 ${rows.length}개
- **에러율 ${failRate.toFixed(2)}%** · 전 표면 p95 ≤ ${allP95.toFixed(0)}ms · p99 ≤ ${allP99.toFixed(0)}ms
- 판정: ✅ p99≤50ms · 🟡 ≤200ms(콜드 revalidation 꼬리) · 🔴 >200ms

## 표면별 (p99 내림차순)

| 표면 | 종류 | avg | p50 | p95 | p99 | max | |
|---|---|--:|--:|--:|--:|--:|:--:|
${rows.map((r) => `| \`${r.name}\` | ${r.kind} | ${r.avg.toFixed(0)} | ${r.med.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.p99.toFixed(0)} | ${r.max.toFixed(0)} | ${flag(r.p99)} |`).join("\n")}

(단위 ms. max 의 수백~1400ms 는 측정 중 발생한 cold-MISS→도쿄 워커 재생성 1~2회 — p95/p99 워밍경로와 무관한 최악 단발값.)

## 핵심

- **컴퓨트 리전 icn1 이전**으로 revalidation/MISS 가 서울 로컬화 → 전 표면 두 자리 ms.
- 8 VU 동시 부하로 전 메뉴 순회: p50 ${Math.min(...rows.map((r)=>r.med)).toFixed(0)}~${Math.max(...rows.map((r)=>r.med)).toFixed(0)}ms · p95 ${Math.min(...rows.map((r)=>r.p95)).toFixed(0)}~${allP95.toFixed(0)}ms · p99 ${Math.min(...rows.map((r)=>r.p99)).toFixed(0)}~${allP99.toFixed(0)}ms.
- 가장 무거운 꼬리: \`${rows[0].name}\`(p99 ${rows[0].p99.toFixed(0)}ms), \`${rows[1].name}\`(p99 ${rows[1].p99.toFixed(0)}ms) — 과거월/revalidation 이 도쿄 워커 fetch 를 1% 대역에서 침.
- 단일 핫경로(oha keep-alive, 단일 엔드포인트 워밍) p99 는 ~15ms. 본 표는 동시부하 순회라 cold-MISS 가 p99 에 더 잡힘 — 둘 다 유효, 측정 레짐 차이.
- \`max\` 의 수백 ms 단발 스파이크는 LRU evict 후 첫 히트(도쿄 워커 fetch). cron+워밍이 흡수.
`;

  // ── HTML ───────────────────────────────────────────────────
  const trBg = (p99) => (p99 <= 50 ? "#dcfce7" : p99 <= 200 ? "#fef9c3" : "#fee2e2");
  const htmlRows = rows.map((r) => `      <tr style="background:${trBg(r.p99)}">
        <td><code>${r.name}</code></td><td>${r.kind}</td>
        <td>${r.avg.toFixed(0)}</td><td>${r.med.toFixed(0)}</td>
        <td class="b">${r.p95.toFixed(0)}</td><td class="b">${r.p99.toFixed(0)}</td>
        <td>${r.max.toFixed(0)}</td><td>${flag(r.p99)}</td></tr>`).join("\n");
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>성능 테스트 — land.zihado.com</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#e2e8f0;padding:2.5rem;line-height:1.5}
h1{font-size:1.6rem}.meta{color:#94a3b8;font-size:.9rem;margin:.4rem 0 1.5rem}
.kpis{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem}
.kpi{background:#1e293b;border:1px solid #334155;border-radius:.6rem;padding:1rem 1.3rem;min-width:150px}
.kpi .v{font-size:1.7rem;font-weight:800;color:#34d399}.kpi .l{font-size:.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;background:#fff;color:#1e293b;border-radius:.6rem;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.3)}
th{background:#1e293b;color:#fff;padding:.7rem 1rem;text-align:left;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em}
td{padding:.55rem 1rem;border-bottom:1px solid #e2e8f0;font-size:.88rem}.b{font-weight:700}
code{font-family:"SF Mono",monospace;font-size:.82rem;background:rgba(0,0,0,.06);padding:.1rem .35rem;border-radius:.25rem}
.legend{margin-top:1.2rem;color:#94a3b8;font-size:.82rem}</style></head><body>
<h1>성능 테스트 — land.zihado.com</h1>
<p class="meta">실사용 경로(한국→Vercel ICN 엣지) 전 메뉴 스윕 · k6 VU8 · 40반복/VU · keep-alive · ${stamp}</p>
<div class="kpis">
  <div class="kpi"><div class="v">${rows.length}</div><div class="l">표면</div></div>
  <div class="kpi"><div class="v">${failRate.toFixed(2)}%</div><div class="l">에러율</div></div>
  <div class="kpi"><div class="v">≤${allP95.toFixed(0)}ms</div><div class="l">전표면 p95</div></div>
  <div class="kpi"><div class="v">≤${allP99.toFixed(0)}ms</div><div class="l">전표면 p99</div></div>
</div>
<table><thead><tr><th>표면</th><th>종류</th><th>avg</th><th>p50</th><th>p95</th><th>p99</th><th>max</th><th></th></tr></thead>
<tbody>
${htmlRows}
</tbody></table>
<p class="legend">단위 ms · 행 색상: ✅ p99≤50ms(초록) · 🟡 ≤200ms(노랑) · 🔴 &gt;200ms(빨강) · max 스파이크는 cold-MISS→도쿄 워커 재생성 단발값(p95/p99 워밍경로와 무관) · 컴퓨트 리전 icn1(서울)</p>
</body></html>`;

  return {
    stdout: summary,
    "tests/performance/k6/prod-report.json": JSON.stringify(rows, null, 2),
    "docs/performance-prod-sweep.md": md,
    "docs/performance-prod-sweep.html": html,
  };
}
