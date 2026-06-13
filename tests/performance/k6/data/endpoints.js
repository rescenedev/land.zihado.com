// Worker API 전체 엔드포인트 레지스트리 (worker/src/index.ts 기준)
// 새 API 추가 시 여기에만 추가하면 perf:all 이 자동으로 포함

export const ENDPOINTS = [
  {
    name: "overview_seoul",
    path: "/api/overview",
    params: { dataset: "aptTrade", scope: "seoul", yyyymm: "202606" },
    expectedStatus: 200,
  },
  {
    name: "overview_all",
    path: "/api/overview",
    params: { dataset: "aptTrade", scope: "all", yyyymm: "202606" },
    expectedStatus: 200,
  },
  {
    name: "statistics",
    path: "/api/statistics",
    params: { dataset: "aptTrade", scope: "seoul", yyyymm: "202606" },
    expectedStatus: 200,
  },
  {
    name: "recent",
    path: "/api/recent",
    params: { dataset: "aptTrade", scope: "all", yyyymm: "202606", limit: "150" },
    expectedStatus: 200,
  },
  {
    name: "transactions",
    path: "/api/transactions",
    params: { dataset: "aptTrade", region: "11680", yyyymm: "202606" },
    expectedStatus: 200,
  },
  {
    name: "transactions_range",
    path: "/api/transactions/range",
    params: { dataset: "aptTrade", region: "11680", from: "202412", to: "202504" },
    expectedStatus: 200,
  },
  {
    name: "aptmap",
    path: "/api/aptmap",
    params: { dataset: "aptTrade", region: "11680", yyyymm: "202606", limit: "40" },
    expectedStatus: 200,
  },
  {
    name: "aptsearch",
    path: "/api/aptsearch",
    params: { dataset: "aptTrade", q: "래미안" },
    expectedStatus: 200,
  },
  {
    name: "complex",
    path: "/api/complex",
    params: { dataset: "aptTrade", region: "11680", apt: "래미안대치팰리스", from: "202412", to: "202504" },
    expectedStatus: 200,
  },
  {
    name: "complexes",
    path: "/api/complexes",
    params: { dataset: "aptTrade", region: "11680" },
    expectedStatus: 200,
  },
  {
    name: "nearby",
    path: "/api/nearby",
    params: { lat: "37.4979", lng: "127.0276" }, // 강남구 대치동
    expectedStatus: 200,
  },
  {
    name: "coord",
    path: "/api/coord",
    params: { region: "11680", umd: "대치동", jibun: "15", apt: "래미안대치팰리스" },
    expectedStatus: 200,
  },
  {
    name: "parcel",
    path: "/api/parcel",
    params: { lat: "37.4979", lng: "127.0276" },
    expectedStatus: 200,
  },
  {
    name: "stats",
    path: "/api/stats",
    params: { dataset: "aptTrade", region: "11680", yyyymm: "202606" },
    expectedStatus: 200,
  },
  {
    name: "datasets",
    path: "/api/datasets",
    params: {},
    expectedStatus: 200,
  },
];
