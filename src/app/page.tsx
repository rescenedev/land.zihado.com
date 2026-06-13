"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOverview,
  fetchAptMap,
  fetchRecent,
  shiftMonth,
  ymdOf,
  type RegionRow,
  type OverviewResponse,
} from "@/lib/api";
import { formatEok } from "@/lib/format";
import { centroidFor, SGG_CENTROIDS, SIDO_CENTROIDS } from "@/lib/geo";
import { Shell, type NavItem } from "@/components/Shell";
import { RegionCard, type CardData } from "@/components/RegionCard";
import { RegionDetail } from "@/components/RegionDetail";
import { KakaoMap, type MapItem } from "@/components/KakaoMap";
import { StatsView } from "@/components/StatsView";
import { CommandPalette } from "@/components/CommandPalette";
import { ComplexDetail } from "@/components/ComplexDetail";
import { TodayDeals } from "@/components/TodayDeals";

type Scope = "seoul" | "all";
type View = "cards" | "map" | "stats";

const NAV: NavItem[] = [
  { key: "dashboard", label: "대시보드" },
  { key: "today", label: "오늘의 실거래" },
  { key: "complex", label: "단지 검색" },
  { key: "stats", label: "통계" },
  { key: "map", label: "지도" },
  { key: "presale", label: "분양권" },
  { key: "rent", label: "전월세" },
];

const SIDO_TABS = [
  "전국", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
  "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const TABS = [
  { key: "aptTrade", label: "매매" },
  { key: "silvTrade", label: "분양권" },
  { key: "aptRent", label: "전월세" },
];

