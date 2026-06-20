// 인스타그램 자동 게시 (landman.official) — Instagram Login API(graph.instagram.com).
// 매일 10:05 KST cron 에서 postDailyTop 호출: "오늘의 주목 실거래 TOP" 카드를 게시.
//
// 게시 2단계: POST /me/media {image_url, caption} → creation_id (비동기 검증 FINISHED 대기)
//            → POST /me/media_publish {creation_id}.
// 이미지는 Vercel OG 라우트(land.zihado.com/og/today-top)가 PNG 로 생성(검증: PNG 수락 OK).
// 토큰은 60일 만료 → KV(ig:token)에 저장하고 refreshToken 으로 주간 갱신
// (워커는 자기 secret 을 못 바꾸므로 KV 가 갱신 가능한 저장소).

import { REGION_NAMES } from "./regions";
import { recentDeals } from "./db";
import type { Env } from "./env";

const GRAPH = "https://graph.instagram.com/v21.0";
const REFRESH = "https://graph.instagram.com/refresh_access_token";
const VERCEL_BASE = "https://land.zihado.com";
const TOKEN_KEY = "ig:token";

// 당월 YYYYMM. ⚠️ 워커는 self-HTTP(api.zihado.com/land.zihado.com/workers.dev) 가
// 전부 self-loop(522/리다이렉트/1042)로 막히므로 recent 데이터는 D1 직조회로 얻는다.
function curYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}`;
}

type Deal = {
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

const amountOf = (d: Deal): number => d.dealAmount || d.deposit || 0;

// OG 카드(src/lib/topDeals.ts)와 동일 규칙 — 이미지와 캡션이 같은 거래를 가리키도록.
export function pickTopDeals(deals: Deal[], n = 5): Deal[] {
  const valid = deals.filter((d) => amountOf(d) > 0 && !!d.aptName);
  if (valid.length === 0) return [];
  const latest = valid[0]?.dealDate ?? "";
  let pool = valid.filter((d) => d.dealDate === latest);
  if (pool.length < n) pool = valid.slice(0, Math.max(n * 4, 20));
  return [...pool].sort((a, b) => amountOf(b) - amountOf(a)).slice(0, n);
}

function formatEok(manwon: number): string {
  if (!manwon) return "-";
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

function regionLabel(d: Deal): string {
  const r = d.sggCd ? REGION_NAMES[d.sggCd] : undefined;
  const gu = r ? `${r.sido} ${r.name}` : "";
  return [gu, d.umdNm].filter(Boolean).join(" ");
}

function dateLabel(latest: string): string {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(latest)
    ? latest
    : new Date().toISOString().slice(0, 10);
  const [, m, day] = s.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
}

export function buildCaption(top: Deal[], latest: string): string {
  const lines = top.map((d, i) => {
    const tag = d.isHigh
      ? " 🔥신고가"
      : typeof d.rise === "number" && d.rise >= 1
        ? ` ▲${d.rise.toFixed(1)}%`
        : "";
    return `${i + 1}. ${d.aptName} (${regionLabel(d)}) — ${formatEok(amountOf(d))}${tag}`;
  });
  const sidos = [
    ...new Set(top.map((d) => (d.sggCd ? REGION_NAMES[d.sggCd]?.sido : undefined)).filter(Boolean)),
  ];
  const tags = [
    "#부동산", "#아파트실거래가", "#국토교통부", "#실거래가", "#아파트매매",
    "#부동산투자", "#내집마련", "#땅값",
    ...sidos.map((s) => `#${s}부동산`),
  ];
  return [
    `📊 ${dateLabel(latest)} 오늘의 주목 실거래 TOP`,
    "",
    ...lines,
    "",
    "전국 아파트 실거래를 지도 위에서 한눈에 👇",
    "🔗 프로필 링크 클릭 → https://land.zihado.com",
    "",
    tags.join(" "),
  ].join("\n");
}

