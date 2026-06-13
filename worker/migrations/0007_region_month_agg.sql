-- 월별·지역별 사전집계 테이블: overview/regionTrends를 raw GROUP BY(수십만 행 스캔)
-- 대신 (dataset, deal_ymd) prefix 룩업(수백 행)으로 전환. 적재 시 ingest가 갱신.
CREATE TABLE IF NOT EXISTS region_month_agg (
  dataset  TEXT    NOT NULL,
  deal_ymd TEXT    NOT NULL,
  sgg_cd   TEXT    NOT NULL,
  count    INTEGER NOT NULL,
  avg      INTEGER NOT NULL,
  avg84    INTEGER NOT NULL,  -- 전용 80~86㎡ 평균가(없으면 0)
  max      INTEGER NOT NULL,
  min      INTEGER NOT NULL,
  PRIMARY KEY (dataset, deal_ymd, sgg_cd)
);
