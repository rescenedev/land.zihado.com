// MOLIT 실거래가 데이터셋 레지스트리 (기관코드 1613000)
//
// 각 API는 data.go.kr 에서 개별 활용신청(승인)이 필요하다.
// 현재 이 서비스키로 살아있는 것: aptTrade, (단지목록은 complexes 로 별도)
// 나머지는 403 (미신청). 활용신청 후 enabled:true 로 바꾸면 즉시 동작한다.

export type Category = "trade" | "rent";

export type Dataset = {
  key: string; // 내부 식별자 (?dataset= 값)
  label: string; // 한글 표시명
  category: Category; // 매매 / 전월세
  service: string; // RTMSDataSvc... 서비스명
  operation: string; // get... 오퍼레이션명
  nameFields: string[]; // 단지/건물명 후보 태그 (우선순위)
  enabled: boolean; // 활용신청 완료 여부
};

export const DATASETS: Record<string, Dataset> = {
  aptTrade: {
    key: "aptTrade",
    label: "아파트 매매",
    category: "trade",
    service: "RTMSDataSvcAptTrade",
    operation: "getRTMSDataSvcAptTrade",
    nameFields: ["aptNm"],
    enabled: true,
  },
  aptRent: {
    key: "aptRent",
    label: "아파트 전월세",
    category: "rent",
    service: "RTMSDataSvcAptRent",
    operation: "getRTMSDataSvcAptRent",
    nameFields: ["aptNm"],
    enabled: true,
  },
  rhTrade: {
    key: "rhTrade",
    label: "연립다세대 매매",
    category: "trade",
    service: "RTMSDataSvcRHTrade",
    operation: "getRTMSDataSvcRHTrade",
    nameFields: ["mhouseNm"],
    enabled: false,
  },
  rhRent: {
    key: "rhRent",
    label: "연립다세대 전월세",
    category: "rent",
    service: "RTMSDataSvcRHRent",
    operation: "getRTMSDataSvcRHRent",
    nameFields: ["mhouseNm"],
    enabled: false,
  },
  shTrade: {
    key: "shTrade",
    label: "단독다가구 매매",
    category: "trade",
    service: "RTMSDataSvcSHTrade",
    operation: "getRTMSDataSvcSHTrade",
    nameFields: ["houseType"],
    enabled: false,
  },
  shRent: {
    key: "shRent",
    label: "단독다가구 전월세",
    category: "rent",
    service: "RTMSDataSvcSHRent",
    operation: "getRTMSDataSvcSHRent",
    nameFields: ["houseType"],
    enabled: false,
  },
  offiTrade: {
    key: "offiTrade",
    label: "오피스텔 매매",
    category: "trade",
    service: "RTMSDataSvcOffiTrade",
    operation: "getRTMSDataSvcOffiTrade",
    nameFields: ["offiNm"],
    enabled: false,
  },
  offiRent: {
    key: "offiRent",
    label: "오피스텔 전월세",
    category: "rent",
    service: "RTMSDataSvcOffiRent",
    operation: "getRTMSDataSvcOffiRent",
    nameFields: ["offiNm"],
    enabled: false,
  },
  landTrade: {
    key: "landTrade",
    label: "토지 매매",
    category: "trade",
    service: "RTMSDataSvcLandTrade",
    operation: "getRTMSDataSvcLandTrade",
    nameFields: ["umdNm"],
    enabled: false,
  },
  nrgTrade: {
    key: "nrgTrade",
    label: "상업업무용 매매",
    category: "trade",
    service: "RTMSDataSvcNrgTrade",
    operation: "getRTMSDataSvcNrgTrade",
    nameFields: ["buildingType", "umdNm"],
    enabled: false,
  },
  silvTrade: {
    key: "silvTrade",
    label: "분양입주권 매매",
    category: "trade",
    service: "RTMSDataSvcSilvTrade",
    operation: "getRTMSDataSvcSilvTrade",
    nameFields: ["aptNm", "umdNm"],
    enabled: true,
  },
};

export const DEFAULT_DATASET = "aptTrade";

export function getDataset(key: string | undefined): Dataset | undefined {
  return DATASETS[key ?? DEFAULT_DATASET];
}

export function enabledDatasets(): Dataset[] {
  return Object.values(DATASETS).filter((d) => d.enabled);
}
