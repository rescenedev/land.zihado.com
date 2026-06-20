import { ImageResponse } from "next/og";

// 인스타 프로필 사진(원형 크롭). 1080x1080, 중앙 안전영역 안에 마크 배치.
// ?v=1 실 마크 / ?v=2 땅값 워드마크 / ?v=3 로고칩(실+땅값).
// ⚠️ Satori: 자식 2개 이상 div 는 display 명시 필수 → 모든 div 에 display:flex.
export const size = { width: 1080, height: 1080 };
export const contentType = "image/png";

const FONT_BOLD =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Black.otf";

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(FONT_BOLD);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function variant1() {
  // 큰 "실" 글리프 — 기존 로고 마크. 네이비+블루 글로우.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1120",
        backgroundImage:
          "radial-gradient(620px 620px at 50% 42%, rgba(37,99,235,0.55), transparent)",
        color: "#f8fafc",
      }}
    >
      <div style={{ display: "flex", fontSize: 620, fontWeight: 900, lineHeight: 1, marginTop: -30 }}>
        실
      </div>
    </div>
  );
}

function variant2() {
  // "땅값" 워드마크 — 풀블리드 블루 그라데이션.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#2563eb",
        backgroundImage: "linear-gradient(150deg, #3b82f6 0%, #1e40af 100%)",
        color: "#ffffff",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", fontSize: 360, fontWeight: 900, letterSpacing: -8, lineHeight: 1 }}>
        땅값
      </div>
      <div style={{ display: "flex", fontSize: 58, fontWeight: 900, letterSpacing: 18, color: "rgba(255,255,255,0.72)" }}>
        실거래
      </div>
    </div>
  );
}

function variant3() {
  // 로고칩(블루 라운드 스퀘어 안 "실") + "땅값" — 헤더 로고와 동일 룩.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1120",
        backgroundImage:
          "radial-gradient(700px 500px at 50% 30%, rgba(37,99,235,0.4), transparent)",
        color: "#f8fafc",
        gap: 44,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 360,
          height: 360,
          borderRadius: 88,
          background: "#2563eb",
          fontSize: 240,
          fontWeight: 900,
          color: "#ffffff",
        }}
      >
        실
      </div>
      <div style={{ display: "flex", fontSize: 150, fontWeight: 900, letterSpacing: -4 }}>
        땅값
      </div>
    </div>
  );
}

function variant4() {
  // "아파트 / 실거래" 2줄 — 네이비 배경 + 실거래 블루 악센트.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1120",
        backgroundImage:
          "radial-gradient(680px 600px at 50% 45%, rgba(37,99,235,0.45), transparent)",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", fontSize: 280, fontWeight: 900, letterSpacing: -8, lineHeight: 1.04, color: "#f8fafc" }}>
        아파트
      </div>
      <div style={{ display: "flex", fontSize: 280, fontWeight: 900, letterSpacing: -8, lineHeight: 1.04, color: "#60a5fa" }}>
        실거래
      </div>
    </div>
  );
}

function variant5() {
  // "아파트 / 실거래" 2줄 — 풀블리드 블루 그라데이션, 둘 다 화이트.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#2563eb",
        backgroundImage: "linear-gradient(150deg, #3b82f6 0%, #1e40af 100%)",
        color: "#ffffff",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", fontSize: 280, fontWeight: 900, letterSpacing: -8, lineHeight: 1.04 }}>
        아파트
      </div>
      <div style={{ display: "flex", fontSize: 280, fontWeight: 900, letterSpacing: -8, lineHeight: 1.04 }}>
        실거래
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const v = new URL(req.url).searchParams.get("v") ?? "1";
  const font = await loadFont();
  const fonts = font
    ? [{ name: "Pretendard", data: font, weight: 900 as const, style: "normal" as const }]
    : undefined;
  const tree =
    v === "2" ? variant2()
    : v === "3" ? variant3()
    : v === "4" ? variant4()
    : v === "5" ? variant5()
    : variant1();
  return new ImageResponse(tree, {
    ...size,
    fonts,
  });
}
