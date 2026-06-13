#!/usr/bin/env python3
"""perf1000.json → 성능 개선 리포트 HTML 생성."""
import json, sys, datetime

data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/perf1000.json"))

# 개선 타임라인: (영역, 문제, 조치, before, after)
FIXES = [
    ("recent API", "인덱스 부재 + 캐시 미적용으로 매 요청 23K행 정렬, KV 미스 시 동시 폭주",
     "복합인덱스(dataset,deal_ymd,deal_date) + KV 응답캐시 + inflight 중복제거", "10,500ms", "정상"),
    ("overview cold", "당월 7천행 집계인데 쿼리플래너가 110만행 풀스캔(통계 부재)",
     "ANALYZE 로 플래너 통계 갱신 → 인덱스 시크", "126ms / 110만행", "33ms / 2.4만행"),
    ("regionTrends", "6개월 추이를 매번 raw 33만행 GROUP BY",
     "월·지역 사전집계 테이블(region_month_agg) 도입 → 756행 룩업", "485ms", "1.3ms"),
    ("overview cold(종합)", "집계 3쿼리가 교차리전 raw 스캔",
     "사전집계 + 3쿼리 병렬화 + 누락지역 백그라운드 큐", "2,962ms", "365ms"),
    ("hot path", "KV 중앙스토어 읽기 지연이 매 응답에 ~15ms",
     "엣지 캐시(Cache API) → colo 로컬 히트, 워커 미경유(cf-cache HIT)", "서버 ~19ms", "서버 ~6ms"),
    ("네트워크 라우팅", "Free 플랜은 한국 트래픽을 홍콩(HKG)으로 오프로드 → RTT 44ms",
     "Pro 업그레이드 + api.zihado.com 커스텀 도메인 → 도쿄(NRT) 서빙", "HKG 44ms", "NRT 37ms"),
]

ROWS = sorted(data.items(), key=lambda kv: kv[1]["p95"])

def badge(p95):
    if p95 < 50: return ("#16a34a", "GOOD")
    if p95 < 80: return ("#d97706", "OK")
    return ("#dc2626", "SLOW")

trows = ""
for name, r in ROWS:
    col, lab = badge(r["p95"])
    kb = f'{r["bytes"]/1024:.1f}KB' if r["bytes"] >= 1024 else f'{r["bytes"]}B'
    trows += f"""<tr>
      <td><code>{name}</code></td>
      <td>{r['p50']}</td><td>{r['p90']}</td><td class="bold">{r['p95']}</td><td>{r['p99']}</td>
      <td>{r['avg']}</td><td>{r['mn']}~{r['mx']}</td>
      <td>{r['under50']}/{r['n']}</td>
      <td>{kb} <span class="dim">{r['enc']}</span></td>
      <td>{r['colo']} · {r['cache']}</td>
      <td><span class="badge" style="background:{col}">{lab}</span></td>
    </tr>"""

frows = ""
for area, prob, fix, before, after in FIXES:
    frows += f"""<tr>
      <td class="bold">{area}</td><td>{prob}</td><td>{fix}</td>
      <td class="before">{before}</td><td class="after">{after}</td>
    </tr>"""

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
total = sum(r["n"] for _, r in ROWS)
under = sum(r["under50"] for _, r in ROWS)
floor_rtt = 37

