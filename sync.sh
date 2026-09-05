#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🔄 [1/2] 檢查範本更新 (git pull)..."
if [ -d ".git" ]; then
  if git remote | grep -q 'origin'; then
    git pull --rebase || {
      echo "⚠️ git pull 失敗，請手動檢查 Git 狀態。繼續進行本機設定合併..."
    }
  else
    echo "ℹ️ 尚未設定 Git 遠端 (origin)，跳過拉取遠端更新。"
  fi
else
  echo "ℹ️ 當前目錄非 Git 倉庫，跳過 git pull。"
fi

echo "🔄 [2/2] 合併範本設定至本機實體環境 (node sync.js)..."
node sync.js

chmod +x hive/bin/* 2>/dev/null || true
chmod +x hive/bin/runtime/* 2>/dev/null || true

echo ""
echo "✨ 團隊設定同步完成！"
