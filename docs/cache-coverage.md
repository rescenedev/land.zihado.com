# 캐시 커버리지 원장 (Cache Coverage Ledger)

> **단일 진실 소스.** 프론트(`src/lib/api.ts`)의 모든 `fetch`를 캐시 키 차원별로 매핑하고,
> 무엇이 워밍하는지·구멍이 어디인지 명시한다. **캐싱·워밍·엔드포인트를 건드리면 이 표를 갱신**한다.
>
> 왜: 한 번 "오늘의실거래(date 필터)"와 "지역상세 과거월"을 모니터가 안 재서 콜드를 밤새 방치했고,
> `aptmap`은 프론트가 `limit=500`을 부르는데 워밍은 `limit=40`이라 키가 달라 영영 콜드였다.
> 원인은 **실제 호출 표면을 추적하지 않은 것**. 이 원장이 그 표면이다.

## 현실적 지연 티어 (실측 기반)
Vercel CDN 은 **용량 한계가 있어**(정확히 2천은 아니나 ~2천대에서 LRU evict 시작) 전 URL 공간을
CDN HIT(≤50ms)로 둘 수 없다. 따라서 durable 목표는 "전부 ≤50ms"가 아니라 **"D1 콜드 0"**:

| 티어 | 경로 | 지연 | 대상 |
|---|---|---|---|
| 핫 | Vercel CDN HIT | ~10-20ms | core·오늘의실거래 최근·인기 지역 (LRU 가 유지) |
| long-tail (colo 따뜻) | Vercel MISS → 워커 KV HIT(해당 colo 캐시됨) | ~60-120ms | 그 colo 에서 최근 읽힌 키 |
| long-tail (colo cold-read) | Vercel MISS → 워커 KV **colo별 첫 읽기** | **~300ms** | 그 colo 가 처음 읽는 키 (CF KV 구조적 바닥) |
| 🔴 진짜 콜드 | Vercel MISS → KV 도 없음 → D1 재집계 | 500ms~2s | **워밍 갭. 이게 0 이어야 함.** |

→ **CF KV 는 colo별 cold-read 페널티(~300ms)가 있다.** 특정 키를 처음 읽는 colo 는 중앙저장소 fetch
로 ~300ms, 그 후 그 colo edge 에 캐시돼 ~60ms. anycast 라 colo 제어 불가 → deep long-tail
(희귀 sido×과거날짜, 희귀 region aptmap)의 colo별 첫조회 ~300ms 는 **구조적 바닥**(워밍으로 모든
colo 를 데울 수 없음). 이건 버그 아님. 재워밍해도 한 colo 만 데워져 무의미.
→ 핫셋(자주 읽힘)은 모든 주요 colo 에 상주 → 빠름. 모니터의 long-tail 150~400ms MISS 는 colo
cold-read(정상). **진짜 갭은 500ms+ 지속 또는 핫셋 콜드.** 워밍 1순위는 핫셋 KV 바닥 + CDN.

## 측정 규칙
1. **실제 호출만 측정.** 모니터(`scripts/monitor.py`)의 엔드포인트는 이 표에서 도출. 손으로 짓지 않는다.
2. **콜드를 측정.** 첫조회/배포직후/미워밍 조합 = 사용자 최악. 워밍된 12ms는 증거가 아니다.
   `vc=MISS & >50ms` = 진짜 갭. `vc=STALE` = SWR 자가치유(정상).
3. **키 1바이트 일치.** 워밍 URL = 프론트 fetch URL (limit·파라미터 순서·값 포함). 다르면 워밍 무효.
4. **durable-first.** 일회성 수동 워밍은 해결 아님. cron + (KV TTL ≥ cron 주기) 동반 + 콜드 견디는지 검증.
5. **배포→워밍 순서.** 워커 재배포는 캐시 리셋. 배치 마지막 배포 *후* 워밍.
6. **가정은 측정 전엔 가설.** "X가 한계"(예: CDN 2천)는 실측 전 설계 반영 금지. (실측: 2698개 동시 sticky HIT)

