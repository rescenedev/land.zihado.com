// "오늘의 주목 실거래 TOP" 선별 — OG 카드(Vercel)와 워커 캡션이 동일 결과를 내도록
// 같은 규칙을 공유한다. (워커는 별도 패키지라 worker/src/instagram.ts 에 동일 로직 복제)
//
// 규칙: 최신 계약일의 거래 중 거래가 높은 순. 최신일 표본이 부족하면 최근 거래로 확장.

export type DealLike = {
  aptName?: string;
  dealAmount?: number;
  deposit?: number;
  dealDate?: string;
  umdNm?: string;
  area?: number;
  sggCd?: string;
  rise?: number | null;
  isHigh?: boolean;
  isFirst?: boolean;
};

const amountOf = (d: DealLike): number => d.dealAmount || d.deposit || 0;

export function pickTopDeals<T extends DealLike>(deals: T[], n = 5): T[] {
  const valid = deals.filter((d) => amountOf(d) > 0 && !!d.aptName);
  if (valid.length === 0) return [];
  const latest = valid[0]?.dealDate ?? "";
  let pool = valid.filter((d) => d.dealDate === latest);
  // 최신일 거래가 n개 미만이면(신고 지연) 최근 거래 표본으로 확장
  if (pool.length < n) pool = valid.slice(0, Math.max(n * 4, 20));
  return [...pool].sort((a, b) => amountOf(b) - amountOf(a)).slice(0, n);
}
