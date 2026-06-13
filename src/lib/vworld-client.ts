// VWorld 지적도(LP_PA_CBND_BUBUN) 를 브라우저에서 JSONP 로 직접 호출.
// 이유: VWorld 가 Cloudflare/데이터센터 IP 의 서버 요청을 520 으로 차단함(워커 경유 불가).
//       또 CORS 미지원 → fetch 불가. JSONP(script 태그)로 우회하면 사용자(한국) IP +
//       Referer=land.zihado.com 로 호출되어 정상 동작한다.
// 키는 land.zihado.com 도메인에 묶여 있어 클라이언트 노출이 안전(VWorld 권장 사용 패턴).
import type { Parcel } from "./api";

const KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;
const DOMAIN = "land.zihado.com"; // 키 등록 도메인 (고정)

/* eslint-disable @typescript-eslint/no-explicit-any */
let seq = 0;

export function fetchParcelClient(lat: number, lng: number): Promise<Parcel | null> {
  if (typeof window === "undefined" || !KEY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const cb = `__vw_${Date.now()}_${seq++}`;
    const script = document.createElement("script");
    let done = false;
    const finish = (p: Parcel | null) => {
      if (done) return;
      done = true;
      delete (window as any)[cb];
      script.remove();
      resolve(p);
    };
    (window as any)[cb] = (data: any) => {
      try {
        if (data?.response?.status !== "OK") return finish(null);
        const feat = data.response.result?.featureCollection?.features?.[0];
        const geom = feat?.geometry;
        if (!geom) return finish(null);
        const polys: any[] = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
        const rings = polys
          .map((p) => p?.[0])
          .filter(Array.isArray)
          .map((ring: number[][]) => ring.map((c) => [c[0], c[1]] as [number, number]));
        if (rings.length === 0) return finish(null);
        const props = feat.properties ?? {};
        finish({ jibun: String(props.jibun ?? ""), addr: String(props.addr ?? ""), rings });
      } catch {
        finish(null);
      }
    };
    script.onerror = () => finish(null);
    script.src =
      `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN` +
      `&key=${encodeURIComponent(KEY)}&domain=${DOMAIN}` +
      `&format=json&crs=EPSG:4326&geometry=true&attribute=true&size=1` +
      `&geomFilter=POINT(${lng}%20${lat})&callback=${cb}`;
    setTimeout(() => finish(null), 8000); // 타임아웃 가드
    document.head.appendChild(script);
  });
}
