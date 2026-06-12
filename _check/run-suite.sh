#!/bin/zsh
# 使い方: run-suite.sh <バッチ名> <スクリプト...> — 各スクリプトの合否を1行で _check/final-audit.log に追記
cd /Users/<redacted>/Desktop/dev/260611_hikari
for s in "${@:2}"; do
  out=$(node "_check/$s" 2>&1); code=$?
  last=$(echo "$out" | grep -E "PASS|FAIL|RESULT|NO_ERRORS|errors|OK|failed" | tail -2 | tr '\n' ' | ')
  echo "[$1] $s exit=$code :: $last" >> _check/final-audit.log
done
echo "[$1] DONE" >> _check/final-audit.log
