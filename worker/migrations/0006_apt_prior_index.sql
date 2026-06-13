-- aptPriorStats / aptMonthlySeries: apt_name IN (...) + deal_ymd 범위 쿼리 최적화
CREATE INDEX IF NOT EXISTS idx_tx_apt_name
  ON transactions(dataset, apt_name, deal_ymd);
