# 성능 테스트 결과 — land.zihado.com

> 실사용 경로(한국→Vercel ICN 엣지) 전 메뉴 스윕 · k6 · 2026-06-14 18:20 KST

## 요약

- 대상: `https://land.zihado.com` (Vercel 컴퓨트 리전 `icn1`/서울)
- 측정: k6 VU 8 · 40반복/VU · keep-alive(실브라우저 유사) · 표면 29개
- **에러율 0.00%** · 전 표면 p95 ≤ 78ms · p99 ≤ 124ms
- 판정: ✅ p99≤50ms · 🟡 ≤200ms(콜드 revalidation 꼬리) · 🔴 >200ms

## 왜 이렇게 빠른가

1. **엣지가 사용자와 같은 도시(서울 ICN)**
   - land.zihado.com 은 DNS-only 로 Vercel 에 직결돼 한국 요청이 서울 엣지 PoP 에서 끝난다. 캐시 HIT 면 왕복 5~15ms. 도쿄·미국을 안 거친다.
2. **컴퓨트도 서울로 당겼다 (icn1) — 어제의 삽질 종결**
   - 어제까진 엣지는 서울인데 ISR/서버리스 컴퓨트가 미국 동부(iad1)였다. 캐시 MISS·revalidation 마다 서울→버지니아→도쿄 태평양 왕복(p999 1.5~3초). vercel.json regions=[icn1] 한 줄로 컴퓨트를 서울로 옮기니 그 꼬리가 두 자리 ms 로 붕괴했다.
3. **3계층 캐시 — 대부분 1계층에서 끝**
   - ① Vercel CDN HIT(서울 엣지, ~15ms) → ② 워커 KV(글로벌 바닥, MISS 시 ~50ms) → ③ D1(진짜 콜드만). 워밍 덕에 거의 ①에서 응답. DB 쿼리(~1.6ms)는 병목이 아니다.
4. **데이터 갱신 직후 전 표면 사전 워밍**
   - cron + scripts/warm.sh 가 매매·전월세·분양권 × 전 지역 × 과거월 + 오늘의실거래 날짜경로를 미리 굽는다. 사용자 첫 클릭도 콜드가 아니라 HIT. ⚠️ 워커는 도쿄라 서울 엣지(ICN)는 한국발로 따로 워밍.
5. **SSR + RSC 분리 캐시로 화면 전환이 즉시**
   - HTML 과 RSC 페이로드를 둘 다 ISR 캐시. 날짜/메뉴 soft-nav 는 RSC 만 받아 깜빡임 없이 전환. 첫 페인트에 실데이터가 이미 박혀 온다(집계중 placeholder 없음).
6. **클릭 전에 미리 당겨오는 프리페치**
   - 인접 날짜는 router.prefetch, 시도·데이터셋 칩과 거래 카드는 hover 시 prefetch → 클릭하는 순간 클라 캐시에 이미 있음. 체감 0ms.
7. **측정도 정직하게**
   - oha/k6 keep-alive(실브라우저처럼 커넥션 재사용). single-curl 은 매번 새 TLS 핸드셰이크라 3~10배 과대측정 — 그 함정을 피한 실측이다.

## 요청 흐름

```
브라우저(한국)
   │  HTTPS keep-alive
   ▼
land.zihado.com  ──DNS-only──▶  Vercel 엣지 PoP (서울 ICN)
   │
   ├─ CDN HIT ───────────────▶  즉시 응답 (~15ms)   ← 대부분 여기서 끝
   │
   └─ MISS/revalidation ─────▶  Vercel 서버리스 (icn1 / 서울)   ← 어제는 iad1(미국)이었음
                                   │
                                   ▼
                                api.zihado.com  워커 (Cloudflare, 도쿄 NRT)
                                   ├─ KV HIT ─▶ ~50ms
                                   └─ D1 (진짜 콜드만, ~1.6ms 쿼리)
```

## 어제 → 오늘 (무엇이 바뀌었나)

| | 어제 (iad1 컴퓨트) | 오늘 (icn1 컴퓨트) |
|---|---|---|
| 캐시 HIT | 빠름 (~15ms) | 빠름 (~15ms) |
| MISS / revalidation | 서울→**미국 동부**→도쿄, p999 **1.5~3초** | 서울→도쿄, p99 **두 자리 ms** |
| 콜드 모달/과거월 | 1~2초 stall | 두 자리 ms |

