// 데이터랩 허브(/lab) — 데이터 없는 정적 페이지. 빌드 prerender → 엣지 HIT(p50 한 자리 ms).
import { DataLab } from "@/components/lab/DataLab";

export const metadata = {
  title: "데이터랩 · 실거래 대시보드",
  description: "국토교통부 실거래가 기반 부동산 분석 지표 모음",
};

export default function Page() {
  return <DataLab />;
}
