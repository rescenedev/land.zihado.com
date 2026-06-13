-- 단지 좌표 캐시 (Kakao 지오코딩 결과)
CREATE TABLE IF NOT EXISTS apt_coords (
  k    TEXT PRIMARY KEY,  -- sgg_cd|umd|jibun
  apt  TEXT,
  lat  REAL,
  lng  REAL,
  ts   INTEGER
);
