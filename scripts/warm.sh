#!/usr/bin/env bash
# 배포 후 통합 워밍 — Vercel ISR 은 새 배포마다 콜드라서 SSR 라우트(HTML+RSC) +
# 오늘의실거래 날짜경로 + 워커 코어를 한 번에 데운다. RSC 는 HTML 과 별도 캐시 엔트리라
# 둘 다 굽는다(안 그러면 날짜 soft-nav 가 MISS 콜드).
set -uo pipefail
B="${BASE:-https://land.zihado.com}"
W="${WORKER:-https://api.zihado.com}"

warm() { curl -s -o /dev/null "$1"; curl -s -o /dev/null -H "RSC: 1" "$1"; }

echo "1) SSR 라우트 (HTML+RSC)"
for p in / /today /stats /map /presale /rent /complex; do warm "$B$p"; done

echo "2) 오늘의실거래 최근 14일 날짜경로 (HTML+RSC)"
for i in $(seq 1 14); do warm "$B/today/$(date -v-"${i}"d +%Y-%m-%d)"; done

echo "3) 워커 워밍 트리거 (전 데이터셋: core/regions=매매+전월세, regions-past=매매과거+분양권, recent-sido, complexes)"
for which in core regions regions-past recent-sido complexes; do
  curl -s -X POST "$W/api/admin/warm?which=$which" -o /dev/null
done

echo "워밍 완료 — 검증:"
for p in / /today /today/$(date -v-2d +%Y-%m-%d); do
  c=$(curl -s -o /dev/null -D /tmp/_warm_h.txt -H "RSC: 1" "$B$p"; grep -oiE 'x-vercel-cache: [a-z]+' /tmp/_warm_h.txt | awk '{print $2}')
  printf "  RSC %-22s %s\n" "$p" "${c:-—}"
done