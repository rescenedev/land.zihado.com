"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; locked?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/today", label: "오늘의 실거래" },
  { href: "/complex", label: "단지 검색" },
  { href: "/stats", label: "통계" },
  { href: "/map", label: "지도" },
  { href: "/presale", label: "분양권" },
  { href: "/rent", label: "전월세" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // SSR/모바일은 닫힌 채 시작(드로어가 콘텐츠를 가리지 않게). 데스크톱(md+)만 마운트 후 펼침.
  const [open, setOpen] = useState(false);
  // 첫 페인트에서 데스크톱을 즉시(애니메이션 없이) 펼치고, 이후 사용자 토글에만 트랜지션 적용.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setOpen(true);
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // 모바일에서 메뉴 클릭 시 드로어 닫기
  const closeOnMobile = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  };
  return (
    <div className="flex min-h-screen bg-[#0b1120] text-slate-100">
      {/* 모바일 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 사이드바 (drawer) */}
      <aside
        className={`fixed z-40 flex h-full w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#0f172a] px-3 py-5 md:static md:h-auto ${
          ready ? "transition-transform duration-200 md:transition-[width,transform]" : ""
        } ${
          open ? "translate-x-0 md:w-60" : "-translate-x-full md:w-0 md:overflow-hidden md:border-r-0 md:px-0"
        }`}
      >
        <Link href="/" onClick={closeOnMobile} className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
            실
          </div>
          <div>
            <div className="text-sm font-bold">실거래 대시보드</div>
            <div className="text-[11px] text-slate-400">국토교통부 · 전국</div>
          </div>
        </Link>

        <nav className="mt-7 flex flex-col gap-1">
          {NAV_ITEMS.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                prefetch
                onClick={closeOnMobile}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-blue-600 font-semibold text-white"
                    : "text-slate-400 hover:bg-slate-800/60"
                }`}
              >
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-2 text-[11px] leading-relaxed text-slate-500">
          데이터 · 국토교통부
          <br />
          실거래가 공개시스템
        </div>
      </aside>

      {/* 본문 */}
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-slate-800/60 bg-[#0b1120]/85 px-3 backdrop-blur">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="메뉴 토글"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <span className="text-lg leading-none">{open ? "‹‹" : "☰"}</span>
          </button>
          {!open && <span className="text-sm font-bold text-slate-200">실거래 대시보드</span>}
        </div>
        {children}
      </main>
    </div>
  );
}
