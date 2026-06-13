-- recent API: dataset+deal_ymd 필터 후 deal_date DESC 정렬을 인덱스로 처리
-- 기존 idx_tx_dataset_ymd(dataset, deal_ymd)은 정렬 시 filesort 발생
CREATE INDEX IF NOT EXISTS idx_tx_recent
  ON transactions(dataset, deal_ymd, deal_date DESC);
