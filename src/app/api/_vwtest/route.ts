// VWorld 가 Vercel 서울(AWS icn1) IP 에서 닿는지 테스트용 (임시). nodejs 런타임 = AWS IP.
export const runtime = "nodejs";
export const preferredRegion = ["icn1"];

export async function GET(): Promise<Response> {
  const KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;
  const url =
    `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN` +
    `&key=${KEY}&domain=land.zihado.com&format=json&crs=EPSG:4326&geometry=true&size=1` +
    `&geomFilter=POINT(127.059339817012%2037.5182872615614)`;
  const t0 = Date.now();
  try {
    const r = await fetch(url);
    const text = await r.text();
    return Response.json({
      region: process.env.VERCEL_REGION ?? "?",
      httpStatus: r.status,
      ms: Date.now() - t0,
      vworldStatus: (() => { try { return JSON.parse(text)?.response?.status; } catch { return "parse-fail"; } })(),
      sample: text.slice(0, 120),
    });
  } catch (e) {
    return Response.json({ region: process.env.VERCEL_REGION ?? "?", error: String(e), ms: Date.now() - t0 });
  }
}
