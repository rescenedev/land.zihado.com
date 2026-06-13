-- 실거래 (아파트 매매 상세)
CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,   -- 자연키 조합 (재적재 시 멱등)
  sgg_cd       TEXT NOT NULL,      -- 시군구코드 5자리
  deal_ymd     TEXT NOT NULL,      -- YYYYMM (월 필터용)
  deal_date    TEXT NOT NULL,      -- YYYY-MM-DD
  umd_nm       TEXT,               -- 법정동
  jibun        TEXT,
  apt_name     TEXT NOT NULL,
  apt_dong     TEXT,
  deal_amount  INTEGER NOT NULL,   -- 만원
  area         REAL,               -- 전용면적 m2
  floor        INTEGER,
  build_year   INTEGER,
  dealing_gbn  TEXT,               -- 중개거래 / 직거래
  buyer_gbn    TEXT,
  sler_gbn     TEXT,
  rgst_date    TEXT,               -- 등기일자
  agent_sgg    TEXT,               -- 중개사 소재지
  cdeal_type   TEXT,               -- 해제여부 O/공백
  cdeal_day    TEXT,
  created_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tx_sgg_ymd ON transactions(sgg_cd, deal_ymd);
CREATE INDEX IF NOT EXISTS idx_tx_sgg_apt ON transactions(sgg_cd, apt_name);
CREATE INDEX IF NOT EXISTS idx_tx_date    ON transactions(deal_date);

-- 단지 카탈로그 (단지목록 API)
CREATE TABLE IF NOT EXISTS complexes (
  kapt_code  TEXT PRIMARY KEY,
  kapt_name  TEXT NOT NULL,
  bjd_code   TEXT,
  sgg_cd     TEXT,               -- bjd_code 앞 5자리
  sido       TEXT,
  sigungu    TEXT,
  dong       TEXT,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cx_sgg  ON complexes(sgg_cd);
CREATE INDEX IF NOT EXISTS idx_cx_name ON complexes(kapt_name);

-- 적재 로그 (어떤 지역·월을 언제 수집했는지)
CREATE TABLE IF NOT EXISTS ingest_log (
  key         TEXT PRIMARY KEY,   -- sgg_cd:deal_ymd
  sgg_cd      TEXT,
  deal_ymd    TEXT,
  count       INTEGER,
  status      TEXT,               -- ok | empty | error
  ingested_at INTEGER
);