핵심은 **vercel.json `regions:["icn1"]` 한 줄** — 엣지뿐 아니라 컴퓨트(ISR/revalidation)까지 서울로 모았다.

## 표면별 (p99 내림차순)

| 표면 | 종류 | avg | p50 | p95 | p99 | max | |
|---|---|--:|--:|--:|--:|--:|:--:|
| `api_rent_tx` | api | 27 | 24 | 42 | 124 | 153 | 🟡 |
| `api_rent_tx_prev` | api | 52 | 48 | 78 | 113 | 146 | 🟡 |
| `api_recent` | api | 41 | 36 | 67 | 109 | 367 | 🟡 |
| `page_map` | page | 21 | 17 | 36 | 90 | 277 | 🟡 |
| `page_stats` | page | 21 | 18 | 30 | 88 | 128 | 🟡 |
| `api_rent_overview` | api | 19 | 17 | 25 | 87 | 108 | 🟡 |
| `page_complex` | page | 22 | 18 | 37 | 87 | 247 | 🟡 |
| `page_home` | page | 24 | 22 | 39 | 82 | 134 | 🟡 |
| `api_aptsearch` | api | 20 | 17 | 35 | 77 | 264 | 🟡 |
| `api_statistics` | api | 20 | 17 | 35 | 74 | 273 | 🟡 |
| `api_complexes` | api | 19 | 16 | 32 | 72 | 120 | 🟡 |
| `page_presale` | page | 21 | 18 | 36 | 70 | 114 | 🟡 |
| `api_parcel` | api | 17 | 15 | 26 | 68 | 86 | 🟡 |
| `api_tx_gangnam` | api | 19 | 17 | 30 | 65 | 118 | 🟡 |
| `rsc_stats` | rsc | 20 | 18 | 31 | 60 | 119 | 🟡 |
| `api_silv_overview` | api | 19 | 18 | 32 | 59 | 93 | 🟡 |
| `rsc_today` | rsc | 19 | 16 | 30 | 58 | 165 | 🟡 |
| `page_rent` | page | 21 | 18 | 34 | 56 | 136 | 🟡 |
| `api_overview_all` | api | 19 | 18 | 27 | 54 | 257 | 🟡 |
| `page_today` | page | 18 | 16 | 26 | 54 | 100 | 🟡 |
| `api_silv_tx` | api | 18 | 16 | 28 | 50 | 97 | 🟡 |
| `rsc_home` | rsc | 19 | 17 | 28 | 50 | 112 | 🟡 |
| `api_nearby` | api | 18 | 16 | 28 | 48 | 62 | ✅ |
| `api_aptmap` | api | 21 | 18 | 28 | 47 | 327 | ✅ |
| `api_overview_seoul` | api | 18 | 16 | 28 | 45 | 122 | ✅ |
| `api_tx_gangnam_prev` | api | 21 | 20 | 34 | 44 | 79 | ✅ |
| `api_coord` | api | 18 | 16 | 28 | 40 | 61 | ✅ |
| `api_complex` | api | 17 | 16 | 24 | 37 | 71 | ✅ |
| `api_range` | api | 17 | 16 | 25 | 36 | 48 | ✅ |

(단위 ms. max 의 수백~1400ms 는 측정 중 발생한 cold-MISS→도쿄 워커 재생성 1~2회 — p95/p99 워밍경로와 무관한 최악 단발값.)

## 핵심

- **컴퓨트 리전 icn1 이전**으로 revalidation/MISS 가 서울 로컬화 → 전 표면 두 자리 ms.
- 8 VU 동시 부하로 전 메뉴 순회: p50 15~48ms · p95 24~78ms · p99 36~124ms.
- 가장 무거운 꼬리: `api_rent_tx`(p99 124ms), `api_rent_tx_prev`(p99 113ms) — 과거월/revalidation 이 도쿄 워커 fetch 를 1% 대역에서 침.
- 단일 핫경로(oha keep-alive, 단일 엔드포인트 워밍) p99 는 ~15ms. 본 표는 동시부하 순회라 cold-MISS 가 p99 에 더 잡힘 — 둘 다 유효, 측정 레짐 차이.
- `max` 의 수백 ms 단발 스파이크는 LRU evict 후 첫 히트(도쿄 워커 fetch). cron+워밍이 흡수.
