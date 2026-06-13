/**
 * All Endpoints — 전체 API 응답속도 측정
 * 엔드포인트별 avg / p95 / p99 / max 측정 + HTML 리포트 생성
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { WORKER_URL } from "../config.js";
import { ENDPOINTS } from "../data/endpoints.js";

const trends = {};
for (const ep of ENDPOINTS) {
  trends[ep.name] = new Trend(`duration_${ep.name}_ms`, true);
}

export const options = {
  scenarios: {
    measure_all: {
      executor: "per-vu-iterations",
      vus: 3,
      iterations: 10,
      maxDuration: "3m",
    },
  },
  thresholds: Object.fromEntries(
    ENDPOINTS.map((ep) => [
      `duration_${ep.name}_ms`,
      ["p(95)<3000", "p(99)<5000"],
    ])
  ),
};

function buildUrl(path, params) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  const qs = pairs.join("&");
  return `${WORKER_URL}${path}${qs ? "?" + qs : ""}`;
}

export default function () {
  for (const ep of ENDPOINTS) {
    const url = buildUrl(ep.path, ep.params);

    const res = http.get(url, {
      tags: { endpoint: ep.name },
      responseCallback: http.expectedStatuses(ep.expectedStatus),
    });

    check(res, {
      [`${ep.name} → ${ep.expectedStatus}`]: (r) => r.status === ep.expectedStatus,
    });

    trends[ep.name].add(res.timings.duration);
  }

  sleep(0.5);
}

function statusBadge(p95, p99) {
  if (p95 > 2000) return { color: "#dc2626", label: "SLOW" };
  if (p95 > 500)  return { color: "#d97706", label: "WARN" };
  return { color: "#16a34a", label: "OK" };
}

export function handleSummary(data) {
  const num = (v) => (v != null && isFinite(v) ? v : 0);

  const rows = ENDPOINTS.map((ep) => {
    const m = data.metrics[`duration_${ep.name}_ms`];
    if (!m) return null;
    const v = m.values;
    return {
      name: ep.name,
      path: ep.path,
      avg: num(v.avg),
      med: num(v.med),
      p95: num(v["p(95)"]),
      p99: num(v["p(99)"]),
      max: num(v.max),
      min: num(v.min),
    };
  }).filter(Boolean);

  rows.sort((a, b) => b.p95 - a.p95);

  const tableRows = rows.map((r) => {
    const badge = statusBadge(r.p95, r.p99);
    return `
      <tr>
        <td><code>${r.name}</code></td>
        <td><code>${r.path}</code></td>
        <td>${r.avg.toFixed(0)}</td>
        <td>${r.med.toFixed(0)}</td>
        <td class="bold">${r.p95.toFixed(0)}</td>
        <td>${r.p99.toFixed(0)}</td>
        <td>${r.max.toFixed(0)}</td>
        <td><span class="badge" style="background:${badge.color}">${badge.label}</span></td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>API 성능 리포트 — landman</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f8fafc; color: #1e293b; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; background: white;
            border-radius: 0.5rem; overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #1e293b; color: white; padding: 0.75rem 1rem;
         text-align: left; font-size: 0.8rem; text-transform: uppercase;
         letter-spacing: 0.05em; }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0;
         font-size: 0.9rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f1f5f9; }
    code { font-family: "SF Mono", monospace; font-size: 0.85rem;
           background: #f1f5f9; padding: 0.1rem 0.4rem; border-radius: 0.25rem; }
    .bold { font-weight: 700; }
    .badge { display: inline-block; color: white; font-size: 0.75rem;
             font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 9999px; }
    .unit { color: #94a3b8; font-size: 0.75rem; }
    .legend { display: flex; gap: 1rem; margin-top: 1.5rem; font-size: 0.8rem; }
    .legend span { display: flex; align-items: center; gap: 0.4rem; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  </style>
</head>
<body>
  <h1>API 응답속도 리포트</h1>
  <p class="meta">대상: ${WORKER_URL} &nbsp;|&nbsp; 엔드포인트: ${rows.length}개 &nbsp;|&nbsp; VU: 3, 반복: 10회/VU</p>
  <table>
    <thead>
      <tr>
        <th>이름</th>
        <th>경로</th>
        <th>avg <span class="unit">ms</span></th>
        <th>p50 <span class="unit">ms</span></th>
        <th>p95 <span class="unit">ms</span></th>
        <th>p99 <span class="unit">ms</span></th>
        <th>max <span class="unit">ms</span></th>
        <th>상태</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="legend">
    <span><span class="dot" style="background:#16a34a"></span> OK (p95 &lt; 500ms)</span>
    <span><span class="dot" style="background:#d97706"></span> WARN (p95 500~2000ms)</span>
    <span><span class="dot" style="background:#dc2626"></span> SLOW (p95 &gt; 2000ms)</span>
  </div>
</body>
</html>`;

  const consoleSummary = rows.map((r) =>
    `  ${r.name.padEnd(25)} avg=${String(r.avg.toFixed(0)).padStart(5)}ms  p95=${String(r.p95.toFixed(0)).padStart(5)}ms  p99=${String(r.p99.toFixed(0)).padStart(5)}ms  max=${String(r.max.toFixed(0)).padStart(5)}ms`
  ).join("\n");

  console.log(`\n=== API 응답속도 요약 (p95 내림차순) ===\n${consoleSummary}\n`);

  return {
    "tests/performance/k6/report.html": html,
    stdout: consoleSummary,
  };
}
