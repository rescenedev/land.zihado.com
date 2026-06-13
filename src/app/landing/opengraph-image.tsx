import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "땅값 · 전국 아파트 실거래 대시보드";

const FONT_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf";

export default async function Image() {
  // 한글 렌더링용 폰트 (실패 시 폰트 없이 진행)
  let fonts: { name: string; data: ArrayBuffer; weight: 700; style: "normal" }[] | undefined;
  try {
    const data = await fetch(FONT_URL).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (data) fonts = [{ name: "Pretendard", data, weight: 700, style: "normal" }];
  } catch {
    fonts = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b1120",
          backgroundImage:
            "radial-gradient(900px 400px at 50% -10%, rgba(37,99,235,0.35), transparent)",
          padding: "72px 80px",
          color: "#f1f5f9",
          fontFamily: "Pretendard, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            실
          </div>
          <div style={{ fontSize: 26, color: "#93c5fd", fontWeight: 700 }}>
            국토교통부 실거래가 · 전국
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>
            전국 아파트 실거래,
          </div>
          <div
            style={{
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -2,
              color: "#60a5fa",
            }}
          >
            지도 위에서 한눈에
          </div>
          <div style={{ fontSize: 30, color: "#94a3b8", marginTop: 12 }}>
            지도 단지 시세 · 오늘의 실거래 · 입지 스코어링 · 통계
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#34d399" }}>land.zihado.com</div>
          <div style={{ fontSize: 24, color: "#64748b" }}>
            매매 · 전월세 · 분양권 · 전국 시군구
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
