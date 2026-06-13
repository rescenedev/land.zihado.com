// VWorld 연속지적도(LP_PA_CBND_BUBUN): 좌표가 속한 필지(지번)의 경계 폴리곤.
// 단지 대표 거래 좌표를 POINT로 질의해 단지 대지 경계를 근사한다.

const VWORLD_DATA = "https://api.vworld.kr/req/data";

export type Parcel = {
  jibun: string;
  addr: string;
  // 외곽 링 목록. 각 링은 [lng, lat] 좌표 배열 (카카오 폴리곤 path 용).
  rings: [number, number][][];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractRings(geometry: any): [number, number][][] {
  if (!geometry) return [];
  // Polygon: coordinates[ring][pt] / MultiPolygon: coordinates[poly][ring][pt]
  const polys: any[] =
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polys
    .map((poly) => poly?.[0]) // 외곽 링만 (구멍 무시)
    .filter(Array.isArray)
    .map((ring: number[][]) => ring.map((c) => [c[0], c[1]] as [number, number]));
}

export async function fetchParcel(
  key: string,
  domain: string,
  lat: number,
  lng: number
): Promise<Parcel | null> {
  if (!key) return null;
  const url =
    `${VWORLD_DATA}?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN` +
    `&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(domain)}` +
    `&format=json&crs=EPSG:4326&geometry=true&attribute=true&size=1` +
    `&geomFilter=POINT(${lng}%20${lat})`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data?.response?.status !== "OK") return null;
    const feat = data.response.result?.featureCollection?.features?.[0];
    if (!feat) return null;
    const rings = extractRings(feat.geometry);
    if (rings.length === 0) return null;
    const props = feat.properties ?? {};
    return { jibun: String(props.jibun ?? ""), addr: String(props.addr ?? ""), rings };
  } catch {
    return null;
  }
}
