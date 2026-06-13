import type { Env } from "./env";
import type { Transaction } from "./molit";

// 당월/전월은 자주 갱신되므로 짧게, 그 이전은 사실상 불변이라 길게 캐시
export function ttlSeconds(dealYmd: string, now = new Date()): number {
  const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = (() => {
    let y = now.getFullYear();
    let m = now.getMonth(); // 0-based → 전월
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    return `${y}${String(m).padStart(2, "0")}`;
  })();
  if (dealYmd >= cur) return 60 * 30; // 당월: 30분
  if (dealYmd === prev) return 60 * 60 * 6; // 전월: 6시간
  return 60 * 60 * 24 * 30; // 과거: 30일
}

const monKey = (dataset: string, sggCd: string, dealYmd: string) =>
  `mon:${dataset}:${sggCd}:${dealYmd}`;

export async function getMonthKV(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string
): Promise<Transaction[] | null> {
  const v = await env.CACHE.get(monKey(dataset, sggCd, dealYmd), "json");
  return (v as Transaction[]) ?? null;
}

export async function putMonthKV(
  env: Env,
  dataset: string,
  sggCd: string,
  dealYmd: string,
  rows: Transaction[]
): Promise<void> {
  await env.CACHE.put(monKey(dataset, sggCd, dealYmd), JSON.stringify(rows), {
    expirationTtl: ttlSeconds(dealYmd),
  });
}

// 동일 키 동시 요청 중복 제거: cold miss 시 여러 요청이 동시에 producer 실행하는 것을 방지
const _inflight = new Map<string, Promise<unknown>>();

// 범용 KV 응답 캐시: 키가 있으면 즉시 반환, 없으면 producer 실행 후 저장
export async function cachedJson<T>(
  env: Env,
  key: string,
  ttl: number,
  producer: () => Promise<T>
): Promise<T> {
  const hit = await env.CACHE.get(key, "json");
  if (hit !== null && hit !== undefined) return hit as T;
  const flying = _inflight.get(key);
  if (flying) return flying as Promise<T>;
  const p = producer().then(async (v) => {
    await env.CACHE.put(key, JSON.stringify(v), { expirationTtl: ttl });
    _inflight.delete(key);
    return v;
  }).catch((e) => {
    _inflight.delete(key);
    throw e;
  });
  _inflight.set(key, p);
  return p;
}

