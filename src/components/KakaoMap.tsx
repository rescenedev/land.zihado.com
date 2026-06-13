"use client";

import { useEffect, useRef, useState } from "react";
import { formatEok } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao: any;
  }
}

const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

export type MapItem = {
  key: string;
  title: string;
  count: number;
  avg84: number;
  avg: number;
  max?: number;
  isSido?: boolean;
  fresh?: boolean; // 최근 신규 거래 상위 지역 → glow
  lat: number;
  lng: number;
};

let sdkPromise: Promise<void> | null = null;
export function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.kakao?.maps) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error("Kakao SDK 로드 실패"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// 가격 그라데이션: 낮음(파랑) → 높음(빨강)
function priceColor(v: number, min: number, max: number): string {
  const r = max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0.5;
  const lo = [59, 130, 246]; // #3b82f6
  const hi = [239, 68, 68]; // #ef4444
  const c = lo.map((x, i) => Math.round(x + (hi[i] - x) * r));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// 서울 시군구 경계 GeoJSON (1회 로드 후 캐시)
let geoPromise: Promise<any> | null = null;
export function loadGuGeo(): Promise<any> {
  if (geoPromise) return geoPromise;
  geoPromise = fetch(
    "https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json"
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return geoPromise;
}

function bubbleEl(
  item: MapItem,
  maxVal: number,
  minVal: number,
  onClick: () => void,
  rank?: number
): HTMLElement {
  const headline = item.max || item.avg84 || item.avg; // 라벨: 최고가
  // 색은 스케일(min/max)과 동일 지표(평균가)로 → 지역 간 그라데이션 정상화
  const colorVal = item.avg84 || item.avg;
  const color = priceColor(colorVal, minVal, maxVal);
  const el = document.createElement("div");
  el.style.cssText = "transform:translate(-50%,-100%);cursor:pointer;user-select:none;";
  // 상위 단지(rank 1~10) 은 순위 메달 뱃지
  const rankBadge =
    rank && rank <= 10
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#fff;color:${color};font-weight:900;font-size:10px">${rank}</span>`
      : "";
  // 최근 신규 거래 상위 지역: 푸른 glow + 외곽 링
  const glowCss = item.fresh
    ? "box-shadow:0 0 0 2px rgba(96,165,250,.9),0 0 14px 2px rgba(59,130,246,.7);border:1.5px solid rgba(147,197,253,.95)"
    : "box-shadow:0 3px 12px rgba(0,0,0,.35);border:1.5px solid rgba(255,255,255,.85)";
  el.innerHTML = `
    <div style="background:${color};border-radius:999px;padding:5px 11px;${glowCss};white-space:nowrap;display:flex;align-items:center;gap:6px">
      ${rankBadge}
      <span style="font-weight:700;font-size:11px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25)">${item.title}</span>
      <span style="font-weight:800;font-size:11.5px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25)">${formatEok(headline)}</span>
    </div>`;
  el.addEventListener("click", onClick);
  return el;
}

// 단지 마커: 가격을 색으로 인코딩한 원(pill) 안에 최고가 표시. 호버 시 단지명 라벨.
function dotEl(
  item: MapItem,
  maxVal: number,
  minVal: number,
  onClick: () => void
): HTMLElement {
  const headline = item.max || item.avg84 || item.avg; // 라벨: 최고가
  const colorVal = item.avg84 || item.avg; // 색: 스케일과 동일 지표(평균가)
  const color = priceColor(colorVal, minVal, maxVal);
  const el = document.createElement("div");
  el.style.cssText = "position:relative;transform:translate(-50%,-50%);cursor:pointer;user-select:none;";
  el.innerHTML = `
    <div data-dot style="min-width:24px;height:19px;padding:0 6px;border-radius:999px;background:${color};border:1.5px solid rgba(255,255,255,.92);box-shadow:0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;transition:transform .12s ease">
      <span style="font-weight:800;font-size:10px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4);white-space:nowrap">${formatEok(headline)}</span>
    </div>
    <div data-lbl style="display:none;position:absolute;left:50%;bottom:calc(100% + 5px);transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,.96);border:1px solid ${color};border-radius:8px;padding:4px 9px;box-shadow:0 5px 16px rgba(0,0,0,.55);pointer-events:none">
      <span style="font-weight:700;font-size:11px;color:#e2e8f0">${item.title}</span>
      <span style="font-weight:800;font-size:11.5px;color:${color};margin-left:5px">${formatEok(headline)}</span>
    </div>`;
  const dot = el.querySelector("[data-dot]") as HTMLElement;
  const lbl = el.querySelector("[data-lbl]") as HTMLElement;
  el.addEventListener("mouseenter", () => {
    lbl.style.display = "block";
    dot.style.transform = "scale(1.25)";
    el.style.zIndex = "9999";
  });
  el.addEventListener("mouseleave", () => {
    lbl.style.display = "none";
    dot.style.transform = "scale(1)";
    el.style.zIndex = "";
  });
  el.addEventListener("click", onClick);
  return el;
}

export function KakaoMap({
  items,
  center,
  level,
  maxVal,
  minVal = 0,
  onSelect,
  aptMode,
  onApt,
  onViewChange,
  focusGuName,
}: {
  items: MapItem[];
  center: [number, number];
  level: number;
  maxVal: number;
  minVal?: number;
  onSelect: (key: string, isSido: boolean) => void;
  aptMode?: boolean;
  onApt?: (apt: string) => void;
  onViewChange?: (level: number, lat: number, lng: number) => void;
  focusGuName?: string | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const polysRef = useRef<any[]>([]);
  const errRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // 지도 초기화
  useEffect(() => {
    let alive = true;
    if (!KEY) return;
    loadSdk()
      .then(() => {
        if (!alive || !boxRef.current) return;
        const kakao = window.kakao;
        mapRef.current = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(center[0], center[1]),
          level,
        });
        setReady(true);
      })
      .catch(() => {
        if (errRef.current) errRef.current.style.display = "flex";
      });
    return () => {
      alive = false;
    };
    // 최초 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // center/level 변경 반영
  useEffect(() => {
    const kakao = window.kakao;
    if (!mapRef.current || !kakao) return;
    mapRef.current.setLevel(level);
    mapRef.current.setCenter(new kakao.maps.LatLng(center[0], center[1]));
  }, [center, level]);

  // 버블 오버레이 생성 (맵 준비 완료 후). 우선순위(가격) 순서 유지.
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !mapRef.current || !kakao) return;
    const map = mapRef.current;
    overlaysRef.current.forEach((e) => e.ov.setMap(null));
    overlaysRef.current = items.map((it, idx) => {
      const click = aptMode
        ? () => onApt?.(it.key)
        : () => onSelect(it.key, !!it.isSido);
      const rank = aptMode ? idx + 1 : undefined; // items 는 가격순 정렬됨
      const content = aptMode
        ? dotEl(it, maxVal, minVal, click)
        : bubbleEl(it, maxVal, minVal, click, rank);
      const ov = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(it.lat, it.lng),
        content,
        yAnchor: aptMode ? 0.5 : 1, // 점은 중앙 앵커, 라벨 핀은 하단 앵커
        zIndex: Math.round(it.max || it.avg84 || it.avg),
      });
      return { ov, lat: it.lat, lng: it.lng, rank: rank ?? 0 };
    });

    const declutter = () => {
      const proj = map.getProjection();
      if (!proj) return;

      if (aptMode) {
        // 공간 클러스터링(그리디 k-means 류): 가격 높은 순으로 대표를 배치하고,
        // 이미 놓인 대표와 화면상 가까우면(겹치면) 흡수=숨김 → 클러스터당 최고가 1개만 표시.
        // 마커는 실제 위치 유지(왜곡 없음). 줌인하면 대표 간 픽셀 간격이 벌어져
        // 더 많은 단지가 대표로 승격된다 → 확대할수록 상세.
        const W = 50; // 대표 간 최소 가로 간격(가변폭 가격 pill 기준, 겹침 방지 하한)
        const H = 22; // 세로 간격
        const placed: { x: number; y: number }[] = [];
        for (const e of overlaysRef.current) {
          // overlaysRef 는 items(가격 desc) 순 → 먼저 놓이는 게 그 클러스터의 최고가
          const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(e.lat, e.lng));
          const near = placed.some((p) => Math.abs(p.x - pt.x) < W && Math.abs(p.y - pt.y) < H);
          if (near) e.ov.setMap(null);
          else {
            e.ov.setMap(map);
            placed.push({ x: pt.x, y: pt.y });
          }
        }
        return;
      }

      // 지역(구/시도): 마커 수가 적으므로 겹치는 라벨을 서로 밀어내 전부 표시.
      const W = 98;
      const H = 30;
      const nodes = overlaysRef.current.map((e) => {
        const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(e.lat, e.lng));
        return { e, x: pt.x, y: pt.y, ax: pt.x, ay: pt.y };
      });
      for (let iter = 0; iter < 80; iter++) {
        let moved = false;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const ox = W - Math.abs(dx);
            const oy = H - Math.abs(dy);
            if (ox > 0 && oy > 0) {
              moved = true;
              if (ox < oy) {
                const s = (ox / 2) * (dx >= 0 ? 1 : -1) || ox / 2;
                a.x -= s;
                b.x += s;
              } else {
                const s = (oy / 2) * (dy >= 0 ? 1 : -1) || oy / 2;
                a.y -= s;
                b.y += s;
              }
            }
          }
        }
        for (const n of nodes) {
          n.x += (n.ax - n.x) * 0.05;
          n.y += (n.ay - n.y) * 0.05;
        }
        if (!moved) break;
      }
      for (const n of nodes) {
        const ll = proj.coordsFromContainerPoint(new kakao.maps.Point(n.x, n.y));
        n.e.ov.setPosition(ll);
        n.e.ov.setMap(map);
      }
    };

    declutter();
    const listener = kakao.maps.event.addListener(map, "idle", declutter);
    return () => kakao.maps.event.removeListener(map, "idle", listener);
  }, [ready, items, maxVal, onSelect, aptMode, onApt]);

  // 시군구 경계 폴리곤 (가격 색상). 지역 레벨에서만.
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !mapRef.current || !kakao) return;
    const map = mapRef.current;
    let alive = true;
    polysRef.current.forEach((p) => p.setMap(null));
    polysRef.current = [];
    if (aptMode) return;

    loadGuGeo()
      .then((geo) => {
        if (!alive || !geo) return;
        const byName = new Map(items.map((it) => [it.title, it]));
        for (const f of geo.features) {
          const name: string = f.properties?.name ?? f.properties?.SIG_KOR_NM ?? "";
          const it = byName.get(name);
          if (!it) continue;
          const color = priceColor(it.avg84 || it.avg, minVal, maxVal);
          const polys =
            f.geometry.type === "MultiPolygon"
              ? f.geometry.coordinates
              : [f.geometry.coordinates];
          for (const poly of polys) {
            const path = poly[0].map(
              (c: number[]) => new kakao.maps.LatLng(c[1], c[0])
            );
            const polygon = new kakao.maps.Polygon({
              path,
              strokeWeight: 1.5,
              strokeColor: color,
              strokeOpacity: 0.7,
              fillColor: color,
              fillOpacity: 0.16,
            });
            polygon.setMap(map);
            polysRef.current.push(polygon);
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, items, aptMode, maxVal, minVal]);

  // 특정 구 선택 시 그 경계에 꽉 차게 fitBounds
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !mapRef.current || !kakao || !focusGuName) return;
    const map = mapRef.current;
    let alive = true;
    loadGuGeo().then((geo) => {
      if (!alive || !geo) return;
      const f = geo.features.find(
        (ft: any) =>
          (ft.properties?.name ?? ft.properties?.SIG_KOR_NM) === focusGuName
      );
      if (!f) return;
      const bounds = new kakao.maps.LatLngBounds();
      const polys =
        f.geometry.type === "MultiPolygon"
          ? f.geometry.coordinates
          : [f.geometry.coordinates];
      for (const poly of polys)
        for (const c of poly[0]) bounds.extend(new kakao.maps.LatLng(c[1], c[0]));
      map.setBounds(bounds, 20, 20, 20, 20);
    });
    return () => {
      alive = false;
    };
  }, [ready, focusGuName]);

  // 줌/센터 변경 통지 (페이지가 LOD 레이어 결정)
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !mapRef.current || !kakao || !onViewChange) return;
    const map = mapRef.current;
    const fire = () => {
      const ctr = map.getCenter();
      onViewChange(map.getLevel(), ctr.getLat(), ctr.getLng());
    };
    const l = kakao.maps.event.addListener(map, "idle", fire);
    fire();
    return () => kakao.maps.event.removeListener(map, "idle", l);
  }, [ready, onViewChange]);

  if (!KEY) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-center text-sm text-slate-400">
        <div>
          NEXT_PUBLIC_KAKAO_MAP_KEY 가 설정되지 않았습니다.
          <br />
          .env.local 에 Kakao JS 키를 넣어주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl border border-slate-800">
      <div ref={boxRef} className="h-full w-full" />
      <div
        ref={errRef}
        style={{ display: "none" }}
        className="absolute inset-0 items-center justify-center bg-slate-900 p-6 text-center text-sm text-slate-300"
      >
        지도를 불러오지 못했습니다. Kakao 콘솔에서 이 도메인(http://localhost:3000)을
        Web 플랫폼에 등록했는지 확인하세요.
      </div>
    </div>
  );
}
