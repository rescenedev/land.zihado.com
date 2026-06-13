-- 데이터셋(부동산 종류) + 전월세 + 원본태그 지원
ALTER TABLE transactions ADD COLUMN dataset      TEXT NOT NULL DEFAULT 'aptTrade';
ALTER TABLE transactions ADD COLUMN category     TEXT NOT NULL DEFAULT 'trade';
ALTER TABLE transactions ADD COLUMN deposit      INTEGER NOT NULL DEFAULT 0; -- 전월세 보증금(만원)
ALTER TABLE transactions ADD COLUMN monthly_rent INTEGER NOT NULL DEFAULT 0; -- 전월세 월세(만원)
ALTER TABLE transactions ADD COLUMN extra        TEXT;                       -- 데이터셋별 원본 태그 JSON

CREATE INDEX IF NOT EXISTS idx_tx_dataset ON transactions(dataset, sgg_cd, deal_ymd);

-- ingest_log 도 데이터셋 단위로 구분 (key = dataset:sgg:ymd)
ALTER TABLE ingest_log ADD COLUMN dataset TEXT NOT NULL DEFAULT 'aptTrade';
