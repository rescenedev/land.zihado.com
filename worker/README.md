# landman-worker

국토교통부 실거래가 캐시 백엔드 (Cloudflare Worker).

목표: **MOLIT 원본을 최대한 끌어와 빠르게 서빙**. 속도 레이어(엣지 Cache + KV)를 주력으로, D1은 다월/단지 같은 캐시로 안 되는 쿼리에만 사용.

## 아키텍처

```
요청 → Worker (Hono)
        ├─ Cache API (엣지 HTTP 캐시)        ── 히트 시 ~수ms
        ├─ KV (월별 payload 핫캐시)          ── 히트 시 빠름
        └─ D1 (정규화 적재: 다월 추이/단지)   ── 캐시 미스 시
              ↑ Cron(6h) + Queue 백필
              ↑ MOLIT 실거래 상세 + 단지목록 API
```

3단 폴백: `ensureMonth` = KV → D1 → MOLIT. 한 번 받은 월은 다음부터 캐시.

## 데이터셋 (전 종류 레지스트리)

`src/datasets.ts` 에 11종(아파트/연립/단독/오피스텔/토지/상업업무용/분양권 × 매매/전월세)을 정의.
data.go.kr 은 API마다 개별 활용신청이 필요하다. 현재 이 키로:

- ✅ `aptTrade` (아파트 매매 상세), 단지목록 — 활용신청 완료
- 🔒 나머지 9종 — 미신청(403). data.go.kr 활용신청 후 `datasets.ts` 의 `enabled:true` 로 바꾸면 즉시 동작.

가용성은 `GET /api/datasets` 가 실시간 점검해서 보고한다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/datasets` | 데이터셋별 가용성 실측 (KV 1h 캐시) |
| GET | `/api/transactions?dataset=aptTrade&region=11680&yyyymm=202604` | 월별 실거래 (캐시 우선) |
| GET | `/api/transactions/range?dataset=&region=&from=&to=&apt=` | 다월 추이(월별 집계) |
| GET | `/api/stats?dataset=&region=&yyyymm=` | 월별 통계(건수/평균/최고/최저) |
| GET | `/api/complexes?region=11680&q=래미안` | 단지 검색 |
| POST | `/api/admin/backfill?months=12` | 전 지역×활용신청 데이터셋 백필을 Queue 적재 |

`dataset` 생략 시 `aptTrade`. 매매=거래금액, 전월세=보증금 기준 통계.

## 로컬 실행

```bash
npm install
npm run migrate:local          # D1 로컬 마이그레이션
npm run dev                    # http://localhost:8787
```

서비스키는 `.dev.vars` 의 `MOLIT_SERVICE_KEY` 사용 (디코딩 키).

## 배포

```bash
# 1) 리소스 생성 후 wrangler.jsonc 의 PLACEHOLDER id 교체
npx wrangler kv namespace create CACHE
npx wrangler d1 create landman
npx wrangler queues create landman-backfill

# 2) 원격 마이그레이션 + 시크릿
npm run migrate:remote
npx wrangler secret put MOLIT_SERVICE_KEY

# 3) 배포
npm run deploy

# 4) 초기 적재
curl -X POST "https://<worker>.workers.dev/api/admin/backfill?months=12"
```

## 새 API 활성화 절차

1. data.go.kr 에서 해당 실거래가 API "활용신청" → 승인
2. `src/datasets.ts` 에서 그 데이터셋 `enabled: true`
3. 필요 시 `nameFields` 등 매핑 확인 (원본 태그는 `extra` 에 전부 보존됨)
4. `GET /api/datasets` 로 `ok` 확인 → 끝

## 데이터 정합성

자연키(데이터셋·동·지번·단지·일자·면적·층·금액)로 멱등 upsert.
동일 자연키 충돌 시 발생순번(`#2`)을 붙여 **원본 행을 손실 없이 보존**하면서 재적재해도 건수가 늘지 않는다.
