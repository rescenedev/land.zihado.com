import { XMLParser } from "fast-xml-parser";
import { getDataset, type Dataset, type Category } from "./datasets";

const APTLIST_URL =
  "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
const RTMS_BASE = "https://apis.data.go.kr/1613000";
const TIMEOUT_MS = 12000;

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

export type Transaction = {
  id: string;
  dataset: string;
  category: Category;
  sggCd: string;
  dealYmd: string;
  dealDate: string;
  umdNm: string;
  jibun: string;
  aptName: string;
  aptDong: string;
  dealAmount: number; // 만원 (매매)
  deposit: number; // 만원 (전월세 보증금)
  monthlyRent: number; // 만원 (전월세 월세)
  area: number; // 전용/대지 면적 m2
  floor: number;
  buildYear: number;
  dealingGbn: string;
  buyerGbn: string;
  slerGbn: string;
  rgstDate: string;
  agentSgg: string;
  cdealType: string;
  cdealDay: string;
  extra?: Record<string, string>; // 데이터셋별 원본 태그 전체(D1 저장용 — API 응답엔 미포함)
};

export type Complex = {
  kaptCode: string;
  kaptName: string;
  bjdCode: string;
  sggCd: string;
  sido: string;
  sigungu: string;
  dong: string;
};

/** 미신청(403) API 호출 시 던지는 타입 에러 */
export class SubscriptionError extends Error {
  constructor(public dataset: string) {
    super(`dataset '${dataset}' 는 이 서비스키에 활용신청되지 않았습니다 (403)`);
    this.name = "SubscriptionError";
  }
}

