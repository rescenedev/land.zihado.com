#!/usr/bin/env python3
"""
land.zihado.com 성능 모니터 — src/lib/api.ts 의 모든 fetch 를 캐시 키 차원별로 커버.
콜드 감지: 각 엔드포인트를 첫조회(1회, pre-warm 없음)로 측정 → 워밍 갭이 그대로 드러남.
  vc=MISS & >50ms = 진짜 콜드 갭(워밍이 놓침). vc=STALE = SWR 자가치유(정상).
사용: python3 monitor.py [n]   (n=엔드포인트당 랜덤 샘플 수, 기본 8)
"""
import http.client, ssl, time, urllib.parse, random, sys, datetime

HOST = "land.zihado.com"  # 프론트가 실제 닿는 Vercel 서울 프록시
CUR_YM = "202606"
MONTHS = ["202606", "202605", "202604"]          # 기준월 네비 윈도우(recentMonths 3)
SCOPES = ["all", "seoul", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
          "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
DATASETS = ["aptTrade", "aptRent", "silvTrade"]
TODAY = datetime.date(2026, 6, 14)

def regions():
    try:
        return [c.strip() for c in open("/tmp/regions.txt") if c.strip()]
    except FileNotFoundError:
        return ["11680", "11710", "41131", "48170", "28140"]

def complex_urls():
    try:
        return [u.strip() for u in open("/tmp/warm_urls.txt") if u.strip()]
    except FileNotFoundError:
        return []

def q(s):
    return urllib.parse.quote(s)

# 각 endpoint = (라벨, URL 생성기). 생성기는 호출마다 캐시 키 차원을 랜덤 샘플.
def gen_overview():
    return f"/api/overview?dataset=aptTrade&scope={q(random.choice(SCOPES[:2]))}&yyyymm={random.choice(MONTHS)}"
def gen_statistics():
    return f"/api/statistics?dataset=aptTrade&scope={q(random.choice(SCOPES))}&yyyymm={random.choice(MONTHS)}"
def gen_transactions():
    return f"/api/transactions?dataset=aptTrade&region={random.choice(regions())}&yyyymm={random.choice(MONTHS)}"
def gen_recent():
    d = (TODAY - datetime.timedelta(days=random.randint(0, 30))).isoformat()
    return f"/api/recent?dataset=aptTrade&scope={q(random.choice(SCOPES))}&yyyymm={d[:7].replace('-','')}&limit=300&date={d}"
def gen_aptmap():  # 프론트는 limit=500
    return f"/api/aptmap?dataset=aptTrade&region={random.choice(regions())}&yyyymm={random.choice(MONTHS)}&limit=500"
def gen_range():
    return f"/api/transactions/range?dataset=aptTrade&region={random.choice(regions())}&from=202507&to=202606"
def gen_statistics_seoul():
    return f"/api/statistics?dataset=aptTrade&scope=seoul&yyyymm={CUR_YM}"
def gen_complex():
    us = complex_urls()
    if not us:
        return None
    return random.choice(us).split("api.zihado.com", 1)[-1]
def gen_aptsearch():
    return f"/api/aptsearch?dataset=aptTrade&q={q(random.choice(['래미안','자이','힐스테이트','푸르지오','아이파크']))}"

# 라벨 → (생성기, 샘플수배수). 모든 사용자 경로 커버.
ENDPOINTS = [
    ("overview",     gen_overview),
    ("statistics",   gen_statistics),
    ("transactions", gen_transactions),
    ("recent(date)", gen_recent),
    ("aptmap(500)",  gen_aptmap),
    ("range",        gen_range),
    ("complex",      gen_complex),
    ("aptsearch",    gen_aptsearch),
]

# 임계값 근거(실측): Vercel CDN HIT ~15ms / 워커 KV HIT(Vercel MISS) ~60-120ms / D1 콜드 >300ms.
# Vercel CDN 은 용량 한계로 long-tail 을 LRU evict → 전 URL ≤50ms 는 물리적 불가.
# 목표: D1 콜드(워커 KV 도 비어 재집계) = 0. 그게 워밍 갭의 진짜 신호.
# 임계값을 엔드포인트 유형별로: 코어는 엄격(CDN 상주 기대), long-tail 은 CF KV colo cold-read(~300ms) 허용.
CORE_LABELS = {"overview", "statistics"}
COLD_CORE = 150      # 코어 MISS>150 = 진짜 갭(핫셋이 콜드면 안 됨)
COLD_TAIL = 500      # long-tail MISS>500 = 진짜 갭. 150~500 = colo cold-read(정상, CF 구조)
def cold_thr(label, path=""):
    # 코어라도 과거월(기준월 네비)은 CDN evict→KV colo cold-read 가능 → long-tail 임계 적용.
    # 당월 코어(랜딩/기본뷰)만 엄격(CDN 상주 기대).
    if label in CORE_LABELS and f"yyyymm={CUR_YM}" in path:
        return COLD_CORE
    return COLD_TAIL
HOST_CORE = "land.zihado.com"   # 코어: 사용자 경로(Vercel CDN) 측정
HOST_TAIL = "api.zihado.com"    # long-tail: 워커 직결(KV) 측정 — 프록시로 재면 CDN 오염→코어 evict
def run(n=8):
    ctx = ssl.create_default_context()
    conns = {HOST_CORE: http.client.HTTPSConnection(HOST_CORE, context=ctx, timeout=60),
             HOST_TAIL: http.client.HTTPSConnection(HOST_TAIL, context=ctx, timeout=60)}
    hdr = {"User-Agent": "Mozilla/5.0", "Connection": "keep-alive"}
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    cold = []   # 진짜 갭(유형별 임계 초과 MISS)
    total = 0
    print(f"=== {ts} (코어=프록시 / long-tail=워커직결, 첫조회; 코어>{COLD_CORE} / tail>{COLD_TAIL} = 갭) ===")
    for label, gen in ENDPOINTS:
        worst = None
        ncold = 0
        host = HOST_CORE if label in CORE_LABELS else HOST_TAIL
        for _ in range(n):
            path = gen()
            if not path:
                continue
            total += 1
            thr = cold_thr(label, path)
            try:
                t0 = time.time()
                conns[host].request("GET", path, headers=hdr)
                r = conns[host].getresponse(); r.read()
                ms = (time.time() - t0) * 1000
                vc = r.getheader("x-vercel-cache") or r.getheader("x-edge-cache")
            except Exception as e:
                conns[host] = http.client.HTTPSConnection(host, context=ctx, timeout=60)
                cold.append((label, "ERR", str(e)[:40]))
                continue
            if worst is None or ms > worst[0]:
                worst = (ms, vc)
            if ms > thr and vc == "MISS":      # 유형별 임계 초과 = 진짜 갭
                ncold += 1
                cold.append((label, round(ms), path))
        if worst:
            tag = f"  🔴{ncold} 갭>{thr}" if ncold else ""
            print(f"  {label:16} worst {worst[0]:6.0f}ms ({worst[1]}){tag}")
    print(f"  --> 진짜 갭 {len(cold)}건 / {total} 측정  (long-tail 150~500 MISS=CF KV colo cold-read, 정상)")
    for c in cold[:12]:
        print(f"      {c}")
    return cold

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    sys.exit(2 if run(n) else 0)
