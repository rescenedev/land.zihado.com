#!/usr/bin/env bash
# SSR 전면교체 풀 성능테스트 — 프로덕션 land.zihado.com
# 각 SSR HTML 라우트를 워밍(HIT) 후 oha(HTTP/2, 1000req)로 p50/p90/p99 측정.
set -uo pipefail

BASE="${BASE:-https://land.zihado.com}"
N="${N:-1000}"
C="${C:-50}"
ROUTES=(/ /today /stats /rent /presale /map /complex)

printf "%-10s %-7s %8s %8s %8s %8s %8s %9s\n" "route" "cache" "p50" "p90" "p99" "max" "rps" "ok%"
printf '%.0s-' {1..70}; echo

for r in "${ROUTES[@]}"; do
  # 워밍 2회 → 엣지 HIT 확보
  curl -s -o /dev/null "$BASE$r"; curl -s -o /dev/null "$BASE$r"
  cache=$(curl -s -o /dev/null -D - "$BASE$r" | grep -i x-vercel-cache | awk '{print $2}' | tr -d '\r')

  json=$(oha -n "$N" -c "$C" --no-tui --output-format json "$BASE$r" 2>/dev/null)
  p50=$(echo "$json" | jq -r '.latencyPercentiles.p50 // .summary.average' 2>/dev/null)
  p90=$(echo "$json" | jq -r '.latencyPercentiles.p90' 2>/dev/null)
  p99=$(echo "$json" | jq -r '.latencyPercentiles.p99' 2>/dev/null)
  mx=$(echo "$json"  | jq -r '.summary.slowest' 2>/dev/null)
  rps=$(echo "$json" | jq -r '.summary.requestsPerSec' 2>/dev/null)
  ok=$(echo "$json"  | jq -r '(.statusCodeDistribution["200"] // 0)' 2>/dev/null)

  ms() { awk -v s="$1" 'BEGIN{ if(s=="null"||s==""){print "  n/a"} else {printf "%6.1f", s*1000} }'; }
  okp() { awk -v o="$1" -v n="$N" 'BEGIN{printf "%6.1f", (o/n)*100}'; }
  printf "%-10s %-7s %8s %8s %8s %8s %8.0f %9s\n" \
    "$r" "$cache" "$(ms "$p50")" "$(ms "$p90")" "$(ms "$p99")" "$(ms "$mx")" "$rps" "$(okp "$ok")"
done