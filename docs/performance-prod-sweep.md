# 성능 테스트 결과 — land.zihado.com

> 실사용 경로(한국→Vercel ICN 엣지) 전 메뉴 스윕 · k6 · 2026-06-14 18:12 KST

## 요약

- 대상: `https://land.zihado.com` (Vercel 컴퓨트 리전 `icn1`/서울)
- 측정: k6 VU 8 · 40반복/VU · keep-alive(실브라우저 유사) · 표면 29개
- **에러율 0.00%** · 전 표면 p95 ≤ 91ms · p99 ≤ 164ms
- 판정: ✅ p99≤50ms · 🟡 ≤200ms(콜드 revalidation 꼬리) · 🔴 >200ms

## 표면별 (p99 내림차순)

| 표면 | 종류 | avg | p50 | p95 | p99 | max | |
|---|---|--:|--:|--:|--:|--:|:--:|
| `api_rent_tx_prev` | api | 58 | 53 | 91 | 164 | 264 | 🟡 |
| `page_stats` | page | 24 | 18 | 36 | 154 | 335 | 🟡 |
| `api_silv_overview` | api | 21 | 17 | 29 | 116 | 240 | 🟡 |
| `api_rent_tx` | api | 28 | 25 | 47 | 115 | 183 | 🟡 |
| `page_map` | page | 21 | 17 | 36 | 110 | 152 | 🟡 |
| `api_recent` | api | 42 | 40 | 60 | 106 | 139 | 🟡 |
| `page_complex` | page | 21 | 18 | 33 | 100 | 140 | 🟡 |
| `rsc_today` | rsc | 20 | 16 | 31 | 95 | 386 | 🟡 |
| `page_presale` | page | 21 | 18 | 32 | 93 | 122 | 🟡 |
| `api_rent_overview` | api | 20 | 17 | 31 | 87 | 139 | 🟡 |
| `api_tx_gangnam` | api | 20 | 17 | 34 | 77 | 134 | 🟡 |
| `page_rent` | page | 20 | 18 | 31 | 68 | 152 | 🟡 |
| `api_overview_seoul` | api | 19 | 17 | 30 | 66 | 112 | 🟡 |
| `page_today` | page | 20 | 16 | 30 | 64 | 327 | 🟡 |
| `api_tx_gangnam_prev` | api | 23 | 21 | 37 | 64 | 142 | 🟡 |
| `page_home` | page | 26 | 23 | 41 | 60 | 289 | 🟡 |
| `rsc_home` | rsc | 19 | 17 | 32 | 56 | 149 | 🟡 |
| `api_parcel` | api | 19 | 16 | 29 | 55 | 325 | 🟡 |
| `api_coord` | api | 18 | 17 | 29 | 55 | 91 | 🟡 |
| `api_aptsearch` | api | 19 | 17 | 28 | 50 | 199 | 🟡 |
| `api_aptmap` | api | 20 | 19 | 31 | 49 | 205 | ✅ |
| `api_statistics` | api | 18 | 17 | 25 | 47 | 103 | ✅ |
| `api_overview_all` | api | 19 | 18 | 30 | 45 | 53 | ✅ |
| `api_range` | api | 18 | 16 | 29 | 44 | 74 | ✅ |
| `api_nearby` | api | 19 | 17 | 29 | 43 | 129 | ✅ |
| `api_complex` | api | 17 | 16 | 26 | 40 | 63 | ✅ |
| `rsc_stats` | rsc | 19 | 17 | 28 | 39 | 103 | ✅ |
| `api_complexes` | api | 18 | 17 | 27 | 37 | 83 | ✅ |
| `api_silv_tx` | api | 18 | 16 | 26 | 35 | 90 | ✅ |

(단위 ms. max 의 수백~1400ms 는 측정 중 발생한 cold-MISS→도쿄 워커 재생성 1~2회 — p95/p99 워밍경로와 무관한 최악 단발값.)

## 핵심

- **컴퓨트 리전 icn1 이전**으로 revalidation/MISS 가 서울 로컬화 → 전 표면 두 자리 ms.
- 8 VU 동시 부하로 전 메뉴 순회: p50 16~53ms · p95 25~91ms · p99 35~164ms.
- 가장 무거운 꼬리: `api_rent_tx_prev`(p99 164ms), `page_stats`(p99 154ms) — 과거월/revalidation 이 도쿄 워커 fetch 를 1% 대역에서 침.
- 단일 핫경로(oha keep-alive, 단일 엔드포인트 워밍) p99 는 ~15ms. 본 표는 동시부하 순회라 cold-MISS 가 p99 에 더 잡힘 — 둘 다 유효, 측정 레짐 차이.
- `max` 의 수백 ms 단발 스파이크는 LRU evict 후 첫 히트(도쿄 워커 fetch). cron+워밍이 흡수.
