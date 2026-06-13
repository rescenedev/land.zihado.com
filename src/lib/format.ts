// 만원 단위 금액 포맷

/** 컴팩트: 28.4억 / 8,200만 */
export function formatEok(manwon: number): string {
  if (!manwon) return "-";
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

/** 상세: 28억 4,249만 */
export function formatAmountFull(manwon: number): string {
  if (!manwon) return "-";
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok > 0) {
    return rest > 0 ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${rest.toLocaleString()}만`;
}

export function pyeong(m2: number): string {
  return (m2 / 3.305785).toFixed(1);
}

// 거래 금액 표시: 매매/분양권=거래가, 전세=보증금, 월세=보증금/월세
export function formatDeal(tx: {
  dealAmount: number;
  deposit: number;
  monthlyRent: number;
}): string {
  if (tx.dealAmount > 0) return formatAmountFull(tx.dealAmount);
  if (tx.monthlyRent > 0)
    return `${formatAmountFull(tx.deposit)} / 월 ${tx.monthlyRent.toLocaleString()}만`;
  if (tx.deposit > 0) return `${formatAmountFull(tx.deposit)} (전세)`;
  return "-";
}
