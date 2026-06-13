# 아파트 실거래가 조회 (프로토타입)

국토교통부 실거래가 공개시스템 API를 이용한 아파트 매매 실거래 조회 프론트엔드.

## 스택

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- `fast-xml-parser` (공공데이터 XML 응답 파싱)

## 구조

| 경로 | 역할 |
|---|---|
| `src/app/page.tsx` | 조회 UI (지역/거래년월 선택, 검색, 통계, 결과 테이블) |
| `src/app/api/transactions/route.ts` | MOLIT API 프록시 (CORS 회피 + XML→JSON 변환) |
| `src/lib/regions.ts` | 시군구 법정동코드(LAWD_CD) 목록 |

브라우저에서 data.go.kr을 직접 호출하면 CORS·키 노출 문제가 있어, Next.js API 라우트가 서버에서 대신 호출한다.

## 실행

```bash
npm install
npm run dev
# http://localhost:3000
```

## 환경변수

`.env.local`:

```
MOLIT_SERVICE_KEY=<data.go.kr 디코딩 인증키>
```

> 디코딩 키를 넣으면 서버에서 `encodeURIComponent`로 안전하게 인코딩한다.

## 사용 API

아파트 매매 실거래가 상세 자료
`GET https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`

- `LAWD_CD`: 법정동코드 5자리 (시군구)
- `DEAL_YMD`: 거래년월 YYYYMM

## 확장 아이디어 (프로토타입 이후)

- 법정동코드 전체 데이터 + 시/도→시군구 단계 선택
- 전월세 실거래가 API 추가 (`RTMSDataSvcAptRent`)
- 면적/가격대 필터, 거래일 범위(다중 월) 조회
- 단지별 가격 추이 차트
