# TODO

## ✅ 단지 좌표(geo) 일괄 배치 수집 — 구현 완료 (전국 백필만 잔여)

**문제(해결됨)**: `/api/aptmap`이 요청 시점에 단지 주소를 Kakao로 on-demand 지오코딩 → 첫 로드 느림, rate limit 취약, 일부 누락.

**구현**:
- `worker/src/db.ts` `distinctComplexes(sgg)` — 시군구의 distinct `(umd, jibun)` 위치(좌표키 = `sgg|umd|jibun`).
- `worker/src/ingest.ts` `geocodeRegion(sgg)` — 미보유 좌표만 일괄 지오코딩(CONC=10) 후 `apt_coords` 적재. 멱등/증분.
- 큐 job 타입 `geocode` 추가 (`env.ts`, `handleJob`) — 프로덕션 비동기 처리용.
- 관리 엔드포인트:
  - `GET /api/admin/geocode?region=XXXXX` — 단일 구 즉시 수집(동기).
  - `GET /api/admin/geocode-all?scope=all|seoul|...` — scope 내 전 시군구 큐 등록(비동기).

**완료 상태**:
- 서울 25개 구 사전 수집 완료(`apt_coords` 6,414행, 구별 98%+; 소수 실패는 지번 미매칭 → on-demand 재시도).
- 지도: 용산 등에서 단지 마커 완전·즉시 표시(전 few → 155개), aptmap 은 `apt_coords` 캐시 히트로 빠름.

**잔여**:
- 전국 백필: 로컬은 `/api/admin/geocode-all?scope=all` 호출 후 큐 처리(또는 구별 `?region=` 반복). 프로덕션은 `--remote` D1 대상으로 동일 트리거.
- (선택) cron(`worker/src/index.ts` `scheduled`)에 `geocode` job 점진 enqueue 를 추가해 신규 단지 좌표 자동 동기화. 현재는 미연결(초기 대량 호출/rate limit 회피).
