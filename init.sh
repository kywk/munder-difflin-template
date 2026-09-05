#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "🚀 初始化 Munder Difflin Agent Team 本地工作環境"
echo "=========================================================="
echo "目標工作目錄: $DIR"
echo ""

# 1. 檢查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 node 指令。請先安裝 Node.js (v18+)。"
  exit 1
fi
echo "✅ Node.js: $(node -v)"

# 2. 檢查 Munder Difflin.app
if [ -d "/Applications/Munder Difflin.app" ]; then
  echo "✅ 偵測到 /Applications/Munder Difflin.app"
else
  echo "⚠️ 未在 /Applications 找到 Munder Difflin.app，請確認已安裝該應用程式。"
fi

# 3. 確保 bin 腳本具備執行權限
chmod +x hive/bin/* 2>/dev/null || true
chmod +x hive/bin/runtime/* 2>/dev/null || true
echo "✅ 已賦予 hive/bin 腳本執行權限"

# 4. 執行 sync.js 產生本機專屬的 roster.json 與目錄結構
echo ""
echo "📦 正在建立本機專屬執行期結構與設定..."
node sync.js

# 5. 提示使用者工作目錄對應
echo ""
echo "=========================================================="
echo "🎉 初始化完成！"
echo "=========================================================="
echo "接下來請在 Munder Difflin 中設定工作目錄："
echo ""
echo "【方式 A (推薦)】若 Munder Difflin 預設讀取 ~/HarnessAgents："
echo "  可建立軟連結讓 ~/HarnessAgents 指向本目錄："
echo "  ln -s \"$DIR\" \"\$HOME/HarnessAgents\""
echo ""
echo "【方式 B】直接在 Munder Difflin 的 Preferences / config.json 中"
echo "  將 harnessHome 修改為："
echo "  \"$DIR\""
echo ""
echo "完成後即可開啟 Munder Difflin.app 開始指派任務！"