function toNum(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function asArray<T>(node: T | T[] | undefined): T[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

function pick(it: Record<string, unknown>, fields: string[]): string {
  for (const f of fields) {
    const v = str(it[f]);
    if (v) return v;
  }
  return "";
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue; // 5xx 재시도
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

function naturalId(
  ds: Dataset,
  sggCd: string,
  it: Record<string, unknown>,
  amountSig: string
): string {
  return [
    ds.key,
    sggCd,
    str(it.umdNm),
    str(it.jibun),
    pick(it, ds.nameFields),
    `${str(it.dealYear)}-${str(it.dealMonth)}-${str(it.dealDay)}`,
    str(it.excluUseAr),
    str(it.floor),
    amountSig,
  ].join("|");
}

/** 임의 데이터셋의 한 달치 실거래 전량 (페이지 루프) */
export async function fetchMonth(
  serviceKey: string,
  datasetKey: string,
  sggCd: string,
  dealYmd: string
): Promise<Transaction[]> {
  const ds = getDataset(datasetKey);
  if (!ds) throw new Error(`unknown dataset '${datasetKey}'`);

  const rows: Transaction[] = [];
  const numOfRows = 1000;
  let pageNo = 1;
  // 동일 자연키 충돌 시 발생순번을 붙여 전 행 보존 (MOLIT 응답 순서가 안정적이라 멱등)
  const seen = new Map<string, number>();

  for (;;) {
    const url =
      `${RTMS_BASE}/${ds.service}/${ds.operation}` +
      `?serviceKey=${encodeURIComponent(serviceKey)}` +
      `&LAWD_CD=${sggCd}&DEAL_YMD=${dealYmd}` +
      `&numOfRows=${numOfRows}&pageNo=${pageNo}`;

    const res = await fetchWithRetry(url);
    if (res.status === 403) throw new SubscriptionError(ds.key);
    if (!res.ok) throw new Error(`MOLIT ${ds.key} HTTP ${res.status}`);

    const xml = await res.text();
    const parsed = parser.parse(xml);

    const code = str(parsed?.response?.header?.resultCode);
    if (code && code !== "000" && code !== "00") {
      throw new Error(
        `MOLIT ${ds.key} error ${code}: ${str(parsed?.response?.header?.resultMsg)}`
      );
    }

    const items = asArray<Record<string, unknown>>(
      parsed?.response?.body?.items?.item
    );
    for (const it of items) {
      const y = str(it.dealYear);
      const m = str(it.dealMonth).padStart(2, "0");
      const d = str(it.dealDay).padStart(2, "0");
      const dealAmount = toNum(it.dealAmount);
      const deposit = toNum(it.deposit);
      const monthlyRent = toNum(it.monthlyRent);
      const amountSig =
        ds.category === "rent" ? `${deposit}/${monthlyRent}` : `${dealAmount}`;

      // 원본 태그 전부 보존 (타입별 고유 필드 손실 방지)
      const extra: Record<string, string> = {};
      for (const [kk, vv] of Object.entries(it)) extra[kk] = str(vv);

      const baseId = naturalId(ds, sggCd, it, amountSig);
      const n = (seen.get(baseId) ?? 0) + 1;
      seen.set(baseId, n);
      const id = n === 1 ? baseId : `${baseId}#${n}`;

      rows.push({
        id,
        dataset: ds.key,
        category: ds.category,
        sggCd,
        dealYmd,
        dealDate: y ? `${y}-${m}-${d}` : "",
        umdNm: str(it.umdNm),
        jibun: str(it.jibun),
        aptName: pick(it, ds.nameFields),
        aptDong: str(it.aptDong),
        dealAmount,
        deposit,
        monthlyRent,
        area: toNum(it.excluUseAr) || toNum(it.dealArea) || toNum(it.plottageAr),
        floor: toNum(it.floor),
        buildYear: toNum(it.buildYear),
        dealingGbn: str(it.dealingGbn),
        buyerGbn: str(it.buyerGbn),
        slerGbn: str(it.slerGbn),
        rgstDate: str(it.rgstDate),
        agentSgg: str(it.estateAgentSggNm),
        cdealType: str(it.cdealType),
        cdealDay: str(it.cdealDay),
        extra,
      });
    }

    const total = toNum(parsed?.response?.body?.totalCount);
    if (items.length < numOfRows || pageNo * numOfRows >= total) break;
    pageNo += 1;
    if (pageNo > 50) break;
  }

  rows.sort((a, b) => b.dealDate.localeCompare(a.dealDate));
  return rows;
}

/** 시군구 단지목록 전량 */
export async function fetchComplexes(
  serviceKey: string,
  sggCd: string
): Promise<Complex[]> {
  const out: Complex[] = [];
  const numOfRows = 1000;
  let pageNo = 1;

  for (;;) {
    const url =
      `${APTLIST_URL}?serviceKey=${encodeURIComponent(serviceKey)}` +
      `&sigunguCode=${sggCd}&numOfRows=${numOfRows}&pageNo=${pageNo}`;

    const res = await fetchWithRetry(url);
    if (res.status === 403) throw new SubscriptionError("complexes");
    if (!res.ok) throw new Error(`MOLIT aptlist HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parser.parse(xml);

    // <result> 아래 <response> 노드가 2개(body용/header용)로 분리돼 배열로 파싱됨
    const responses = asArray<Record<string, unknown>>(
      parsed?.result?.response ?? parsed?.response
    );
    const bodyNode = responses.find((r) => r && (r as { body?: unknown }).body) as
      | { body?: { items?: unknown } }
      | undefined;
    const itemsNode = (bodyNode?.body?.items ??
      (parsed?.response?.body?.items as { item?: unknown } | undefined)?.item) as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined;
    const bodyItems = asArray<Record<string, unknown>>(itemsNode);

    for (const it of bodyItems) {
      const bjd = str(it.bjdCode);
      out.push({
        kaptCode: str(it.kaptCode),
        kaptName: str(it.kaptName),
        bjdCode: bjd,
        sggCd: bjd.slice(0, 5),
        sido: str(it.as1),
        sigungu: str(it.as2),
        dong: str(it.as3),
      });
    }

    if (bodyItems.length < numOfRows) break;
    pageNo += 1;
    if (pageNo > 50) break;
  }

  return out.filter((c) => c.kaptCode);
}
