// Kakao Local API: 좌표 주변 시설 검색 (펀팩트)

type Hit = { name: string; distance: number; walkMin: number; lat: number; lng: number } | null;

const walk = (m: number) => Math.max(1, Math.round(m / 67)); // 도보 약 67m/분

type KakaoDoc = {
  place_name: string;
  category_name?: string;
  distance: string;
  x: string;
  y: string;
};

async function kakao(
  restKey: string,
  kind: "keyword" | "category",
  param: string,
  lat: number,
  lng: number,
  radius = 3000,
  filter?: (d: KakaoDoc) => boolean
): Promise<Hit> {
  const base = `https://dapi.kakao.com/v2/local/search/${kind}.json`;
  const q =
    kind === "category"
      ? `category_group_code=${param}`
      : `query=${encodeURIComponent(param)}`;
  // 필터가 있으면 후보를 넉넉히 받아 거리순으로 첫 일치 선택
  const size = filter ? 15 : 1;
  const url = `${base}?${q}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=${size}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${restKey}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { documents?: KakaoDoc[] };
    const docs = data.documents ?? [];
    const d = filter ? docs.find(filter) : docs[0];
    if (!d) return null;
    const dist = Number(d.distance) || 0;
    return { name: d.place_name, distance: dist, walkMin: walk(dist), lat: Number(d.y), lng: Number(d.x) };
  } catch {
    return null;
  }
}

// 종합병원·대학병원만 (의원/클리닉/검진센터 제외)
const isMajorHospital = (d: KakaoDoc): boolean => {
  const cat = d.category_name ?? "";
  const name = d.place_name ?? "";
  return /종합병원|대학병원/.test(cat) || /대학교병원|대학병원|의료원/.test(name);
};

export type Nearby = {
  subway: Hit;
  hubs: { name: string; distance: number; carMin: number }[];
  facilities: { key: string; label: string; hit: Hit }[];
};

// 주요 도심 (업무지구) 좌표
const HUBS: { name: string; lat: number; lng: number }[] = [
  { name: "강남", lat: 37.4979, lng: 127.0276 },
  { name: "여의도", lat: 37.5215, lng: 126.9242 },
  { name: "종로", lat: 37.5704, lng: 126.992 },
  { name: "판교", lat: 37.3948, lng: 127.1112 },
];

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

export async function findNearby(
  restKey: string,
  lat: number,
  lng: number
): Promise<Nearby> {
  const specs: {
    key: string;
    label: string;
    kind: "keyword" | "category";
    param: string;
    radius?: number;
    filter?: (d: KakaoDoc) => boolean;
  }[] = [
    { key: "office", label: "관공서", kind: "category", param: "PO3" },
    { key: "police", label: "경찰서", kind: "keyword", param: "경찰서" },
    { key: "fire", label: "소방서", kind: "keyword", param: "소방서" },
    // 종합병원·대학병원만 (의원/치과/동물병원/검진센터 제외)
    { key: "hospital", label: "종합병원", kind: "keyword", param: "종합병원", radius: 5000, filter: isMajorHospital },
    { key: "elem", label: "초등학교", kind: "keyword", param: "초등학교" },
    { key: "middle", label: "중학교", kind: "keyword", param: "중학교" },
    { key: "high", label: "고등학교", kind: "keyword", param: "고등학교" },
    { key: "starbucks", label: "스타벅스", kind: "keyword", param: "스타벅스" },
    { key: "oliveyoung", label: "올리브영", kind: "keyword", param: "올리브영" },
    { key: "daiso", label: "다이소", kind: "keyword", param: "다이소" },
    { key: "musinsa", label: "무신사", kind: "keyword", param: "무신사" },
  ];

  const [subway, ...rest] = await Promise.all([
    kakao(restKey, "category", "SW8", lat, lng, 2000),
    ...specs.map((s) => kakao(restKey, s.kind, s.param, lat, lng, s.radius ?? 3000, s.filter)),
  ]);

  // 주요 도심 직선거리 + 차량 추정(평균 28km/h ≈ 약 467m/분)
  // 수도권(서울·경기) 단지에만 의미 있음 → 강남 기준 55km 밖(지방)이면 생략
  const allHubs = HUBS.map((h) => {
    const distance = haversine(lat, lng, h.lat, h.lng);
    return { name: h.name, distance, carMin: Math.max(1, Math.round(distance / 467)) };
  }).sort((a, b) => a.distance - b.distance);
  const inMetro = allHubs.length > 0 && allHubs[0].distance <= 55000;
  const hubs = inMetro ? allHubs : [];

  return {
    subway,
    hubs,
    facilities: specs.map((s, i) => ({ key: s.key, label: s.label, hit: rest[i] })),
  };
}
