export interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
  BACKFILL_Q: Queue<BackfillJob>;
  MOLIT_SERVICE_KEY: string;
  KAKAO_REST_KEY: string;
  VWORLD_KEY: string;
  VWORLD_DOMAIN?: string; // VWorld 등록 서비스URL (기본 land.zihado.com)
  BACKFILL_MONTHS: string;
}

export type BackfillJob = {
  type: "trades" | "complexes" | "geocode";
  sggCd: string;
  dataset?: string; // trades 일 때 데이터셋 키
  dealYmd?: string; // trades 일 때만
};
