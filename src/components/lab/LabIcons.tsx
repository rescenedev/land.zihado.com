// 데이터랩 타일 아이콘 — 의존성 없는 인라인 SVG. currentColor 로 타일 액센트색을 따른다.
// 24x24 viewBox, stroke 기반(필요시 일부 fill). 서버컴포넌트에서 렌더(클라 JS 0).
import type { ReactElement } from "react";

const base = {
  width: 30,
  height: 30,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export type LabIconKey =
  | "decline" | "top" | "rise" | "volatility" | "compare"
  | "multiCompare" | "supplyChange" | "hotComplex" | "volume" | "gap"
  | "sentiment" | "supply" | "unsold" | "population" | "presaleCompare"
  | "school" | "bigComplex" | "views" | "rentYield" | "shop" | "land";

export const LAB_ICONS: Record<LabIconKey, ReactElement> = {
  // 최근하락 — 원(₩) + 하향
  decline: (
    <svg {...base}><circle cx="9" cy="9" r="5" /><path d="M7.4 8.2h3.2M7.4 10h3.2M9 6.6v4.8" /><path d="M17 13v6m0 0-2.2-2.2M17 19l2.2-2.2" /></svg>
  ),
  // 최고가 — 트로피
  top: (
    <svg {...base}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5" /><path d="M12 13v4M9 20h6M10 20v-1h4v1" /></svg>
  ),
  // 최고상승 — 원(₩) + 상향
  rise: (
    <svg {...base}><circle cx="9" cy="9" r="5" /><path d="M7.4 8.2h3.2M7.4 10h3.2M9 6.6v4.8" /><path d="M17 19v-6m0 0-2.2 2.2M17 13l2.2 2.2" /></svg>
  ),
  // 가격변동 — 펄스(심전도) 라인
  volatility: (
    <svg {...base}><path d="M3 12h3l2.5-6 3.5 12 2.5-8 1.5 2H21" /></svg>
  ),
  // 가격비교 — VS
  compare: (
    <svg {...base} strokeWidth={1.6}><path d="M4 6 6.5 13 9 6" /><path d="M14.5 6h3a2 2 0 0 1 0 4h-2.5a2 2 0 0 0 0 4h3" /></svg>
  ),
  // 여러단지비교 — 저울
  multiCompare: (
    <svg {...base}><path d="M12 4v16M7 20h10" /><path d="M12 6 5 8m7-2 7 2" /><path d="M5 8 3 13a2.5 2.5 0 0 0 4 0L5 8Zm14 0-2 5a2.5 2.5 0 0 0 4 0l-2-5Z" /></svg>
  ),
  // 매물증감 — +/−
  supplyChange: (
    <svg {...base}><circle cx="8" cy="9" r="4" /><path d="M6 9h4" /><circle cx="15.5" cy="15" r="4" /><path d="M13.5 15h4M15.5 13v4" /></svg>
  ),
  // 많이산단지 — 별 핀
  hotComplex: (
    <svg {...base}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><path d="m12 6 1.2 2.5 2.8.3-2 2 .5 2.7L12 14.2 9.5 15.5l.5-2.7-2-2 2.8-.3L12 6Z" fill="currentColor" stroke="none" /></svg>
  ),
  // 거래량 — 막대
  volume: (
    <svg {...base}><path d="M6 20V10M12 20V5M18 20v-7" /></svg>
  ),
  // 갭투자 — 머니백
  gap: (
    <svg {...base}><path d="M8.5 6.5 7 4h10l-1.5 2.5" /><path d="M15.5 6.5C18 8.5 19 11 19 14a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5c0-3 1-5.5 3.5-7.5Z" /><path d="M12 10v6M10.2 11.3h3.6M10.2 13.5h3.6" /></svg>
  ),
  // 매수심리 — 머리+하트
  sentiment: (
    <svg {...base}><path d="M15 19v-2.2A6 6 0 1 0 6 11a6 6 0 0 0 2 4.4V19" /><path d="M12.2 9.4c.7-.9 2.1-.6 2.1.6 0 .9-1 1.6-2.1 2.4-1.1-.8-2.1-1.5-2.1-2.4 0-1.2 1.4-1.5 2.1-.6Z" fill="currentColor" stroke="none" /></svg>
  ),
  // 공급물량 — 손 위 박스
  supply: (
    <svg {...base}><path d="M9 4h6v4H9zM9 6H6.5L4 9.5M15 6h2.5L20 9.5" /><path d="M3 14c2 0 2.5 2 5 2h4l3-1.2a1.2 1.2 0 0 0-1-2.2l-3 .9" /><path d="M3 13v6" /></svg>
  ),
  // 미분양 — 문서 x
  unsold: (
    <svg {...base}><path d="M6 4h7l5 5v11H6z" /><path d="M13 4v5h5" /><path d="m9.5 13 3 3m0-3-3 3" /></svg>
  ),
  // 인구변화 — 사람들
  population: (
    <svg {...base}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.6M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></svg>
  ),
  // 분양가비교 — 두 막대 + ₩
  presaleCompare: (
    <svg {...base}><path d="M6 20V9h4v11M14 20v-7h4v7" /><path d="M14.6 6.2h2.8M14.6 7.6h2.8M16 5v4" /></svg>
  ),
  // 학군비교 — 학사모
  school: (
    <svg {...base}><path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" /><path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5M21 9.5V14" /></svg>
  ),
  // 대단지 — 건물 군집
  bigComplex: (
    <svg {...base}><path d="M4 20V9l5-3v14M9 20V11l6-3v12M15 20v-7l5-2v9M3 20h18" /><path d="M6.5 11v0M6.5 14v0M12 14v0M12 17v0M17.5 15v0" /></svg>
  ),
  // 조회수 — 눈
  views: (
    <svg {...base}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.8" /></svg>
  ),
  // 월세수익 — 동전더미
  rentYield: (
    <svg {...base}><ellipse cx="12" cy="6.5" rx="6" ry="2.5" /><path d="M6 6.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4M6 10.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4" /></svg>
  ),
  // 상가통계 — 상점
  shop: (
    <svg {...base}><path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" /><path d="M4 10 5.5 5h13L20 10M9 20v-5h6v5" /></svg>
  ),
  // 토지통계 — 지도 핀/땅
  land: (
    <svg {...base}><path d="M3 18 9 6l4 7 3-4 5 9H3Z" /><circle cx="12" cy="9" r="0" /></svg>
  ),
};
