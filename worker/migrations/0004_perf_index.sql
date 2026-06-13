-- (dataset, deal_ymd) 복합 인덱스: overview/statistics/regionTrends 쿼리 최적화
-- 이 패턴으로 필터링하는 쿼리들이 sgg_cd 기준 인덱스를 사용하지 못해 풀스캔 발생
CREATE INDEX IF NOT EXISTS idx_tx_dataset_ymd ON transactions(dataset, deal_ymd);

-- ingest_log: (dataset, deal_ymd) 조합 조회 최적화 (ingestedRegions 함수)
CREATE INDEX IF NOT EXISTS idx_ingest_dataset_ymd ON ingest_log(dataset, deal_ymd);
