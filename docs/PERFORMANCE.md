# Landman 성능 최적화 작업 정리

국토교통부 실거래가 대시보드(land.zihado.com)의 응답속도를 **p50 47~61ms / 50ms이하 42% → p50 ~13ms / 50ms이하 99.4%**로 개선한 작업 기록.

---

## 1. 최종 아키텍처

```
사용자(서울)
   │  ~7ms RTT
   ▼
Vercel Edge (ICN/서울)  ── 캐시 HIT → 즉시 응답(~13ms) ◀── 99% 여기서 끝
   │  (MISS 일 때만, 함수 리전 icn1 고정)
   ▼
Cloudflare Worker (api.zihado.com, 도쿄 NRT)
   │  엣지 캐시(Cache API) → KV → D1
   │  + 월·지역 사전집계 테이블(region_month_agg)
   ▼
국토교통부 MOLIT API  (백필 큐 / cron)
```

- **프론트 + API 프록시**: Vercel (Next.js, `output:export` 아님 — `src/app/api/[...path]/route.ts` 엣지 프록시)
- **데이터 원본**: Cloudflare Worker(Hono) + D1 + KV + Queue
- **land.zihado.com**: Cloudflare DNS에 **CNAME → cname.vercel-dns.com, DNS-only(회색 구름)**. 프록시(주황) 금지 — 안 그러면 CF(도쿄)를 앞단에 거쳐 ICN 이점 소멸.

---

## 2. 핵심 발견 — 병목은 "빛 속도"가 아니라 provider 라우팅

| 경로 | colo | RTT |
|---|---|---|
| Cloudflare 고객 zone (104.x/172.x) | **NRT 도쿄** | 37ms |
| Cloudflare Free 플랜 | HKG 홍콩 | 44ms |
| Cloudflare 1.1.1.1 / cloudflare.com | ICN 서울 | 5~7ms |
| **Vercel** | **ICN 서울** | **~7ms** |

- 같은 회선인데 Cloudflare 고객 zone만 도쿄로 빠짐 (BGP 피어링, 플랜·코드로 못 바꿈).
- Cloudflare Pro 업그레이드해도 HKG→NRT(도쿄)만 되고 ICN(서울)은 안 됨.
- **Vercel이 동일 회선에서 서울 직결** → 프론트/캐시를 Vercel로 이전한 게 결정적.
- 교훈: "물리적 한계"라 단정하기 전에 **provider별 colo를 실측**할 것.

---

## 3. 서버단 최적화 (Cloudflare Worker / D1)

| 영역 | 문제 | Before → After |
|---|---|---|
| recent(오늘의실거래) | 인덱스 없이 23K행 정렬 + 캐시 동시폭주 | 10,500ms → 정상 |
| overview cold | 당월 7천행인데 플래너가 110만행 풀스캔(통계 부재) | `ANALYZE` → 126ms→0.9ms |
| regionTrends | 6개월 추이 매번 raw 33만행 GROUP BY | **사전집계 테이블** → 485ms→1.3ms |
| overview 종합 cold | 집계 3쿼리 교차리전 raw 스캔 | 2,962ms→365ms |
| recent enrichment | 흔한 단지명(자이 등)이 전국·전기간 매칭 | **시군구 한정** + sgg코드 리터럴 인라인 → 298ms→정밀 |
| statistics | 요청마다 백분위수 실시간 집계(no-store) | **사전집계 캐시(max-age 30분)** + 6쿼리 단일 배치(왕복 3→1) |

추가:
- **엣지 캐시(Cache API)**: colo-로컬 HIT은 워커조차 미경유(`cf-cache-status: HIT`), 서버 처리 19ms→6ms.
- **KV inflight 중복제거**: cold miss 시 동시 폭주 방지.
- **월·지역 사전집계 테이블 `region_month_agg`**: 130만행 → 1만행 룩업. ingest 시 JS로 계산해 UPSERT.
- 버그 수정: recent의 sgg 필터가 D1 SQL 변수 100개 한도 초과(전국 날짜 0건 버그) → 시군구 코드 리터럴 인라인으로 해결.

---

## 4. Vercel / 캐시 전략

- **함수 리전 `icn1` 고정** (`export const preferredRegion=['icn1']`) — MISS 시 싱가포르 우회 제거.
- **SWR 7일** (`stale-while-revalidate=604800`): 캐시 만료돼도 stale 즉시 서빙 + 백그라운드 갱신 → 사용자는 최초 1회만 대기.
- 업스트림 max-age 존중 (과거 날짜=장기 캐시).
- ⚠️ **캐시 키 = 전체 URL**. 워밍 URL을 프론트(`src/lib/api.ts`)와 파라미터 순서·값(특히 recent `limit=300`, scope)까지 정확히 일치시켜야 같은 키.

---

## 5. 사전 워밍 (cron 2개 분리)

CF Worker subrequest 한도(1000/호출) 때문에 cron을 2개로 분리 (각각 한도 내 완주):

| cron | 시각 | 작업 |
|---|---|---|
| **코어** | 매시 0·30분 | 대시보드 + 통계(3데이터셋×18시도) + 오늘의실거래(전국 30일+시도탭 7일) + 백필 |
| **지역** | 매시 15·45분 | 시군구 거래목록 + 단지지도 (전 지역) |

- cron은 **Vercel(land.zihado.com)을 fetch** → Vercel MISS가 CF까지 채워 양쪽 레이어 동시 워밍.
- 수동 트리거: `POST /api/admin/warm?which=core|regions` (인자 없으면 둘 다).
- 워밍 불가 영역(첫 진입 MISS 후 SWR로 7일 HIT): 단지검색 임의 검색어, 단지 상세 모달(단지별), coord/parcel/nearby(좌표별).

---

## 6. 최종 측정 (1000회/엔드포인트, land.zihado.com, 실브라우저 조건)

- **전체 99.31% (17,875/18,000) ≤ 50ms**, 전 화면 p50 11~16ms.
- 다중 도구 교차검증 (overview 전국, 캐시 HIT):

| 도구 | p50 | p90 | p99 |
|---|---|---|---|
| k6 | 14.3ms | 20.4ms | 24.0ms |
| wrk (1000회) | 13.7ms | 22.6ms | 58ms |
| hey (HTTP/2) | 13.4ms | 17.6ms | 48.6ms |
| oha | 13.8ms | 20.2ms | 62.3ms |
| bombardier (HTTP/2) | 12.7ms | 18.0ms | 36~47ms |
| ab | 56ms | 73ms | 187ms (HTTPS keep-alive·압축 미지원 — 도구 한계) |

- wrk 첫 측정 p99 155ms는 표본 4배(4,311회) 탓 — 1000회로 맞추면 28~58ms로 정상.

---

## 7. 운영 메모

- **결제**: Cloudflare zihado.com을 Pro 연간으로 실수 결제 → 월간 전환/환불 요청 메일 발송함(답장 대기). Pro는 결국 ICN 못 줘서 Vercel로 전환했으므로 환불 권장.
- **성능 도구**: k6, wrk, ab, hey, oha, bombardier 설치됨. 연결재사용/HTTP2 도구(ab 제외)가 실사용에 가까운 수치.
- **데이터셋**: aptTrade(매매)·aptRent(전월세)·silvTrade(분양권)만 활용신청(ok), 나머지 9종 403.
- **패키지 매니저**: bun (npm/pnpm 아님).
