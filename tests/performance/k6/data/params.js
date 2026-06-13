// 테스트에 사용할 실제 법정동코드 + 거래년월 조합
export const TEST_PARAMS = [
  { lawdCd: "11680", dealYmd: "202504" }, // 서울 강남구
  { lawdCd: "11650", dealYmd: "202504" }, // 서울 서초구
  { lawdCd: "11710", dealYmd: "202504" }, // 서울 송파구
  { lawdCd: "11110", dealYmd: "202504" }, // 서울 종로구
  { lawdCd: "11680", dealYmd: "202503" }, // 서울 강남구 (전월)
  { lawdCd: "11650", dealYmd: "202503" }, // 서울 서초구 (전월)
];

export const INVALID_PARAMS = [
  { lawdCd: "abc",   dealYmd: "202504" }, // 잘못된 lawdCd
  { lawdCd: "11680", dealYmd: "20254"  }, // 잘못된 dealYmd
  { lawdCd: "",      dealYmd: "202504" }, // 빈 lawdCd
];
