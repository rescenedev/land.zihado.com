export interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
  BACKFILL_Q: Queue<BackfillJob>;
  MOLIT_SERVICE_KEY: string;
  KAKAO_REST_KEY: string;
  VWORLD_KEY: string;
  VWORLD_DOMAIN?: string; // VWorld 등록 서비스URL (기본 land.zihado.com)
  BACKFILL_MONTHS: string;
  TELEGRAM_BOT_TOKEN?: string; // 일일 적재 상태 알림용 (secret)
  TELEGRAM_CHAT_ID?: string;   // 알림 수신 chat id (secret)
}

export type BackfillJob = {
  type: "trades" | "complexes" | "geocode" | "warmcomplex";
  sggCd: string;
  dataset?: string; // trades/warmcomplex 일 때 데이터셋 키
  dealYmd?: string; // trades/warmcomplex(=기준월) 일 때
  apt?: string; // warmcomplex 일 때 단지명
  force?: boolean; // trades: isIngested 단락 무시하고 MOLIT 강제 재적재(라이브 윈도우 갱신용)
};
