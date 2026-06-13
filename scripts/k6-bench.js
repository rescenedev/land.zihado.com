// API 성능 실측: k6 run scripts/k6-bench.js
// 대상은 배포 워커(api.zihado.com). 엔드포인트별 end-to-end 지연 p50/p95(ms).
import http from "k6/http";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE || "https://api.zihado.com";
const YM = __ENV.YM || "202606";

const EPS = [
  ["overview_all", `/api/overview?dataset=aptTrade&scope=all&yyyymm=${YM}`],
  ["overview_seoul", `/api/overview?dataset=aptTrade&scope=seoul&yyyymm=${YM}`],
  ["recent", `/api/recent?dataset=aptTrade&scope=all&yyyymm=${YM}&limit=120`],
  ["aptmap", `/api/aptmap?dataset=aptTrade&region=11680&yyyymm=${YM}&limit=500`],
  ["statistics", `/api/statistics?dataset=aptTrade&scope=seoul&yyyymm=${YM}`],
  ["transactions", `/api/transactions?dataset=aptTrade&region=11680&yyyymm=${YM}`],
];

const trends = {};
for (const [n] of EPS) trends[n] = new Trend(`lat_${n}`, true);

export const options = {
  scenarios: { warm: { executor: "constant-vus", vus: 5, duration: "20s" } },
};

export default function () {
  for (const [name, path] of EPS) {
    const res = http.get(BASE + path);
    trends[name].add(res.timings.duration);
  }
}

export function handleSummary(data) {
  const out = {};
  for (const [name] of EPS) {
    const m = data.metrics[`lat_${name}`];
    if (m) out[name] = { med: Math.round(m.values.med), p95: Math.round(m.values["p(95)"]), n: m.values.count };
  }
  const all = data.metrics.http_req_duration.values;
  out._all = { med: Math.round(all.med), p95: Math.round(all["p(95)"]), reqs: Math.round(data.metrics.http_reqs.values.count) };
  return { stdout: "\n__RESULT__" + JSON.stringify(out) + "__END__\n" };
}
