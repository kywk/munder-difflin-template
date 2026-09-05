# Munder Difflin Agent Team Workspace Template

[English](README.md) · **繁體中文**

本專案是 **Munder Difflin (Hive Harness)** 團隊協作環境的標準範本倉庫（Template Repository）。

---

## 🎯 設計理念與架構

Munder Difflin 在運行時，會在工作目錄中產生大量的**本機即時狀態**（如虛擬終端 PTY、Unix Socket `hooks.sock`、內部訊息自動 Git 提交、任務看板與 Agent 短期記憶）。

為了讓您能夠在**不同電腦上使用相同的 Agent Team 陣容，同時各自獨立執行不同任務**，本範本將架構嚴格分離：

* **團隊規格（Git 追蹤同步）**：
  * Agent 團隊名冊範本 (`roster.template.json`)
  * Agent 人設與核心 Prompt (`hive/agents/<id>/identity.md`)
  * 通訊 Hook 與代理腳本 (`hive/bin/`)
  * 協作規範與指令集 (`hive/PROTOCOL.md`, `hive/COMMANDS.md`)
* **本機執行期（.gitignore 隔離，本機各自獨立）**：
  * 當前本機狀態與終端行程識別碼 (`roster.json`, `hive/fleet.json`, `hive/registry.json`)
  * 任務看板與即時計畫 (`hive/tasks.json`, `hive/board.md`)
  * 訊息佇列與長期學習記憶 (`hive/agents/*/inbox/`, `outbox/`, `memory.md`)
  * 通訊 Socket (`hive/hooks.sock`) 與 Harness 內部 Git (`hive/.git/`)

---

## 📁 目錄結構

```text
munder-difflin-template/
├── .gitignore               # 排除所有本機動態檔案、Socket 與即時狀態
├── README.md                # 英文說明文件（預設）
├── README.zh-TW.md          # 繁體中文說明文件
├── roster.template.json     # 團隊陣容設定範本（模型、指令、角色、描述）
├── sync.js                  # 智慧合併腳本（將範本更新合成本地 roster.json）
├── sync.sh                  # 一鍵同步腳本（git pull + node sync.js）
├── update-template.js       # 互動比對腳本（比對目前 Munder Difflin 配置並互動匯入範本）
├── update-template.sh       # 互動比對捷徑腳本
├── init.sh                  # 新電腦初次環境初始化腳本
└── hive/
    ├── PROTOCOL.md          # Hive 代理人協同協議
    ├── COMMANDS.md          # 支援的指令集說明文件
    ├── board.template.md    # 初始共用計畫看板範本
    ├── tasks.template.json  # 初始任務看板範本
    ├── bin/                 # 通訊攔截與 Hook 代理核心腳本
    │   ├── agy-hook.cjs
    │   ├── cth-hook.cjs
    │   ├── hive-node
    │   ├── hive-proxy.cjs
    │   └── runtime/node
    ├── spawn-requests/      # 動態建立 Agent 請求佇列（本地隔離）
    └── agents/              # 各 Agent 設定目錄
        └── god/             # 協調總監 (Moo Cow)
            ├── identity.md  # 角色 Prompt（Git 追蹤）
            ├── memory.template.md
            ├── inbox/       # 收件匣（本地隔離）
            └── outbox/      # 發件匣（本地隔離）
```

---

## 🚀 新電腦設定指南（First-time Setup）

當你在新電腦上想要配置這套 Agent Team 時：

### 1. 取得專案
將此範本 Clone 或複製到該電腦的目標目錄，例如：
```bash
git clone <your-repo-url> ~/HarnessAgents
# 或存放於你自訂的路徑
cd ~/HarnessAgents
```

### 2. 執行初始化
```bash
./init.sh
```
此腳本會自動：
1. 賦予所有必要腳本執行權限。
2. 依據 `roster.template.json` 建立本機專屬的 `roster.json`，並將工作路徑自動解析為當前電腦的絕對路徑。
3. 初始化本機專屬的信箱佇列與任務看板。

### 3. 設定 Munder Difflin 工作目錄
* **方式 A**：若 Munder Difflin 預設讀取 `~/HarnessAgents`，建立軟連結：
  ```bash
  ln -s "$(pwd)" "$HOME/HarnessAgents"
  ```
* **方式 B**：在 Munder Difflin 的設定檔（`~/Library/Application Support/munder-difflin/config.json`）中，將 `"harnessHome"` 改為本專案的目錄路徑。

---

## 🔄 未來如何升級與同步團隊？

### 情境 A：在「電腦 A」調整了團隊配置，想更新回範本倉庫
當你在 Munder Difflin 介面或本機新增了 Agent、調整了模型或修改了人設 Prompt，你可以使用**互動式比對腳本**將變更匯入範本：

```bash
./update-template.sh
# 或指定外部工作目錄：./update-template.sh ~/HarnessAgents
```

此腳本會自動：
1. 比對目前 Munder Difflin 的 `roster.json` 與 `roster.template.json`。
2. 比對各 Agent 的人設檔案 `hive/agents/<id>/identity.md`（支援 `[d]` 即時檢視差異 Diff）。
3. 透過終端互動詢問是否新增新 Agent、更新模型/指令、或覆寫 Prompt。
4. 自動清理本機執行期狀態（重設 `ptyId`、`status`，並將本機絕對路徑正規化為 `{{HARNESS_HOME}}`）。
5. 自動為新 Agent 建立 Git 所需的信箱目錄結構與 `.gitkeep`。

完成後提交並推送至 GitHub：
```bash
git add .
git commit -m "feat: sync latest agent team configs to template"
git push
```

### 情境 B：在「電腦 B」同步最新團隊配置
只需在該專案目錄執行：
```bash
./sync.sh
```
`sync.sh` 會自動執行：
1. `git pull --rebase` 拉取最新的範本與 Prompt。
2. 執行 `sync.js` 進行**智慧合併（Smart Merge）**：
   * 自動為本機加入新 Agent。
   * 更新現有 Agent 的模型、指令與設定。
   * **保留**本機的臨時狀態（如目前終端 `ptyId`、本機工作狀態、正在進行的獨立任務）。
   * 自動補齊新 Agent 的信箱目錄與記憶檔。

---

## 💡 注意事項

1. **千萬不要將本機運行中的目錄直接放進 Dropbox 雙向同步**：
   因為各電腦的任務進度不同，且 `hooks.sock` 與 `roster.json` 中的 `ptyId` 屬於本機進程，直接雲端同步會導致衝突與程式崩潰。
2. **記憶隔離**：
   `hive/agents/*/memory.md` 預設被忽略，讓不同電腦上的 Agent 在執行不同任務時，長期記憶保持各自乾淨，不互相干擾。
