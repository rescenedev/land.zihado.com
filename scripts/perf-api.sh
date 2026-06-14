#!/usr/bin/env bash
# API 표면 레이턴시 — Vercel 프록시 경유 실사용 경로 (warm HIT), oha HTTP/2 1000req
set -uo pipefail
BASE="${BASE:-https://land.zihado.com}"
N="${N:-1000}"; C="${C:-50}"

EPS=(
  "overview_all|/api/overview?dataset=aptTrade&scope=all&yyyymm=202606"
  "statistics|/api/statistics?dataset=aptTrade&scope=all&yyyymm=202606"
  "recent|/api/recent?dataset=aptTrade&scope=all&yyyymm=202606&limit=300&date=2026-06-14"
  "transactions|/api/transactions?dataset=aptTrade&region=11680&yyyymm=202606"
  "aptsearch|/api/aptsearch?dataset=aptTrade&q=%EB%9E%98%EB%AF%B8%EC%95%88"
)

printf "%-14s %-7s %8s %8s %8s %9s\n" "endpoint" "cache" "p50" "p90" "p99" "ok%"
printf '%.0s-' {1..60}; echo
for e in "${EPS[@]}"; do
  name="${e%%|*}"; path="${e#*|}"; url="$BASE$path"
  curl -s -o /dev/null "$url"; curl -s -o /dev/null "$url"
  cache=$(curl -s -o /dev/null -D - "$url" | grep -i x-vercel-cache | awk '{print $2}' | tr -d '\r')
  j=$(oha -n "$N" -c "$C" --no-tui --output-format json "$url" 2>/dev/null)
  p50=$(echo "$j"|jq -r '.latencyPercentiles.p50'); p90=$(echo "$j"|jq -r '.latencyPercentiles.p90')
  p99=$(echo "$j"|jq -r '.latencyPercentiles.p99'); ok=$(echo "$j"|jq -r '.statusCodeDistribution["200"]//0')
  awk -v n="$name" -v ca="$cache" -v a="$p50" -v b="$p90" -v c="$p99" -v o="$ok" -v nn="$N" \
    'BEGIN{printf "%-14s %-7s %6.1f %6.1f %6.1f %8.1f\n", n, ca, a*1000, b*1000, c*1000, (o/nn)*100}'
done