export default function Home() {
  const [yyyymm, setYyyymm] = useState(() => ymdOf(new Date()));
  const [dataset, setDataset] = useState("aptTrade");
  const [scope, setScope] = useState<Scope>("all");
  const [view, setView] = useState<View>("cards");
  const [nav, setNav] = useState("dashboard");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [allTotals, setAllTotals] = useState<OverviewResponse["totals"] | null>(null);
  const [prevData, setPrevData] = useState<OverviewResponse | null>(null);
  const [newByRegion, setNewByRegion] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSido, setSelectedSido] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ sggCd: string; title: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [complex, setComplex] = useState<{ region: string; apt: string } | null>(null);
  const [aptItems, setAptItems] = useState<MapItem[] | null>(null);
  const [aptFocus, setAptFocus] = useState<string | null>(null);
  const [focusGu, setFocusGu] = useState<string | null>(null);
  const [mapDetail, setMapDetail] = useState<{ sggCd: string; title: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchOverview(yyyymm, scope, dataset);
      setData(res);
      if (res.totals.loaded < res.totals.regions) {
        pollRef.current = setTimeout(load, 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [yyyymm, scope, dataset]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [load]);

  // 전국(all) 표시 중에는 별도 scope인 '서울' 데이터를 백그라운드로 미리 읽어둠
  // → 서울 칩 클릭 시 네트워크 0(즉시). 전국 데이터엔 나머지 시도가 모두 포함됨.
  useEffect(() => {
    if (scope !== "all") return;
    const t = setTimeout(() => {
      fetchOverview(yyyymm, "seoul", dataset).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [scope, yyyymm, dataset]);

  // 서울/시도 표시 중에는 전국(all) totals 를 백그라운드 fetch → KPI 비교 배지용
  useEffect(() => {
    if (scope === "all") {
      // scope=all 이면 data.totals 가 곧 전국 → 별도 fetch 불필요
      if (data) setAllTotals(data.totals);
      return;
    }
    let alive = true;
    fetchOverview(yyyymm, "all", dataset)
      .then((r) => alive && setAllTotals(r.totals))
      .catch(() => {});
    return () => { alive = false; };
  }, [scope, yyyymm, dataset, data]);

  // 전월 데이터 백그라운드 fetch → KPI '전월 대비' 배지용 (현재 scope 동일)
  useEffect(() => {
    let alive = true;
    setPrevData(null);
    fetchOverview(shiftMonth(yyyymm, -1), scope, dataset)
      .then((r) => alive && setPrevData(r))
      .catch(() => {});
    return () => { alive = false; };
  }, [yyyymm, scope, dataset]);

  // 최근 신규 신고 거래(계약일 최신순) → 지역별 카운트 → '갱신 지역' glow 용
  useEffect(() => {
    let alive = true;
    setNewByRegion({});
    fetchRecent(yyyymm, "all", dataset, 300)
      .then((r) => {
        if (!alive) return;
        const m: Record<string, number> = {};
        for (const d of r.deals) {
          if (d.sggCd) m[d.sggCd] = (m[d.sggCd] ?? 0) + 1;
        }
        setNewByRegion(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [yyyymm, dataset]);

  // scope/시도/월 변경 시 드릴다운·단지레이어 초기화 (selectedSido 는 칩이 제어)
  useEffect(() => {
    setDetail(null);
    setMapDetail(null);
    setAptItems(null);
    setAptFocus(null);
    setFocusGu(null);
  }, [scope, selectedSido, yyyymm, dataset]);

  // ⌘K / Ctrl+K 커맨드 팔레트
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const regions = data?.regions ?? [];

  // 시도별 신규 거래 합계 (전국 뷰의 시도 카드 glow 용)
  const newBySido = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of regions) {
      const n = newByRegion[r.sggCd];
      if (n) m[r.sido] = (m[r.sido] ?? 0) + n;
    }
    return m;
  }, [regions, newByRegion]);

  // glow 임계값: 신규 거래 상위 ~30% 지역만 강조(전부 glow 방지). 그룹별로 따로 산출.
  const cutoffOf = (vals: number[]) => {
    const v = vals.filter((n) => n > 0).sort((a, b) => b - a);
    if (v.length === 0) return Infinity;
    return v[Math.max(0, Math.ceil(v.length * 0.3) - 1)];
  };
  const sidoGlowCutoff = useMemo(() => cutoffOf(Object.values(newBySido)), [newBySido]);
  const regionGlowCutoff = useMemo(() => cutoffOf(Object.values(newByRegion)), [newByRegion]);
  // 카드/마커 key 로 glow 여부 판정
  const isHot = useCallback(
    (key: string, isSido: boolean) => {
      const n = isSido ? (newBySido[key] ?? 0) : (newByRegion[key] ?? 0);
      return n > 0 && n >= (isSido ? sidoGlowCutoff : regionGlowCutoff);
    },
    [newBySido, newByRegion, sidoGlowCutoff, regionGlowCutoff]
  );

  const cards: CardData[] = useMemo(() => {
    if (scope === "seoul") return regions.map(toGuCard);
    if (selectedSido)
      return regions.filter((r) => r.sido === selectedSido).map(toGuCard);
    const bySido = new Map<string, RegionRow[]>();
    for (const r of regions) {
      if (!bySido.has(r.sido)) bySido.set(r.sido, []);
      bySido.get(r.sido)!.push(r);
    }
    return [...bySido.entries()].map(([sido, rs]) => {
      const loaded = rs.filter((r) => r.count > 0);
      return {
        key: sido,
        title: sido,
        subtitle: `${loaded.length}개 구/시`,
        count: loaded.reduce((s, r) => s + r.count, 0),
        avg84: weighted(loaded, "avg84"),
        avg: weighted(loaded, "avg"),
        max: loaded.reduce((m, r) => Math.max(m, r.max), 0),
        isSido: true,
        trend: aggregateTrend(loaded),
      };
    });
  }, [regions, scope, selectedSido]);

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => (b.avg84 || b.avg) - (a.avg84 || a.avg)),
    [cards]
  );
  const maxInSet = useMemo(
    () => Math.max(1, ...sortedCards.map((c) => c.avg84 || c.avg)),
    [sortedCards]
  );
  const minInSet = useMemo(() => {
    const vals = sortedCards.map((c) => c.avg84 || c.avg).filter((v) => v > 0);
    return vals.length ? Math.min(...vals) : 0;
  }, [sortedCards]);

  const mapItems: MapItem[] = useMemo(() => {
    return sortedCards
      .map((c) => {
        const ll = centroidFor(c.key, !!c.isSido);
        if (!ll || c.count === 0) return null;
        return { ...c, lat: ll[0], lng: ll[1], fresh: isHot(c.isSido ? c.title : c.key, !!c.isSido) } as MapItem;
      })
      .filter((x): x is MapItem => x !== null);
  }, [sortedCards, isHot]);

  const aptMaxVal = useMemo(
    () => (aptItems ? Math.max(1, ...aptItems.map((a) => a.avg)) : 0),
    [aptItems]
  );
  const aptMinVal = useMemo(
    () => (aptItems ? Math.min(...aptItems.map((a) => a.avg)) : 0),
    [aptItems]
  );

  const [mapCenter, setMapCenter] = useState<[number, number]>([37.5505, 126.99]);
  const [mapLevel, setMapLevel] = useState(9);
  // scope/시도/월 변경 시 지도 시점 초기화
  useEffect(() => {
    if (scope === "all" && !selectedSido) {
      setMapCenter([36.4, 127.8]);
      setMapLevel(13);
    } else if (scope === "all" && selectedSido) {
      const c = SIDO_CENTROIDS[selectedSido];
      setMapCenter(c ?? [36.4, 127.8]);
      setMapLevel(9);
    } else {
      setMapCenter([37.5505, 126.99]);
      setMapLevel(9);
    }
  }, [scope, selectedSido, yyyymm]);

  // selectedSido 있으면 해당 시도 카드 기준 집계, 없으면 API totals 그대로
  const visibleTotals = useMemo(() => {
    if (!data) return null;
    if (!selectedSido) return data.totals;
    const loaded = sortedCards.filter((c) => c.count > 0);
    const totalCount = loaded.reduce((s, c) => s + c.count, 0);
    const avg = totalCount > 0
      ? Math.round(loaded.reduce((s, c) => s + c.avg * c.count, 0) / totalCount)
      : 0;
    const max = loaded.reduce((m, c) => Math.max(m, c.max), 0);
    return { regions: sortedCards.length, loaded: loaded.length, count: totalCount, avg, max };
  }, [data, selectedSido, sortedCards]);

  // 전월 동일 뷰 집계 (KPI 전월 대비 배지용)
  const prevTotals = useMemo(() => {
    if (!prevData) return null;
    if (!selectedSido) return prevData.totals;
    const rs = prevData.regions.filter((r) => r.sido === selectedSido && r.count > 0);
    const count = rs.reduce((s, r) => s + r.count, 0);
    const avg = count > 0 ? Math.round(rs.reduce((s, r) => s + r.avg * r.count, 0) / count) : 0;
    const max = rs.reduce((m, r) => Math.max(m, r.max), 0);
    return { regions: rs.length, loaded: rs.length, count, avg, max };
  }, [prevData, selectedSido]);

  // 비교 기준 (전국 totals): 서울·시도 뷰에서만 의미 있음
  const compBaseline = useMemo(() => {
    // scope=all + selectedSido: data.totals 가 전국 (시도 집계와 비교)
    if (scope === "all" && selectedSido && data) return data.totals;
    // scope=seoul: 백그라운드 fetch한 allTotals
    if (scope === "seoul" && allTotals) return allTotals;
    return null;
  }, [scope, selectedSido, data, allTotals]);

  // collecting 은 API totals 기준 유지 (폴링 트리거)
  const collecting = !!data && data.totals.loaded < data.totals.regions;
  const progress = data
    ? Math.round((data.totals.loaded / Math.max(1, data.totals.regions)) * 100)
    : 0;

  // 지도 줌/센터 변경 → LOD: 깊게 줌인(level<=7)하면 가장 가까운 구의 단지 표시, 줌아웃하면 해제.
  // 단, 명시적으로 구를 클릭 선택한 동안(focusGu)에는 자동제어를 끄고 클릭 선택을 우선한다.
  // (클릭 직후 fitBounds 줌인 전 level>7 상태의 idle 이 방금 세팅한 포커스를 지워버리는 레이스 방지)
  const onViewChange = useCallback((lvl: number, lat: number, lng: number) => {
    if (focusGuRef.current) return;
    if (lvl <= 7) {
      const gu = nearestSeoulGu(lat, lng);
      if (gu) setAptFocus(gu);
    } else {
      setAptFocus((cur) => (cur ? null : cur));
    }
  }, []);

  // 단지 레이어 로드
  useEffect(() => {
    if (!aptFocus) {
      setAptItems(null);
      return;
    }
    let alive = true;
    fetchAptMap(aptFocus, yyyymm, dataset).then((items) => {
      if (!alive) return;
      setAptItems(
        items
          .map((a) => ({
            key: a.apt,
            title: a.apt,
            count: a.count,
            avg84: 0,
            avg: a.avg,
            max: a.max,
            lat: a.lat,
            lng: a.lng,
          }))
          // 가격(최고 거래가) 높은 순 → 상위 단지 라벨/순위 우선
          .sort((x, y) => (y.max || y.avg) - (x.max || x.avg))
      );
    });
    return () => {
      alive = false;
    };
  }, [aptFocus, yyyymm, dataset]);

  const regionsRef = useRef<RegionRow[]>([]);
  regionsRef.current = regions;
  const aptFocusRef = useRef<string | null>(null);
  aptFocusRef.current = aptFocus;
  const focusGuRef = useRef<string | null>(null);
  focusGuRef.current = focusGu;
  // 지도에서 지역 클릭: 그 구 경계에 꽉 차게 맞추고 단지 레이어(대장순) + 하단 패널
  const onSelectKey = useCallback((key: string, isSido: boolean) => {
    if (isSido) {
      setSelectedSido(key);
      return;
    }
    const name = regionTitle(regionsRef.current, key);
    setAptFocus(key); // 단지 레이어 즉시 로드 (대장 아파트 순)
    setFocusGu(name); // KakaoMap 이 해당 구 경계로 fitBounds
    setMapDetail({ sggCd: key, title: name });
  }, []);

  // 좌측 사이드바 네비게이션
  const onNav = useCallback((key: string) => {
    if (key === "complex") {
      setPaletteOpen(true);
      return;
    }
    if (key === "today") {
      setNav("today");
      return;
    }
    // 나머지는 대시보드 본문 내 보기/데이터셋 전환
    setNav(key);
    setDetail(null);
    if (key === "stats") setView("stats");
    else if (key === "map") setView("map");
    else setView("cards");
    if (key === "rent") setDataset("aptRent");
    else if (key === "presale") setDataset("silvTrade");
    else if (key === "dashboard") setDataset("aptTrade");
  }, []);

  // 시도 칩 선택: 전국/서울/그 외 시도
  const selectSido = useCallback((sd: string) => {
    if (sd === "전국") {
      setScope("all");
      setSelectedSido(null);
    } else if (sd === "서울") {
      setScope("seoul");
      setSelectedSido(null);
    } else {
      setScope("all");
      setSelectedSido(sd);
    }
  }, []);

  const exitGu = useCallback(() => {
    setMapDetail(null);
    setAptFocus(null);
    setFocusGu(null);
  }, []);
  // 지도에서 단지 클릭: 단지 상세 모달
  const onAptClick = useCallback((apt: string) => {
    if (aptFocusRef.current) setComplex({ region: aptFocusRef.current, apt });
  }, []);

  if (nav === "today") {
    return (
      <Shell nav={NAV} activeKey={nav} onNav={onNav}>
        <TodayDeals />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onSelectRegion={(sggCd, name) => {
            setNav("dashboard");
            setDetail({ sggCd, title: name });
          }}
          onSelectComplex={(region, apt) => setComplex({ region, apt })}
        />
        {complex && (
          <ComplexDetail
            region={complex.region}
            apt={complex.apt}
            yyyymm={yyyymm}
            dataset={dataset}
            onClose={() => setComplex(null)}
          />
        )}
      </Shell>
    );
  }

  return (
    <Shell nav={NAV} activeKey={nav} onNav={onNav}>
      <div className="mx-auto w-[92%] max-w-[1800px] px-2 py-7">
        {/* 헤더 */}
        <div className="mb-1 text-xs font-semibold text-blue-400">
          국토교통부 실거래가 · {dataset === "silvTrade" ? "분양권" : dataset === "aptRent" ? "전월세" : "아파트 매매"}
        </div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            전국 아파트 실거래 대시보드
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200"
            >
              지역·단지 검색
              <kbd className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">⌘K</kbd>
            </button>
            <span className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-xs text-slate-300">
              기준월 {yyyymm.slice(0, 4)}.{yyyymm.slice(4, 6)}
            </span>
          </div>
        </div>

        {/* 탭 (매매/분양권/전월세) */}
        <div className="mb-5 flex gap-1 border-b border-slate-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setDataset(t.key)}
              onMouseEnter={() => {
                if (t.key !== dataset)
                  fetchOverview(yyyymm, scope, t.key).catch(() => {});
              }}
              className={`px-4 py-2 text-sm font-medium transition ${
                dataset === t.key
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* KPI */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="총 거래"
            value={visibleTotals ? `${visibleTotals.count.toLocaleString()}건` : "-"}
            sub={
              <>
                {compBaseline && visibleTotals && compBaseline.count > 0 && (
                  <div>
                    전국 {compBaseline.count.toLocaleString()}건 중{" "}
                    <span className="font-semibold text-slate-300">
                      {Math.round((visibleTotals.count / compBaseline.count) * 100)}%
                    </span>
                  </div>
                )}
                <div className="mt-0.5">
                  <MoMChip prev={prevTotals?.count} cur={visibleTotals?.count} />
                </div>
              </>
            }
          />
          <Kpi
            label="84㎡ 평균가"
            value={visibleTotals ? formatEok(visibleTotals.avg) : "-"}
            accent
            sub={
              <>
                {compBaseline && visibleTotals && compBaseline.avg > 0 && (() => {
                  const pct = Math.round(((visibleTotals.avg - compBaseline.avg) / compBaseline.avg) * 100);
                  const up = pct >= 0;
                  return (
                    <div>
                      전국 평균 {formatEok(compBaseline.avg)}{" "}
                      <span className={`font-semibold ${up ? "text-rose-400" : "text-blue-400"}`}>
                        {up ? "▲" : "▼"}{up ? "+" : ""}{pct}%
                      </span>
                    </div>
                  );
                })()}
                <div className="mt-0.5">
                  <MoMChip prev={prevTotals?.avg} cur={visibleTotals?.avg} />
                </div>
              </>
            }
          />
          <Kpi
            label="최고 거래가"
            value={visibleTotals ? formatEok(visibleTotals.max) : "-"}
            sub={
              <>
                {compBaseline && visibleTotals && compBaseline.max > 0 && (
                  <div>
                    전국 최고 {formatEok(compBaseline.max)}{" "}
                    <span className="font-semibold text-slate-300">
                      {Math.round((visibleTotals.max / compBaseline.max) * 100)}%
                    </span>
                  </div>
                )}
                <div className="mt-0.5">
                  <MoMChip prev={prevTotals?.max} cur={visibleTotals?.max} />
                </div>
              </>
            }
          />
          <Kpi
            label="수집 지역"
            value={visibleTotals ? `${visibleTotals.loaded}/${visibleTotals.regions}` : "-"}
            sub={collecting ? `수집 중 ${progress}%` : "완료"}
          />
        </div>

        {/* 컨트롤 바: [월] [시도칩 2줄 wrap·중앙] [뷰토글] */}
        <div className="mb-5 flex items-start gap-3">
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1">
            <NavBtn onClick={() => setYyyymm((m) => shiftMonth(m, -1))}>‹</NavBtn>
            <span className="min-w-[88px] text-center text-sm font-semibold text-slate-100">
              {yyyymm.slice(0, 4)}.{yyyymm.slice(4, 6)}
            </span>
            <NavBtn onClick={() => setYyyymm((m) => shiftMonth(m, 1))}>›</NavBtn>
          </div>

          <div className="flex flex-1 flex-wrap content-start gap-1.5">
            {SIDO_TABS.map((sd) => {
              const active =
                sd === "전국"
                  ? scope === "all" && !selectedSido
                  : sd === "서울"
                    ? scope === "seoul"
                    : selectedSido === sd;
              return (
                <button
                  key={sd}
                  onClick={() => selectSido(sd)}
                  onMouseEnter={() => {
                    // 전국↔서울만 새 fetch가 발생 — 나머지는 selectedSido 필터만
                    if (sd === "전국" && scope !== "all")
                      fetchOverview(yyyymm, "all", dataset).catch(() => {});
                    if (sd === "서울" && scope !== "seoul")
                      fetchOverview(yyyymm, "seoul", dataset).catch(() => {});
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-blue-600 text-white"
                      : sd !== "전국" && isHot(sd, true)
                        ? "bg-blue-500/15 text-blue-300 shadow-[0_0_10px_-2px_rgba(59,130,246,0.6)] ring-1 ring-blue-500/40"
                        : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {sd}
                  {sd !== "전국" && (newBySido[sd] ?? 0) > 0 && (
                    <span className={`ml-1 text-[10px] ${active ? "text-blue-200" : "text-blue-400"}`}>+{newBySido[sd]}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800/60 p-1 text-sm">
            <Seg active={view === "cards"} onClick={() => setView("cards")}>카드</Seg>
            <Seg active={view === "map"} onClick={() => setView("map")}>지도</Seg>
            <Seg active={view === "stats"} onClick={() => setView("stats")}>통계</Seg>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error} — Worker 백엔드 실행 여부를 확인하세요.
          </div>
        )}

        {/* 본문 */}
        {detail ? (
          <RegionDetail
            sggCd={detail.sggCd}
            title={detail.title}
            yyyymm={yyyymm}
            dataset={dataset}
            onBack={() => setDetail(null)}
          />
        ) : view === "stats" ? (
          <StatsView yyyymm={yyyymm} scope={selectedSido ?? scope} dataset={dataset} />
        ) : (
          <>
            {selectedSido && (
              <button
                onClick={() => setSelectedSido(null)}
                className="mb-3 text-sm font-medium text-slate-400 hover:text-slate-100"
              >
                ← 전국 시도
              </button>
            )}
            {view === "map" ? (
              <>
                <KakaoMap
                  items={aptItems ?? mapItems}
                  aptMode={!!aptItems}
                  center={mapCenter}
                  level={mapLevel}
                  maxVal={aptItems ? aptMaxVal : maxInSet}
                  minVal={aptItems ? aptMinVal : minInSet}
                  onSelect={onSelectKey}
                  onApt={onAptClick}
                  onViewChange={onViewChange}
                  focusGuName={focusGu}
                />
                {mapDetail && (
                  <div className="mt-6">
                    <RegionDetail
                      sggCd={mapDetail.sggCd}
                      title={mapDetail.title}
                      yyyymm={yyyymm}
                      dataset={dataset}
                      onBack={exitGu}
                    />
                  </div>
                )}
              </>
            ) : !data && loading ? (
              <div className="py-20 text-center text-slate-500">불러오는 중…</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {sortedCards.map((card, i) => (
                  <RegionCard
                    key={card.key}
                    data={card}
                    rank={i + 1}
                    maxInSet={maxInSet}
                    newCount={card.isSido ? (newBySido[card.title] ?? 0) : (newByRegion[card.key] ?? 0)}
                    glow={isHot(card.isSido ? card.title : card.key, !!card.isSido)}
                    onClick={() =>
                      card.isSido
                        ? setSelectedSido(card.title)
                        : setDetail({ sggCd: card.key, title: card.title })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        <footer className="mt-12 space-y-1.5 border-t border-slate-800/60 pt-4 text-center text-[11px] text-slate-600">
          <div className="text-slate-500">
            <span className="font-medium text-emerald-400/80">성능</span>
            {" · "}서버 ~6ms{" · "}p50 47~53ms{" · "}추이집계 1.3ms{" · "}전국 콜드집계 365ms
          </div>
          <div>데이터 출처: 국토교통부 실거래가 공개시스템 (data.go.kr) · KV/D1 캐시 백엔드 · 지도 © Kakao</div>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectRegion={(sggCd, name) => setDetail({ sggCd, title: name })}
        onSelectComplex={(region, apt) => setComplex({ region, apt })}
      />

      {complex && (
        <ComplexDetail
          region={complex.region}
          apt={complex.apt}
          yyyymm={yyyymm}
          dataset={dataset}
          onClose={() => setComplex(null)}
        />
      )}
    </Shell>
  );
}

function regionTitle(rows: RegionRow[], sggCd: string): string {
  return rows.find((r) => r.sggCd === sggCd)?.name ?? sggCd;
}

// 지도 중심에서 가장 가까운 서울 구 (단지 레이어 포커스)
function nearestSeoulGu(lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [code, [clat, clng]] of Object.entries(SGG_CENTROIDS)) {
    const d = (lat - clat) ** 2 + (lng - clng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return best;
}

function toGuCard(r: RegionRow): CardData {
  return {
    key: r.sggCd,
    title: r.name,
    count: r.count,
    avg84: r.avg84,
    avg: r.avg,
    max: r.max,
    trend: r.trend ?? [],
  };
}

// 시도 카드용: 멤버 구들의 월별 인덱스 기준 평균 (모든 구가 동일 6개월 축으로 정렬됨)
function aggregateTrend(rows: RegionRow[]): number[] {
  const len = Math.max(...rows.map((r) => (r.trend ?? []).length), 0);
  if (len === 0) return [];
  const sums = Array(len).fill(0);
  const counts = Array(len).fill(0);
  for (const r of rows) {
    for (let i = 0; i < (r.trend ?? []).length; i++) {
      const v = r.trend![i];
      if (v > 0) { sums[i] += v; counts[i]++; }
    }
  }
  return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
}

function weighted(rows: RegionRow[], field: "avg" | "avg84"): number {
  const valid = rows.filter((r) => r[field] > 0);
  const totalC = valid.reduce((s, r) => s + r.count, 0);
  if (totalC === 0) return 0;
  return Math.round(valid.reduce((s, r) => s + r[field] * r.count, 0) / totalC);
}

function Kpi({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111a2e] p-4">
      <span className="text-xs text-slate-400">{label}</span>
      <div className={`mt-2 text-2xl font-extrabold ${accent ? "text-blue-400" : "text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

// 전월 대비 증감 칩
function MoMChip({ prev, cur }: { prev?: number; cur?: number }) {
  if (!prev || cur === undefined || cur === null) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span className={up ? "text-rose-400" : "text-blue-400"}>
      전월 대비 {up ? "▲" : "▼"} {up ? "+" : ""}{pct}%
    </span>
  );
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 rounded text-slate-400 hover:bg-slate-700/50 hover:text-white"
    >
      {children}
    </button>
  );
}

function Seg({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
        active ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
