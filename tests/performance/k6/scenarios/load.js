/**
 * Load Test — 예상 트래픽 패턴 검증
 * 점진적 증가 → 유지 → 감소 (총 8분)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { THRESHOLDS, buildUrl } from "../config.js";
import { TEST_PARAMS } from "../data/params.js";

const successRate = new Rate("success_rate");
const p95Duration = new Trend("p95_duration", true);

export const options = {
  stages: [
    { duration: "2m", target: 10 }, // ramp-up
    { duration: "4m", target: 10 }, // steady state
    { duration: "2m", target: 0  }, // ramp-down
  ],
  thresholds: {
    ...THRESHOLDS,
    success_rate: ["rate>0.99"],
  },
};

export default function () {
  // VU 인덱스 기반으로 테스트 파라미터 순환
  const param = TEST_PARAMS[__VU % TEST_PARAMS.length];

  const res = http.get(buildUrl(param.region, param.yyyymm), {
    tags: { expected_status: "200", region: param.region },
    timeout: "10s",
  });

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "3초 이내 응답": (r) => r.timings.duration < 3000,
    "유효한 JSON": (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.count === "number" && Array.isArray(body.items);
      } catch {
        return false;
      }
    },
  });

  successRate.add(ok);
  p95Duration.add(res.timings.duration);

  // 실제 사용자 패턴 모사: 요청 사이 1~3초 대기
  sleep(1 + Math.random() * 2);
}
