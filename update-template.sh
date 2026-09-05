#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 node 指令。請先安裝 Node.js (v18+)。"
  exit 1
fi

node update-template.js "$@"
