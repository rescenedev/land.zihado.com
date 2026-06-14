// k6 공통 설정 — 시나리오별로 import해서 사용
// WORKER_URL: Cloudflare Worker (모든 /api/* 실제 백엔드)
// BASE_URL: Next.js 앱 (프론트 + /api/* Vercel 프록시)
export const WORKER_URL = __ENV.WORKER_URL || "http://localhost:8787";
export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// 공통 성능 임계값
export const THRESHOLDS = {
  // 95%의 요청이 3초 이내 완료 (외부 MOLIT API 포함)
  http_req_duration: ["p(95)<3000"],
  // 99%의 요청이 5초 이내 완료
  "http_req_duration{expected_status:200}": ["p(99)<5000"],
  // 에러율 1% 미만
  http_req_failed: ["rate<0.01"],
  // 400 응답은 예상된 것이므로 별도 추적
  "http_req_duration{expected_status:400}": ["p(95)<200"],
};

// 현행 계약: /api/transactions?dataset=&region=<5자리 시군구>&yyyymm=
// (구 lawdCd/dealYmd 계약은 폐기 — region 누락 시 400 "region(5자리) 필요")
export function buildUrl(region, yyyymm, dataset = "aptTrade") {
  return `${BASE_URL}/api/transactions?dataset=${dataset}&region=${region}&yyyymm=${yyyymm}`;
}
