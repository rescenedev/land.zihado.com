-- region_month_agg 백필: 이미 적재된 raw transactions 로부터 사전집계행을 생성.
-- 0007 에서 빈 테이블만 만들었으므로, 마이그레이션 이전에 적재된 데이터는
-- overview/regionTrends 에서 누락된다(두 함수가 agg 테이블만 읽음). 이를 메운다.
-- 집계 로직은 db.ts 의 aggregateMonth 와 동일:
--   amt   = deal_amount > 0 ? deal_amount : deposit   (전월세는 보증금)
--   avg   = CAST(AVG(amt) AS INTEGER)                 (절삭)
--   avg84 = 전용 80~86㎡ 의 AVG(amt), 없으면 0
-- ON CONFLICT 로 멱등 → 재실행/원격 적용 안전. 이후는 ingest 의 upsertRegionAgg 가 유지.
INSERT INTO region_month_agg (dataset, deal_ymd, sgg_cd, count, avg, avg84, max, min)
SELECT
  dataset,
  deal_ymd,
  sgg_cd,
  COUNT(*)                                                              AS count,
  CAST(AVG(amt) AS INTEGER)                                             AS avg,
  CAST(COALESCE(AVG(CASE WHEN area >= 80 AND area <= 86 THEN amt END), 0) AS INTEGER) AS avg84,
  MAX(amt)                                                              AS max,
  MIN(amt)                                                              AS min
FROM (
  SELECT
    dataset,
    deal_ymd,
    sgg_cd,
    area,
    CASE WHEN deal_amount > 0 THEN deal_amount ELSE deposit END AS amt
  FROM transactions
)
GROUP BY dataset, deal_ymd, sgg_cd
ON CONFLICT(dataset, deal_ymd, sgg_cd) DO UPDATE SET
  count = excluded.count,
  avg   = excluded.avg,
  avg84 = excluded.avg84,
  max   = excluded.max,
  min   = excluded.min;