html = f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>Landman API 성능 개선 리포트</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#e2e8f0;padding:2.5rem;line-height:1.55}}
h1{{font-size:1.7rem;margin-bottom:.3rem}}
h2{{font-size:1.15rem;margin:2.2rem 0 .8rem;color:#93c5fd;border-left:3px solid #3b82f6;padding-left:.6rem}}
.meta{{color:#94a3b8;font-size:.85rem;margin-bottom:.5rem}}
.cards{{display:flex;gap:1rem;margin:1.5rem 0;flex-wrap:wrap}}
.card{{background:#1e293b;border-radius:.6rem;padding:1rem 1.3rem;flex:1;min-width:150px}}
.card .n{{font-size:1.8rem;font-weight:700}}
.card .l{{font-size:.78rem;color:#94a3b8;margin-top:.2rem}}
table{{width:100%;border-collapse:collapse;background:#1e293b;border-radius:.6rem;overflow:hidden;font-size:.86rem;margin-top:.5rem}}
th{{background:#0f172a;color:#cbd5e1;padding:.6rem .7rem;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em}}
td{{padding:.55rem .7rem;border-bottom:1px solid #334155}}
tr:last-child td{{border-bottom:none}}
code{{font-family:"SF Mono",monospace;background:#0f172a;padding:.1rem .4rem;border-radius:.25rem;font-size:.82rem;color:#7dd3fc}}
.bold{{font-weight:700;color:#fff}}
.dim{{color:#64748b;font-size:.75rem}}
.before{{color:#f87171;font-family:monospace}}
.after{{color:#4ade80;font-family:monospace;font-weight:700}}
.badge{{color:#fff;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:999px}}
.note{{background:#1e293b;border-radius:.6rem;padding:1rem 1.3rem;margin-top:1rem;font-size:.88rem;color:#cbd5e1}}
.note b{{color:#fbbf24}}
</style></head><body>
<h1>Landman API 성능 개선 리포트</h1>
<p class="meta">대상: https://api.zihado.com (Cloudflare Worker, Pro) · 측정: 엔드포인트별 1,000회 · 단일 연결 재사용 + br 압축(실브라우저 동일 조건) · {now}</p>

<div class="cards">
  <div class="card"><div class="n">{len(ROWS)}</div><div class="l">엔드포인트</div></div>
  <div class="card"><div class="n">{total:,}</div><div class="l">총 호출 수</div></div>
  <div class="card"><div class="n">~6ms</div><div class="l">순수 서버 처리(엣지 HIT)</div></div>
  <div class="card"><div class="n">{floor_rtt}ms</div><div class="l">NRT(도쿄) 왕복 RTT — 물리 바닥</div></div>
</div>

<h2>무엇이 문제였고, 어떻게 고쳤나</h2>
<table>
<thead><tr><th>영역</th><th>문제</th><th>조치</th><th>Before</th><th>After</th></tr></thead>
<tbody>{frows}</tbody>
</table>

<h2>최종 측정 결과 (엔드포인트별 1,000회)</h2>
<table>
<thead><tr><th>엔드포인트</th><th>p50</th><th>p90</th><th>p95</th><th>p99</th><th>avg</th><th>min~max</th><th>&lt;50ms</th><th>응답크기</th><th>colo·cache</th><th>판정</th></tr></thead>
<tbody>{trows}</tbody>
</table>
<p class="meta" style="margin-top:.6rem">단위 ms. colo=Cloudflare 서빙 데이터센터, cache=CDN 캐시 상태(HIT=워커 미경유).</p>

<h2>병목 분석: 남은 시간은 어디로 가는가</h2>
<div class="note">
서버 처리는 <b>~6ms</b>까지 최적화 완료(사전집계 룩업 1~2ms + 엣지 캐시 HIT은 워커조차 미경유, <code>cf-cache-status: HIT</code>).<br><br>
응답시간을 지배하는 건 <b>네트워크 왕복(RTT)</b>입니다. 이 머신→Cloudflare 서빙 colo:<br>
• Free 플랜: 홍콩(HKG) <b>44ms</b> — 한국 트래픽 오프로드<br>
• Pro + 커스텀 도메인: 도쿄(NRT) <b>37ms</b> ← 현재<br>
• 서울(ICN): <b>5ms</b> — Cloudflare 자체 인프라(1.1.1.1)는 여기로 가지만, 고객 zone 애니캐스트(172.67.x)는 이 ISP 경로에서 NRT로 붙음. colo 선택은 BGP라 플랜으로 강제 불가.<br><br>
즉 현재 end-to-end는 <b>NRT RTT 37ms + 처리 6ms ≈ 43~55ms</b>. 50ms 경계에 위치. 40ms 이하나 안정적 50ms 이하는 ICN 서빙(=5ms RTT)이 필요하며, 이는 BGP 라우팅에 달려 있어 애플리케이션·플랜으로는 추가 단축 불가.
</div>
</body></html>"""

open(sys.argv[2] if len(sys.argv) > 2 else "tests/performance/report.html", "w").write(html)
print("report written:", sys.argv[2] if len(sys.argv) > 2 else "tests/performance/report.html")
print(f"전체 <50ms: {under}/{total}")
