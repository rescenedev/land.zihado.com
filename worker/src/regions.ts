// 시군구 법정동코드(LAWD_CD, 5자리) + 표시명

export type RegionInfo = { sido: string; name: string };

export const REGION_NAMES: Record<string, RegionInfo> = {
  // 서울
  "11110": { sido: "서울", name: "종로구" },
  "11140": { sido: "서울", name: "중구" },
  "11170": { sido: "서울", name: "용산구" },
  "11200": { sido: "서울", name: "성동구" },
  "11215": { sido: "서울", name: "광진구" },
  "11230": { sido: "서울", name: "동대문구" },
  "11260": { sido: "서울", name: "중랑구" },
  "11290": { sido: "서울", name: "성북구" },
  "11305": { sido: "서울", name: "강북구" },
  "11320": { sido: "서울", name: "도봉구" },
  "11350": { sido: "서울", name: "노원구" },
  "11380": { sido: "서울", name: "은평구" },
  "11410": { sido: "서울", name: "서대문구" },
  "11440": { sido: "서울", name: "마포구" },
  "11470": { sido: "서울", name: "양천구" },
  "11500": { sido: "서울", name: "강서구" },
  "11530": { sido: "서울", name: "구로구" },
  "11545": { sido: "서울", name: "금천구" },
  "11560": { sido: "서울", name: "영등포구" },
  "11590": { sido: "서울", name: "동작구" },
  "11620": { sido: "서울", name: "관악구" },
  "11650": { sido: "서울", name: "서초구" },
  "11680": { sido: "서울", name: "강남구" },
  "11710": { sido: "서울", name: "송파구" },
  "11740": { sido: "서울", name: "강동구" },
  // 경기
  "41111": { sido: "경기", name: "수원 장안구" },
  "41113": { sido: "경기", name: "수원 권선구" },
  "41115": { sido: "경기", name: "수원 팔달구" },
  "41117": { sido: "경기", name: "수원 영통구" },
  "41131": { sido: "경기", name: "성남 수정구" },
  "41133": { sido: "경기", name: "성남 중원구" },
  "41135": { sido: "경기", name: "성남 분당구" },
  "41171": { sido: "경기", name: "안양 만안구" },
  "41173": { sido: "경기", name: "안양 동안구" },
  "41190": { sido: "경기", name: "부천시" },
  "41281": { sido: "경기", name: "고양 덕양구" },
  "41285": { sido: "경기", name: "고양 일산동구" },
  "41287": { sido: "경기", name: "고양 일산서구" },
  "41360": { sido: "경기", name: "남양주시" },
  "41461": { sido: "경기", name: "용인 처인구" },
  "41463": { sido: "경기", name: "용인 기흥구" },
  "41465": { sido: "경기", name: "용인 수지구" },
  "41590": { sido: "경기", name: "화성시" },
  "41210": { sido: "경기", name: "광명시" },
  "41220": { sido: "경기", name: "평택시" },
  "41271": { sido: "경기", name: "안산 상록구" },
  "41273": { sido: "경기", name: "안산 단원구" },
  "41570": { sido: "경기", name: "김포시" },
  "41450": { sido: "경기", name: "하남시" },
  // 인천
  "28110": { sido: "인천", name: "중구" },
  "28140": { sido: "인천", name: "동구" },
  "28177": { sido: "인천", name: "미추홀구" },
  "28185": { sido: "인천", name: "연수구" },
  "28200": { sido: "인천", name: "남동구" },
  "28237": { sido: "인천", name: "부평구" },
  "28245": { sido: "인천", name: "계양구" },
  "28260": { sido: "인천", name: "서구" },
  // 부산
  "26110": { sido: "부산", name: "중구" },
  "26140": { sido: "부산", name: "서구" },
  "26170": { sido: "부산", name: "동구" },
  "26200": { sido: "부산", name: "영도구" },
  "26230": { sido: "부산", name: "부산진구" },
  "26260": { sido: "부산", name: "동래구" },
  "26290": { sido: "부산", name: "남구" },
  "26320": { sido: "부산", name: "북구" },
  "26350": { sido: "부산", name: "해운대구" },
  "26380": { sido: "부산", name: "사하구" },
  "26410": { sido: "부산", name: "금정구" },
  "26440": { sido: "부산", name: "강서구" },
  "26470": { sido: "부산", name: "연제구" },
  "26500": { sido: "부산", name: "수영구" },
  "26530": { sido: "부산", name: "사상구" },
  // 대구
  "27110": { sido: "대구", name: "중구" },
  "27140": { sido: "대구", name: "동구" },
  "27170": { sido: "대구", name: "서구" },
  "27200": { sido: "대구", name: "남구" },
  "27230": { sido: "대구", name: "북구" },
  "27260": { sido: "대구", name: "수성구" },
  "27290": { sido: "대구", name: "달서구" },
  "27710": { sido: "대구", name: "달성군" },
  // 대전
  "30110": { sido: "대전", name: "동구" },
  "30140": { sido: "대전", name: "중구" },
  "30170": { sido: "대전", name: "서구" },
  "30200": { sido: "대전", name: "유성구" },
  "30230": { sido: "대전", name: "대덕구" },
  // 광주
  "29110": { sido: "광주", name: "동구" },
  "29140": { sido: "광주", name: "서구" },
  "29155": { sido: "광주", name: "남구" },
  "29170": { sido: "광주", name: "북구" },
  "29200": { sido: "광주", name: "광산구" },
  // 울산
  "31110": { sido: "울산", name: "중구" },
  "31140": { sido: "울산", name: "남구" },
  "31170": { sido: "울산", name: "동구" },
  "31200": { sido: "울산", name: "북구" },
  "31710": { sido: "울산", name: "울주군" },
  // 세종
  "36110": { sido: "세종", name: "세종시" },
  // 강원특별자치도
  "51110": { sido: "강원", name: "춘천시" },
  "51130": { sido: "강원", name: "원주시" },
  "51150": { sido: "강원", name: "강릉시" },
  // 충북
  "43111": { sido: "충북", name: "청주 상당구" },
  "43112": { sido: "충북", name: "청주 서원구" },
  "43113": { sido: "충북", name: "청주 흥덕구" },
  "43114": { sido: "충북", name: "청주 청원구" },
  "43130": { sido: "충북", name: "충주시" },
  // 충남
  "44131": { sido: "충남", name: "천안 동남구" },
  "44133": { sido: "충남", name: "천안 서북구" },
  "44200": { sido: "충남", name: "아산시" },
  "44210": { sido: "충남", name: "서산시" },
  // 전북특별자치도
  "52111": { sido: "전북", name: "전주 완산구" },
  "52113": { sido: "전북", name: "전주 덕진구" },
  "52130": { sido: "전북", name: "군산시" },
  "52140": { sido: "전북", name: "익산시" },
  // 전남
  "46110": { sido: "전남", name: "목포시" },
  "46130": { sido: "전남", name: "여수시" },
  "46150": { sido: "전남", name: "순천시" },
  // 경북
  "47111": { sido: "경북", name: "포항 남구" },
  "47113": { sido: "경북", name: "포항 북구" },
  "47130": { sido: "경북", name: "경주시" },
  "47190": { sido: "경북", name: "구미시" },
  // 경남
  "48121": { sido: "경남", name: "창원 의창구" },
  "48123": { sido: "경남", name: "창원 성산구" },
  "48125": { sido: "경남", name: "창원 마산합포구" },
  "48127": { sido: "경남", name: "창원 마산회원구" },
  "48129": { sido: "경남", name: "창원 진해구" },
  "48170": { sido: "경남", name: "진주시" },
  "48250": { sido: "경남", name: "김해시" },
  // 제주특별자치도
  "50110": { sido: "제주", name: "제주시" },
  "50130": { sido: "제주", name: "서귀포시" },
};

