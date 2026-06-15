// 데이터랩 타일 정의 — 허브 그리드(/lab)와 상세(/lab/[slug])가 공유하는 단일 출처.
// href 가 있으면 기존 기능 라우트로 바로 이동, 없으면 /lab/[slug] 준비중 상세로.
import type { LabIconKey } from "./LabIcons";

// 실데이터로 구현된 지표 뷰 종류(실거래 기반). 그 외 타일은 href(기존 라우트) 또는 준비중.
export type LabView =
  | "ranking-top" | "ranking-rise" | "ranking-decline" | "traded"
  | "invest-gap" | "invest-yield" | "presale";

export type LabTile = {
  slug: string;
  label: string;
  desc: string; // 상세/툴팁 설명
  icon: LabIconKey;
  color: string; // 액센트 hex (인라인 스타일 — Tailwind 퍼지 영향 없음)
  view?: LabView; // 있으면 /lab/[slug] 에서 실데이터 뷰 렌더
  href?: string; // 기존 라우트 매핑(있으면 바로 이동)
  related?: { label: string; href: string }[]; // 준비중 화면에서 안내할 관련 메뉴
};

// 참고 이미지("부동산 스터디") 순서 유지.
export const LAB_TILES: LabTile[] = [
  { slug: "decline", label: "최근하락", desc: "직전 거래 대비 가격이 가장 많이 내린 거래", icon: "decline", color: "#3b82f6", view: "ranking-decline" },
  { slug: "top", label: "최고가", desc: "당월 최고가 실거래 랭킹", icon: "top", color: "#f59e0b", view: "ranking-top" },
  { slug: "rise", label: "최고상승", desc: "직전 거래 대비 상승폭이 가장 큰 거래", icon: "rise", color: "#f43f5e", view: "ranking-rise" },
  { slug: "volatility", label: "가격변동", desc: "월별 평균가 추이와 변동성", icon: "volatility", color: "#ef4444", href: "/stats" },
  { slug: "compare", label: "가격비교", desc: "단지 간 평형·가격 직접 비교", icon: "compare", color: "#8b5cf6", href: "/complex" },
  { slug: "multi-compare", label: "여러단지비교", desc: "관심 단지 여러 곳을 한 번에 비교", icon: "multiCompare", color: "#6366f1", href: "/complex" },
  { slug: "supply-change", label: "매물증감", desc: "매물 수 증감 추이", icon: "supplyChange", color: "#10b981", related: [{ label: "통계", href: "/stats" }] },
  { slug: "hot-complex", label: "많이산단지", desc: "당월 거래건수가 가장 많은 단지 랭킹", icon: "hotComplex", color: "#0ea5e9", view: "traded" },
  { slug: "volume", label: "거래량", desc: "지역·기간별 거래량", icon: "volume", color: "#22c55e", href: "/stats" },
  { slug: "gap", label: "갭투자", desc: "매매가 − 전세가 = 투자금이 적은 단지", icon: "gap", color: "#eab308", view: "invest-gap" },
  { slug: "sentiment", label: "매수심리", desc: "매수우위/매도우위 심리 지수", icon: "sentiment", color: "#ec4899", related: [{ label: "통계", href: "/stats" }] },
  { slug: "supply", label: "공급물량", desc: "지역별 입주·공급 물량", icon: "supply", color: "#14b8a6" },
  { slug: "unsold", label: "미분양", desc: "지역별 미분양 추이", icon: "unsold", color: "#94a3b8", related: [{ label: "분양권", href: "/presale" }] },
  { slug: "population", label: "인구변화", desc: "지역 인구·세대수 변화", icon: "population", color: "#3b82f6" },
  { slug: "presale-compare", label: "분양가비교", desc: "지역별 분양권 평단가 vs 아파트 매매 평단가", icon: "presaleCompare", color: "#a855f7", view: "presale" },
  { slug: "school", label: "학군비교", desc: "학군·학교 정보 비교", icon: "school", color: "#06b6d4" },
  { slug: "big-complex", label: "대단지", desc: "세대수 많은 대단지 랭킹", icon: "bigComplex", color: "#6366f1", related: [{ label: "단지 검색", href: "/complex" }] },
  { slug: "views", label: "조회수", desc: "많이 본 단지 랭킹", icon: "views", color: "#2563eb" },
  { slug: "rent-yield", label: "월세수익", desc: "월세×12 ÷ 매매가 = 연환산 수익률", icon: "rentYield", color: "#f59e0b", view: "invest-yield" },
  { slug: "shop", label: "상가통계", desc: "상업용 부동산 거래 통계", icon: "shop", color: "#0ea5e9" },
  { slug: "land", label: "토지통계", desc: "토지 실거래 통계", icon: "land", color: "#22c55e" },
];

export const LAB_TILE_BY_SLUG: Record<string, LabTile> = Object.fromEntries(
  LAB_TILES.map((t) => [t.slug, t]),
);

// /lab/[slug] 로 가는 타일 = href 없는 것(구현 뷰 + 준비중). 정적 생성 대상.
export const LAB_DETAIL_SLUGS: string[] = LAB_TILES.filter((t) => !t.href).map((t) => t.slug);
// 준비중(href·view 둘 다 없음) — 상세에서 "준비 중" 안내.
export const LAB_SOON_SLUGS: string[] = LAB_TILES.filter((t) => !t.href && !t.view).map((t) => t.slug);
