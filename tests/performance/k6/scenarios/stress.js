/**
 * Stress Test — 한계 부하 탐색
 * VU를 계속 올려 언제 임계값을 초과하는지 측정
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
import { buildUrl } from "../config.js";
import { TEST_PARAMS } from "../data/params.js";

const successRate = new Rate("success_rate");

export const options = {
  stages: [
    { duration: "2m", target: 10  }, // 워밍업
    { duration: "5m", target: 30  }, // 중간 부하
    { duration: "5m", target: 50  }, // 높은 부하
    { duration: "5m", target: 100 }, // 최대 부하 — 한계 탐색
    { duration: "3m", target: 0   }, // 회복
  ],
  thresholds: {
    // 스트레스 테스트는 임계값 위반을 관찰하는 것이 목적
    // abort_on_fail: false 로 계속 진행
    http_req_failed: [{ threshold: "rate<0.10", abortOnFail: false }],
    http_req_duration: [{ threshold: "p(95)<8000", abortOnFail: false }],
    success_rate: [{ threshold: "rate>0.90", abortOnFail: false }],
  },
};

export default function () {
  const param = TEST_PARAMS[__ITER % TEST_PARAMS.length];

  const res = http.get(buildUrl(param.region, param.yyyymm), {
    tags: { expected_status: "200" },
    timeout: "15s",
  });

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "응답 수신": (r) => r.body.length > 0,
  });

  successRate.add(ok);

  sleep(0.5);
}