export const ALL_CODES: string[] = Object.keys(REGION_NAMES);

export const SEOUL_CODES: string[] = ALL_CODES.filter((c) => c.startsWith("11"));

// 시도명 → 시군구코드 2자리 prefix
export const SIDO_PREFIX: Record<string, string> = {
  서울: "11", 경기: "41", 인천: "28", 부산: "26", 대구: "27", 광주: "29",
  대전: "30", 울산: "31", 세종: "36", 강원: "51", 충북: "43", 충남: "44",
  전북: "52", 전남: "46", 경북: "47", 경남: "48", 제주: "50",
};

// scope → 대상 시군구코드 목록 (all / seoul / 시도명)
export function scopeCodes(scope: string | undefined): string[] {
  if (!scope || scope === "all") return ALL_CODES;
  if (scope === "seoul") return SEOUL_CODES;
  const pre = SIDO_PREFIX[scope];
  if (pre) return ALL_CODES.filter((c) => c.startsWith(pre));
  return SEOUL_CODES;
}

// scope → SQL 필터 (전국=빈문자)
export function scopeSqlFilter(scope: string | undefined): string {
  if (!scope || scope === "all") return "";
  const pre = scope === "seoul" ? "11" : SIDO_PREFIX[scope];
  return pre ? ` AND sgg_cd LIKE '${pre}%'` : "";
}

// 백필 대상 (전 지역)
export const SGG_CODES = ALL_CODES;

// YYYYMM 가감
export function shiftYmd(yyyymm: string, delta: number): string {
  let y = Number(yyyymm.slice(0, 4));
  let m = Number(yyyymm.slice(4, 6)) + delta;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}${String(m).padStart(2, "0")}`;
}

// 최근 N개월의 YYYYMM 목록 (현재월 포함, 과거로)
export function recentMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}
