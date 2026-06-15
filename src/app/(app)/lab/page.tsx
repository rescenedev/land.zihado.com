// 데이터랩 허브(/lab) — 타일별 당월 헤드라인 수치를 함께 노출(ISR). cron 워밍이 재생성 흡수.
import { DataLab } from "@/components/lab/DataLab";
import { ssrLabSummary } from "@/lib/ssr";

export const revalidate = 1800;

export const metadata = {
  title: "데이터랩 · 실거래 대시보드",
  description: "국토교통부 실거래가 기반 부동산 분석 지표 모음",
};

export default async function Page() {
  const summary = await ssrLabSummary();
  return <DataLab summary={summary} />;
}