## 엔드포인트 × 캐시 키 차원 × 워밍 주체

| fetch (api.ts) | 엔드포인트 | 캐시 키 차원 | 워밍 주체 (cron) | 상태 |
|---|---|---|---|---|
| fetchOverview | `/api/overview` | dataset·scope·yyyymm | warmCore: 전국/서울 × 3월 × 전ds | ✅ |
| fetchStatistics | `/api/statistics` | dataset·scope·yyyymm | warmCore: 시도 × 3월 × 전ds | ✅ (3월 초과 콜드) |
| fetchTransactions | `/api/transactions` | dataset·region·yyyymm | warmRegions(당월)+warmRegionsPast(과거2월), 매매 | ✅매매 / ⚠️전월세·분양권 |
| fetchRecent | `/api/recent` | dataset·scope·yyyymm·limit·**date** | warmCore(전국/서울 30일)+warmRecentSido(매매 시도 31일) | ✅매매 / ⚠️전월세·분양권 시도 |
| fetchAptMap | `/api/aptmap` | dataset·region·yyyymm·**limit=500** | warmRegions/Past **limit=500** (키 일치 수정됨) | ✅ |
| fetchTrend | `/api/transactions/range` | dataset·region·from·to | warmRegions(매매) | ✅매매 |
| fetchComplexDeals | `/api/complex` | dataset·region·apt·from·to | enqueueComplexWarm 큐(당월 매매 단지) | ✅당월매매 |
| fetchCoord | `/api/coord` | region·umd·jibun·apt | warmcomplex 큐(대표지번, coord+nearby 동반) | ✅ |
| fetchNearby | `/api/nearby` | lat·lng | warmcomplex 큐(coord 결과로) | ✅ |
| fetchParcel | `/api/parcel` | lat·lng | 클라 JSONP(VWorld 가 워커 IP 차단) | 해당없음(클라) |
| fetchAptSearch | `/api/aptsearch` | q (검색어) | 워밍 안 함(동적) | 동적, 첫조회 비용 |

## 워밍 cron (worker/wrangler.jsonc, 1일 1회 ~00:30 UTC)
- `30 0` → 백필 + **warmCore** (대시보드/통계/오늘의실거래 전국·서울 3월, 전 데이터셋)
- `32 0` → **warmRecentSido(aptTrade)** 오늘의실거래 시도탭 31일
- `34 0` → **warmRegions** 지역상세 당월 (transactions/aptmap500/range/complexes)
- `36 0` → **warmRegionsPast** 지역상세 과거 2월 (transactions/aptmap500)
- `42 0` → **enqueueComplexWarm** 단지모달 큐 (complex + coord + nearby)
- KV TTL: 당월/recent = **25h** (cron 주기 24h > TTL 보장). 과거월 = 7일.

## 알려진 갭 (의식적 수용 또는 TODO)
- ⚠️ **전월세/분양권 시도탭·지역상세**: cron 제외(저트래픽). warmCore 가 전국/서울은 커버. 첫조회 후 SWR 7일.
- ⚠️ **3개월 초과 과거월**: 기준월 네비 윈도우 밖. 첫조회 콜드 후 SWR 7일.
- ⚠️ **aptsearch**: 동적 검색이라 워밍 불가. 첫 검색 비용(통상 빠름).
- 🔴 **aptmap(지도탭 지역맵, limit=500)**: KV TTL 이 **지오코딩 미완 시 300초**(`items.length < aggs.length` → 좌표 점진 채움 의도). 미완 지역은 워밍해도 5분 후 만료 → 재집계(12개월 agg + 지오코딩) ~320ms 콜드 반복. 근본 해결 = 전 단지 지오코딩 완성(apt_coords) → `items>=aggs` → respTtl(25h) 적용. TODO: geocode 커버리지 완성.
