import { ImageResponse } from "next/og";
import { formatEok } from "@/lib/format";
import { pickTopDeals, type DealLike } from "@/lib/topDeals";

// 인스타그램 "오늘의 주목 실거래 TOP" 카드. 워커 cron이 매일 10:05 KST에
// land.zihado.com/og/today-top?date=YYYY-MM-DD 를 IG image_url 로 게시한다.
// 4:5 세로(1080x1350) = IG 피드 최대 노출 비율.
// ⚠️ Satori(next/og) 제약: 자식 노드가 둘 이상인 div 는 display 명시 필수 →
//    이 파일은 모든 div 에 display:flex 를 둔다(누락 시 "failed to pipe response" 500).
export const size = { width: 1080, height: 1350 };
export const contentType = "image/png";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://api.zihado.com";
const FONT_BOLD =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf";

type RecentResponse = { latest?: string; deals?: DealLike[] };

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(FONT_BOLD);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function loadDeals(): Promise<{ deals: DealLike[]; latest: string }> {
  try {
    const r = await fetch(
      `${API_BASE}/api/recent?dataset=aptTrade&scope=all&limit=200`,
      { next: { revalidate: 600 } }
    );
    if (!r.ok) return { deals: [], latest: "" };
    const d = (await r.json()) as RecentResponse;
    return { deals: d.deals ?? [], latest: d.latest ?? "" };
  } catch {
    return { deals: [], latest: "" };
  }
}

function badge(d: DealLike): { text: string; color: string } | null {
  if (d.isHigh) return { text: "신고가", color: "#f43f5e" };
  if (typeof d.rise === "number" && d.rise >= 1)
    return { text: `▲ ${d.rise.toFixed(1)}%`, color: "#f59e0b" };
  if (d.isFirst) return { text: "첫 거래", color: "#38bdf8" };
  return null;
}

function dateLabel(latest: string): string {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(latest)
    ? latest
    : new Date().toISOString().slice(0, 10);
  const [, m, day] = s.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
}

export async function GET() {
  const [font, { deals, latest }] = await Promise.all([loadFont(), loadDeals()]);
  const top = pickTopDeals(deals, 5);
  const fonts = font
    ? [{ name: "Pretendard", data: font, weight: 700 as const, style: "normal" as const }]
    : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0b1120",
          backgroundImage:
            "radial-gradient(1000px 500px at 50% -8%, rgba(37,99,235,0.4), transparent)",
          padding: "84px 72px",
          color: "#f1f5f9",
          fontFamily: "Pretendard, sans-serif",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                width: 60,
                height: 60,
                borderRadius: 18,
                background: "#2563eb",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              실
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#93c5fd", fontWeight: 700 }}>
              {`${dateLabel(latest)} · 국토교통부 실거래`}
            </div>
          </div>
          <div
            style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}
          >
            오늘의 주목 실거래
          </div>
        </div>

        {/* TOP 리스트 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            marginTop: 56,
            flex: 1,
          }}
        >
          {top.map((d, i) => {
            const b = badge(d);
            const amount = d.dealAmount || d.deposit || 0;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 24,
                  padding: "26px 30px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 44,
                    fontWeight: 700,
                    color: i === 0 ? "#fbbf24" : "#475569",
                    width: 56,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
                      {d.aptName}
                    </div>
                    {b && (
                      <div
                        style={{
                          display: "flex",
                          fontSize: 24,
                          fontWeight: 700,
                          color: b.color,
                          background: "rgba(255,255,255,0.06)",
                          padding: "4px 14px",
                          borderRadius: 999,
                        }}
                      >
                        {b.text}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", fontSize: 28, color: "#94a3b8" }}>
                    {`${d.umdNm ?? ""} · 전용 ${d.area ? `${Math.round(d.area)}㎡` : "-"}`}
                  </div>
                </div>
                <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#60a5fa" }}>
                  {formatEok(amount)}
                </div>
              </div>
            );
          })}
          {top.length === 0 && (
            <div style={{ display: "flex", fontSize: 34, color: "#94a3b8" }}>
              아직 오늘 신고된 거래가 없습니다. 내일 다시 만나요.
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 40,
          }}
        >
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#34d399" }}>
            land.zihado.com
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#64748b" }}>지도 위에서 한눈에</div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
