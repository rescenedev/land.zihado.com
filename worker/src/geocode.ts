// Kakao Local API 지오코딩 (주소/키워드 → 좌표)

type LatLng = { lat: number; lng: number };

async function kakaoSearch(
  restKey: string,
  path: string,
  query: string
): Promise<LatLng | null> {
  const url = `https://dapi.kakao.com/v2/local/search/${path}?query=${encodeURIComponent(query)}&size=1`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${restKey}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { documents?: { x: string; y: string }[] };
  const doc = data.documents?.[0];
  if (!doc) return null;
  return { lat: Number(doc.y), lng: Number(doc.x) };
}

/**
 * 지번주소 우선, 실패 시 단지명 키워드로 폴백.
 * regionLabel 예: "서울 강남구", umd: "역삼동", jibun: "635-5", apt: "풍림지오빌"
 */
export async function geocode(
  restKey: string,
  regionLabel: string,
  umd: string,
  jibun: string,
  apt: string
): Promise<LatLng | null> {
  // 1) 지번 주소
  if (umd && jibun) {
    const a = await kakaoSearch(restKey, "address.json", `${regionLabel} ${umd} ${jibun}`);
    if (a) return a;
  }
  // 2) 단지명 키워드
  const sigungu = regionLabel.split(" ").slice(-1)[0] ?? regionLabel;
  const k = await kakaoSearch(restKey, "keyword.json", `${sigungu} ${umd} ${apt}`);
  if (k) return k;
  return null;
}