async function getToken(env: Env): Promise<string | null> {
  const stored = await env.CACHE.get(TOKEN_KEY, "json").catch(() => null) as
    | { token?: string }
    | null;
  return stored?.token ?? env.INSTAGRAM_TOKEN ?? null;
}

async function telegram(env: Env, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 컨테이너가 FINISHED 될 때까지 폴링 (최대 ~60s). ERROR/타임아웃이면 throw.
async function waitContainer(creationId: string, token: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(
      `${GRAPH}/${creationId}?fields=status_code,status&access_token=${token}`
    );
    const j = (await r.json()) as { status_code?: string; status?: string };
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR")
      throw new Error(`container ERROR: ${j.status ?? ""}`);
    await sleep(3000);
  }
  throw new Error("container 검증 타임아웃");
}

// 매일 10:05 KST: 오늘의 주목 실거래 TOP 카드를 IG 게시.
export async function postDailyTop(env: Env): Promise<void> {
  try {
    const token = await getToken(env);
    if (!token) {
      await telegram(env, "⚠️ IG 게시 실패: 토큰 없음 (KV ig:token 미설정)");
      return;
    }

    // D1 직조회(전국 당월 최신순). self-HTTP 금지 → recentDeals 직접 호출.
    const deals = (await recentDeals(env, "aptTrade", curYmd(), null, 200)) as unknown as Deal[];
    const top = pickTopDeals(deals, 5);
    if (top.length === 0) {
      await telegram(env, "ℹ️ IG 게시 건너뜀: 오늘 신고된 거래 없음");
      return;
    }

    const latest = top[0]?.dealDate || new Date().toISOString().slice(0, 10);
    const caption = buildCaption(top, latest);
    const imageUrl = `${VERCEL_BASE}/og/today-top?date=${latest}`;

    // OG 이미지 콜드 렌더(~6s)로 IG fetch 타임아웃 나는 것 방지 → 먼저 워밍.
    // (워커→Vercel 은 self-loop 아님. /og 는 Vercel 함수가 서빙)
    await fetch(imageUrl).catch(() => {});

    // 1) 컨테이너 생성
    const createRes = await fetch(`${GRAPH}/me/media`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
    });
    const created = (await createRes.json()) as { id?: string; error?: { message?: string } };
    if (!created.id)
      throw new Error(`컨테이너 생성 실패: ${created.error?.message ?? createRes.status}`);

    // 2) 검증 완료 대기 → 3) 게시
    await waitContainer(created.id, token);
    const pubRes = await fetch(`${GRAPH}/me/media_publish`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: created.id, access_token: token }),
    });
    const pub = (await pubRes.json()) as { id?: string; error?: { message?: string } };
    if (!pub.id) throw new Error(`게시 실패: ${pub.error?.message ?? pubRes.status}`);

    await telegram(env, `✅ IG 게시 완료 (${latest}) — media ${pub.id}\n1위: ${top[0].aptName}`);
  } catch (e) {
    await telegram(env, `❌ IG 게시 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 주간 cron: 장기 토큰(60일) 갱신 후 KV 에 다시 저장.
export async function refreshToken(env: Env): Promise<void> {
  try {
    const token = await getToken(env);
    if (!token) return;
    const r = await fetch(
      `${REFRESH}?grant_type=ig_refresh_token&access_token=${token}`
    );
    const j = (await r.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!j.access_token)
      throw new Error(j.error?.message ?? `refresh 실패 ${r.status}`);
    await env.CACHE.put(
      TOKEN_KEY,
      JSON.stringify({ token: j.access_token, refreshedAt: Date.now(), expiresIn: j.expires_in })
    );
    const days = Math.round((j.expires_in ?? 0) / 86400);
    await telegram(env, `🔄 IG 토큰 갱신 완료 — 만료 ${days}일 후`);
  } catch (e) {
    await telegram(env, `❌ IG 토큰 갱신 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}
