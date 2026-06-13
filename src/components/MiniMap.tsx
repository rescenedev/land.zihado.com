"use client";

import { useEffect, useRef, useState } from "react";
import { loadSdk } from "./KakaoMap";
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    kakao: any;
  }
}

export type MapMarker = { label: string; lat: number; lng: number; color?: string };

export function MiniMap({
  lat,
  lng,
  label,
  markers = [],
  parcel,
  height = 150,
}: {
  lat: number;
  lng: number;
  label?: string;
  markers?: MapMarker[];
  parcel?: [number, number][][];
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const centerRef = useRef<any>(null);
  const facOvsRef = useRef<{ ov: any; m: MapMarker }[]>([]);
  const parcelPolysRef = useRef<any[]>([]);
  // declutter는 markers effect가 업데이트, idle 리스너는 map init 시 한 번만 등록
  const declutterRef = useRef<(() => void) | null>(null);
  const [err, setErr] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Effect 1: 지도 초기화 — lat/lng/label/guName 변경 시에만 재생성
  useEffect(() => {
    let alive = true;
    setMapReady(false);

    loadSdk()
      .then(() => {
        if (!alive || !boxRef.current) return;
        const kakao = window.kakao;
        const center = new kakao.maps.LatLng(lat, lng);
        centerRef.current = center;
        const map = new kakao.maps.Map(boxRef.current, { center, level: 5 });
        mapRef.current = map;

        // idle 리스너는 한 번만 등록 — declutter 함수는 ref로 교체
        kakao.maps.event.addListener(map, "idle", () => {
          declutterRef.current?.();
        });

        // 단지 중심 마커
        new kakao.maps.CustomOverlay({
          position: center,
          yAnchor: 1,
          zIndex: 100,
          content: `<div style="transform:translate(-50%,-100%)"><div style="background:#2563eb;color:#fff;font-weight:700;font-size:12px;padding:5px 11px;border-radius:999px;border:2px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.45);white-space:nowrap">${label ?? "단지"}</div></div>`,
        }).setMap(map);

        setMapReady(true);
      })
      .catch(() => alive && setErr(true));

    return () => {
      alive = false;
      // 기존 오버레이 정리
      for (const { ov } of facOvsRef.current) {
        try { ov.setMap(null); } catch {}
      }
      facOvsRef.current = [];
      for (const p of parcelPolysRef.current) {
        try { p.setMap(null); } catch {}
      }
      parcelPolysRef.current = [];
      declutterRef.current = null;
      mapRef.current = null;
      centerRef.current = null;
    };
  }, [lat, lng, label]);

  // Effect 2: 시설 마커 추가/교체 — 지도 재생성 없이 오버레이만 교체
  useEffect(() => {
    const map = mapRef.current;
    const center = centerRef.current;
    if (!mapReady || !map || !center) return;
    const kakao = window.kakao;

    // 기존 오버레이 제거
    for (const { ov } of facOvsRef.current) {
      try { ov.setMap(null); } catch {}
    }

    // 새 오버레이 생성 (아직 지도에 붙이지 않음 — declutter가 결정)
    facOvsRef.current = markers
      .filter((m) => m.lat && m.lng)
      .map((m) => {
        const c = m.color ?? "#64748b";
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(m.lat, m.lng),
          yAnchor: 1,
          content: `<div style="transform:translate(-50%,-100%)"><div style="background:${c};color:#fff;font-weight:600;font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.85);box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap">${m.label}</div></div>`,
        });
        return { ov, m };
      });

    // declutter 함수 교체 (idle 리스너가 ref를 통해 최신 함수 호출)
    declutterRef.current = () => {
      const proj = map.getProjection();
      if (!proj) return;
      const placed: { l: number; r: number; t: number; b: number }[] = [];
      const cp = proj.containerPointFromCoords(center);
      placed.push({ l: cp.x - 50, r: cp.x + 50, t: cp.y - 28, b: cp.y });
      for (const { ov, m } of facOvsRef.current) {
        const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(m.lat, m.lng));
        const box = { l: pt.x - 38, r: pt.x + 38, t: pt.y - 22, b: pt.y };
        const hit = placed.some(
          (p) => !(box.r < p.l || box.l > p.r || box.b < p.t || box.t > p.b)
        );
        if (hit) ov.setMap(null);
        else {
          ov.setMap(map);
          placed.push(box);
        }
      }
    };
    declutterRef.current();
  }, [markers, mapReady]);

  // Effect 3: 대지 경계 폴리곤 추가/교체 — 지도 재생성 없이 폴리곤만 교체
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const kakao = window.kakao;

    for (const poly of parcelPolysRef.current) {
      try { poly.setMap(null); } catch {}
    }
    parcelPolysRef.current = [];

    if (!parcel || parcel.length === 0) return;

    const bounds = new kakao.maps.LatLngBounds();
    for (const ring of parcel) {
      const path = ring.map(([lo, la]) => {
        const p = new kakao.maps.LatLng(la, lo);
        bounds.extend(p);
        return p;
      });
      const poly = new kakao.maps.Polygon({
        path,
        strokeWeight: 2.5,
        strokeColor: "#2563eb",
        strokeOpacity: 0.95,
        strokeStyle: "solid",
        fillColor: "#3b82f6",
        fillOpacity: 0.22,
        zIndex: 50,
      });
      poly.setMap(map);
      parcelPolysRef.current.push(poly);
    }
    map.setBounds(bounds, 90, 90, 90, 90);
  }, [parcel, mapReady]);

  if (err) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-xs text-slate-500"
      >
        지도를 불러오지 못했습니다
      </div>
    );
  }
  return (
    <div
      ref={boxRef}
      style={{ height }}
      className="overflow-hidden rounded-xl border border-slate-800"
    />
  );
}
