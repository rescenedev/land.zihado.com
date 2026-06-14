/**
 * Validation Test — 유효성 검사 레이어만 격리 테스트
 * 외부 API 없이 Next.js 레이어 단독 성능 측정
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL } from "../config.js";
import { INVALID_PARAMS } from "../data/params.js";

const validationLatency = new Trend("validation_latency_ms", true);

export const options = {
  vus: 20,
  duration: "2m",
  thresholds: {
    // 유효성 검사는 외부 API 없이 처리 → 100ms 이내 기대
    validation_latency_ms: ["p(95)<100", "p(99)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const param = INVALID_PARAMS[__ITER % INVALID_PARAMS.length];
  const url = `${BASE_URL}/api/transactions?dataset=aptTrade&region=${param.region}&yyyymm=${param.yyyymm}`;

  const res = http.get(url, { tags: { expected_status: "400" } });

  check(res, {
    "400 반환": (r) => r.status === 400,
    "에러 메시지": (r) => !!JSON.parse(r.body).error,
  });

  validationLatency.add(res.timings.duration);

  sleep(0.1);
}
