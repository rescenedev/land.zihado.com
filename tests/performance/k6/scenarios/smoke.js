/**
 * Smoke Test — 배포 직후 최소 동작 확인
 * 1 VU, 1분, 정상 요청 1회 + 유효성 검사 실패 확인
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { BASE_URL, THRESHOLDS, buildUrl } from "../config.js";
import { TEST_PARAMS, INVALID_PARAMS } from "../data/params.js";

const externalApiDuration = new Trend("external_api_duration", true);
const validationErrors = new Counter("validation_errors");

export const options = {
  vus: 1,
  duration: "1m",
  thresholds: THRESHOLDS,
};

export default function () {
  // 1. 정상 요청
  const { region, yyyymm } = TEST_PARAMS[0];
  const res = http.get(buildUrl(region, yyyymm), {
    tags: { expected_status: "200" },
    responseCallback: http.expectedStatuses(200),
  });

  check(res, {
    "status 200": (r) => r.status === 200,
    "응답 body 있음": (r) => r.body.length > 0,
    "count 필드 존재": (r) => JSON.parse(r.body).count !== undefined,
    "items 배열": (r) => Array.isArray(JSON.parse(r.body).items),
  });

  externalApiDuration.add(res.timings.duration);

  sleep(1);

  // 2. 유효성 검사 실패 — 빠른 응답 확인
  const badRes = http.get(buildUrl("invalid", "202606"), {
    tags: { expected_status: "400" },
    responseCallback: http.expectedStatuses(400),
  });

  const isValidationError = check(badRes, {
    "잘못된 파라미터 → 400": (r) => r.status === 400,
    "에러 메시지 포함": (r) => JSON.parse(r.body).error !== undefined,
    "빠른 응답 (200ms 이내)": (r) => r.timings.duration < 200,
  });

  if (!isValidationError) validationErrors.add(1);

  sleep(1);
}
