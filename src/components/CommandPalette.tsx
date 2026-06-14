"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/regions";
import { searchComplexCatalog, type ComplexHit } from "@/lib/api";

type RegionHit = { sggCd: string; name: string; sido: string };

const ALL_REGIONS: RegionHit[] = REGIONS.flatMap((r) =>
  r.districts.map((d) => ({ sggCd: d.code, name: d.name, sido: r.sido }))
);

// 메뉴 이동(사이드바와 동일). kw = 한/영 별칭으로 검색 매칭.
const MENU_ITEMS: { href: string; label: string; kw: string }[] = [
  { href: "/", label: "대시보드", kw: "dashboard home 홈 메인" },
  { href: "/today", label: "오늘의 실거래", kw: "today 오늘 최근 recent" },
  { href: "/complex", label: "단지 검색", kw: "complex apt 아파트 단지" },
  { href: "/stats", label: "통계", kw: "stats statistics 통계 분석" },
  { href: "/map", label: "지도", kw: "map 지도 맵" },
  { href: "/presale", label: "분양권", kw: "presale 분양 분양권" },
  { href: "/rent", label: "전월세", kw: "rent jeonse 전세 월세 전월세 임대" },
];

export function CommandPalette({
  open,
  onClose,
  onSelectRegion,
  onSelectComplex,
}: {
  open: boolean;
  onClose: () => void;
  onSelectRegion: (sggCd: string, name: string) => void;
  onSelectComplex: (sggCd: string, apt: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [complexes, setComplexes] = useState<ComplexHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setComplexes([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // 단지 검색 (디바운스)
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setComplexes([]);
      return;
    }
    const t = setTimeout(async () => {
      const hits = await searchComplexCatalog(q.trim());
      setComplexes(hits.slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const menuHits = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return MENU_ITEMS;
    return MENU_ITEMS.filter((m) => m.label.toLowerCase().includes(k) || m.kw.toLowerCase().includes(k));
  }, [q]);

  const regionHits = useMemo(() => {
    const k = q.trim();
    if (!k) return ALL_REGIONS.slice(0, 6);
    return ALL_REGIONS.filter(
      (r) => r.name.includes(k) || r.sido.includes(k) || `${r.sido} ${r.name}`.includes(k)
    ).slice(0, 6);
  }, [q]);

  // 방향키 내비게이션용 평탄 리스트 (메뉴 → 지역 → 단지 순)
  const flat: { kind: "menu" | "region" | "complex"; sggCd?: string; apt?: string; href?: string; name: string }[] = [
    ...menuHits.map((m) => ({ kind: "menu" as const, href: m.href, name: m.label })),
    ...regionHits.map((r) => ({ kind: "region" as const, sggCd: r.sggCd, name: r.name })),
    ...complexes.map((c) => ({
      kind: "complex" as const,
      sggCd: c.sggCd,
      apt: c.kaptName,
      name: c.kaptName,
    })),
  ];

  useEffect(() => setActiveIdx(0), [q, complexes.length]);

  function choose(i: number) {
    const it = flat[i];
    if (!it) return;
    if (it.kind === "menu") router.push(it.href!);
    else if (it.kind === "region") onSelectRegion(it.sggCd!, it.name);
    else onSelectComplex(it.sggCd!, it.apt!);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(activeIdx);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="메뉴(통계·지도) · 지역(강남구) · 단지(래미안) 검색…"
          className="w-full border-b border-slate-800 bg-transparent px-5 py-4 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {menuHits.length > 0 && (
            <Group label="메뉴">
              {menuHits.map((m, i) => (
                <Row
                  key={m.href}
                  active={activeIdx === i}
                  onClick={() => choose(i)}
                  onHover={() => setActiveIdx(i)}
                  title={m.label}
                  badge="이동"
                />
              ))}
            </Group>
          )}
          {regionHits.length > 0 && (
            <Group label="지역">
              {regionHits.map((r, ri) => {
                const i = menuHits.length + ri;
                return (
                  <Row
                    key={r.sggCd}
                    active={activeIdx === i}
                    onClick={() => choose(i)}
                    onHover={() => setActiveIdx(i)}
                    title={`${r.sido} ${r.name}`}
                    badge="구"
                  />
                );
              })}
            </Group>
          )}
          {complexes.length > 0 && (
            <Group label="단지">
              {complexes.map((c, ci) => {
                const i = menuHits.length + regionHits.length + ci;
                return (
                  <Row
                    key={c.kaptCode}
                    active={activeIdx === i}
                    onClick={() => choose(i)}
                    onHover={() => setActiveIdx(i)}
                    title={c.kaptName}
                    sub={`${c.sigungu} ${c.dong}`}
                    badge="단지"
                  />
                );
              })}
            </Group>
          )}
          {q.trim().length >= 2 && flat.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-500">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
        <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
          ↑↓ 이동 · Enter 선택 · Esc 닫기 · 메뉴/지역/단지 통합 검색
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  title,
  sub,
  badge,
  active,
  onClick,
  onHover,
}: {
  title: string;
  sub?: string;
  badge: string;
  active?: boolean;
  onClick: () => void;
  onHover?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left ${
        active ? "bg-slate-800/80" : "hover:bg-slate-800/70"
      }`}
    >
      <span>
        <span className="text-sm font-medium text-slate-100">{title}</span>
        {sub && <span className="ml-2 text-xs text-slate-500">{sub}</span>}
      </span>
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
        {badge}
      </span>
    </button>
  );
}
