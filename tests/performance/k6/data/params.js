// 테스트에 사용할 실제 시군구코드(region, 5자리) + 거래년월(yyyymm) 조합
export const TEST_PARAMS = [
  { region: "11680", yyyymm: "202606" }, // 서울 강남구 (당월)
  { region: "11650", yyyymm: "202606" }, // 서울 서초구 (당월)
  { region: "11710", yyyymm: "202606" }, // 서울 송파구 (당월)
  { region: "11110", yyyymm: "202606" }, // 서울 종로구 (당월)
  { region: "11680", yyyymm: "202605" }, // 서울 강남구 (전월)
  { region: "11650", yyyymm: "202605" }, // 서울 서초구 (전월)
];

export const INVALID_PARAMS = [
  { region: "abc",   yyyymm: "202606" }, // 잘못된 region (5자리 아님) → 400
  { region: "11680", yyyymm: "20256"  }, // 잘못된 yyyymm
  { region: "",      yyyymm: "202606" }, // 빈 region → 400
];
