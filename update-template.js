#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ANSI 終端顏色
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const CONFIG_KEYS = [
  'name',
  'character',
  'accent',
  'description',
  'project',
  'command',
  'provider',
  'model',
  'isGod',
  'currentStation',
  'cwd'
];

const RUNTIME_KEYS = new Set([
  'ptyId',
  'status',
  'action',
  'progress',
  'terminalGeneration',
  'tmuxTarget'
]);

function printHeader(title) {
  console.log(`\n${c.cyan}${c.bold}============================================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ${title}${c.reset}`);
  console.log(`${c.cyan}${c.bold}============================================================${c.reset}\n`);
}

// 建立支援緩衝與管道輸入的互動式 Prompt
function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const buffer = [];
  let pendingResolve = null;
  let closed = false;

  rl.on('line', (line) => {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(line);
    } else {
      buffer.push(line);
    }
  });

  rl.on('close', () => {
    closed = true;
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve('');
    }
  });

  return {
    async question(query) {
      process.stdout.write(query);
      if (buffer.length > 0) {
        const line = buffer.shift();
        console.log(line); // 回顯管道或預先輸入的文字
        return line;
      }
      if (closed) return '';
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    close() {
      rl.close();
    }
  };
}

function normalizeCwd(cwd, harnessHome) {
  if (typeof cwd !== 'string' || !cwd) return '{{HARNESS_HOME}}';
  const resolvedHome = path.resolve(harnessHome);
  const resolvedCwd = path.resolve(cwd);
  if (resolvedCwd === resolvedHome) {
    return '{{HARNESS_HOME}}';
  }
  if (resolvedCwd.startsWith(resolvedHome + path.sep)) {
    return '{{HARNESS_HOME}}' + resolvedCwd.slice(resolvedHome.length);
  }
  return cwd;
}

function cleanAgentForTemplate(agent, sourceDir) {
  const cleaned = {
    id: agent.id,
    name: agent.name || agent.id,
    character: agent.character || 'michael',
    accent: agent.accent || 'lemon',
    description: agent.description || agent.role || '',
    project: agent.project || 'hive',
    tmuxTarget: '',
    cwd: normalizeCwd(agent.cwd, sourceDir),
    status: 'idle',
    action: '',
    progress: 0,
    currentStation: agent.currentStation || 'desk',
    ptyId: '',
    command: agent.command || '',
    provider: agent.provider || 'claude',
    model: agent.model || '',
    isGod: Boolean(agent.isGod),
    terminalGeneration: 0,
  };

  for (const [key, val] of Object.entries(agent)) {
    if (!RUNTIME_KEYS.has(key) && cleaned[key] === undefined) {
      cleaned[key] = val;
    }
  }

  return cleaned;
}

// LCS-based diff 演算法
function computeLcsDiff(aStr, bStr) {
  const a = (aStr || '').split('\n');
  const b = (bStr || '').split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (a[i] === b[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
      else dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = n, j = m;
  const result = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'common', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.push({ type: 'del', text: a[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

function printDiff(oldStr, newStr, oldLabel = 'Template', newLabel = 'Munder Difflin') {
  console.log(`${c.dim}--- ${oldLabel}${c.reset}`);
  console.log(`${c.dim}+++ ${newLabel}${c.reset}`);
  const diff = computeLcsDiff(oldStr, newStr);
  for (const item of diff) {
    if (item.type === 'add') {
      console.log(`${c.green}+ ${item.text}${c.reset}`);
    } else if (item.type === 'del') {
      console.log(`${c.red}- ${item.text}${c.reset}`);
    } else {
      console.log(`${c.gray}  ${item.text}${c.reset}`);
    }
  }
  console.log();
}

// 尋找目標 Template 目錄與來源 Munder Difflin 目錄
function resolveTargetDir() {
  const current = __dirname;
  if (fs.existsSync(path.join(current, 'roster.template.json'))) {
    return current;
  }
  if (fs.existsSync(path.join(process.cwd(), 'roster.template.json'))) {
    return process.cwd();
  }
  console.error(`${c.red}❌ 找不到 roster.template.json。請在 template 倉庫目錄下執行此腳本。${c.reset}`);
  process.exit(1);
}

function findDefaultSourceDir(targetDir) {
  // 1. 如果在同一目錄中已經有本機執行的 roster.json
  const sameDirRoster = path.join(targetDir, 'roster.json');
  if (fs.existsSync(sameDirRoster)) {
    return targetDir;
  }

  // 2. HARNESS_HOME 環境變數
  if (process.env.HARNESS_HOME && fs.existsSync(process.env.HARNESS_HOME)) {
    return process.env.HARNESS_HOME;
  }

  // 3. Munder Difflin 設定檔中的 harnessHome
  const configPath = path.join(os.homedir(), 'Library', 'Application Support', 'munder-difflin', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.harnessHome && fs.existsSync(cfg.harnessHome)) {
        return cfg.harnessHome;
      }
    } catch (_) {}
  }

  // 4. 預設 ~/HarnessAgents
  const defaultHarness = path.join(os.homedir(), 'HarnessAgents');
  if (fs.existsSync(defaultHarness)) {
    return defaultHarness;
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const isHelp = args.includes('--help') || args.includes('-h');
  const isDryRun = args.includes('--dry-run');
  const autoYes = args.includes('--yes') || args.includes('-y');

  if (isHelp) {
    console.log(`
${c.bold}使用說明：${c.reset}
  node update-template.js [選項] [munder-difflin目錄路徑]

${c.bold}選項：${c.reset}
  -s, --source <路徑>    指定 Munder Difflin 工作目錄 (含 roster.json)
  -y, --yes              自動同意所有變更並更新至 template (非互動模式)
  --dry-run              僅比對並顯示差異，不寫入任何檔案
  -h, --help             顯示此說明文件

${c.bold}範例：${c.reset}
  ./update-template.sh
  node update-template.js
  node update-template.js ~/HarnessAgents
  node update-template.js --source /path/to/munder-difflin
`);
    process.exit(0);
  }

  const targetDir = resolveTargetDir();
  const templateRosterPath = path.join(targetDir, 'roster.template.json');

  // 解析來源路徑
  let sourceDir = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--source' || args[i] === '-s') && args[i + 1]) {
      sourceDir = path.resolve(args[i + 1]);
      break;
    } else if (!args[i].startsWith('-')) {
      sourceDir = path.resolve(args[i]);
      break;
    }
  }

  const prompt = createPrompt();

  try {
    if (!sourceDir) {
      sourceDir = findDefaultSourceDir(targetDir);
    }

    if (!sourceDir || !fs.existsSync(sourceDir)) {
      console.log(`${c.yellow}⚠️ 未自動偵測到有效的 Munder Difflin 工作目錄。${c.reset}`);
      const inputPath = await prompt.question(`${c.cyan}請輸入 Munder Difflin 的工作目錄路徑: ${c.reset}`);
      if (!inputPath.trim()) {
        console.log(`${c.gray}已取消操作。${c.reset}`);
        process.exit(0);
      }
      sourceDir = path.resolve(inputPath.trim());
    }

    const sourceRosterPath = path.join(sourceDir, 'roster.json');

    printHeader('Munder Difflin ➔ Template 代理人設定比對與互動同步');
    console.log(`  ${c.bold}來源 (Munder Difflin):${c.reset} ${c.blue}${sourceDir}${c.reset}`);
    console.log(`  ${c.bold}目標 (Template 倉庫) :${c.reset} ${c.blue}${targetDir}${c.reset}`);
    if (isDryRun) {
      console.log(`  ${c.yellow}${c.bold}模式: [Dry Run 模擬預覽] (不寫入檔案)${c.reset}`);
    }
    console.log();

    if (!fs.existsSync(sourceRosterPath)) {
      console.error(`${c.red}❌ 在來源目錄找不到 roster.json: ${sourceRosterPath}${c.reset}`);
      console.log(`\n${c.yellow}💡 提示：${c.reset}`);
      console.log(`1. 若此來源目錄是剛建立/clone 的，請先在該目錄執行 ${c.bold}./init.sh${c.reset} 初始化產生 roster.json。`);
      console.log(`2. 或使用引數指定正確的工作目錄：${c.bold}node update-template.js /path/to/harness${c.reset}\n`);
      process.exit(1);
    }

    // 讀取檔案
    let sourceData, templateData;
    try {
      sourceData = JSON.parse(fs.readFileSync(sourceRosterPath, 'utf8'));
    } catch (e) {
      console.error(`${c.red}❌ 無法解析來源 roster.json: ${e.message}${c.reset}`);
      process.exit(1);
    }

    try {
      templateData = JSON.parse(fs.readFileSync(templateRosterPath, 'utf8'));
    } catch (e) {
      console.error(`${c.red}❌ 無法解析範本 roster.template.json: ${e.message}${c.reset}`);
      process.exit(1);
    }

    const sourceAgents = sourceData.agents || [];
    const templateAgents = templateData.agents || [];

    const sourceAgentMap = new Map(sourceAgents.map(a => [a.id, a]));
    const templateAgentMap = new Map(templateAgents.map(a => [a.id, a]));

    const stagedTemplateAgents = JSON.parse(JSON.stringify(templateAgents));
    const stagedAgentMap = new Map(stagedTemplateAgents.map(a => [a.id, a]));

    const pendingActions = {
      newAgents: [],       // { agent, identityContent }
      updatedAgents: [],   // { id, diffs: [{ key, oldVal, newVal }] }
      updatedIdentities: [], // { id, newContent, oldContent }
      removedAgents: [],   // { id, name }
    };

    // 1. 比對新 Agent 與現有 Agent 設定
    for (const sAgent of sourceAgents) {
      const tAgent = templateAgentMap.get(sAgent.id);

      // 檢查 source 的 identity.md
      const sIdPath = path.join(sourceDir, 'hive', 'agents', sAgent.id, 'identity.md');
      const tIdPath = path.join(targetDir, 'hive', 'agents', sAgent.id, 'identity.md');
      const sHasId = fs.existsSync(sIdPath);
      const tHasId = fs.existsSync(tIdPath);
      const sIdContent = sHasId ? fs.readFileSync(sIdPath, 'utf8') : null;
      const tIdContent = tHasId ? fs.readFileSync(tIdPath, 'utf8') : null;

      if (!tAgent) {
        // [CASE 1: 新 Agent]
        console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
        console.log(`🆕 ${c.bold}發現新 Agent: [${sAgent.id}] ${sAgent.name || ''}${c.reset}`);
        console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
        console.log(`  • 角色描述   : ${sAgent.description || sAgent.role || '(無)'}`);
        console.log(`  • Provider   : ${sAgent.provider || '(無)'}`);
        console.log(`  • 模型 (Model): ${sAgent.model || '(無)'}`);
        console.log(`  • 指令 (Cmd) : ${sAgent.command || '(無)'}`);
        console.log(`  • 工作目錄   : ${normalizeCwd(sAgent.cwd, sourceDir)}`);
        console.log(`  • 人設檔     : ${sHasId ? `存在 (${sIdContent.split('\n').length} 行)` : '不存在 (將建立預設範本)'}`);
        console.log();

        let choice = 'y';
        if (!autoYes) {
          while (true) {
            const answer = (await prompt.question(
              `${c.cyan}? 是否將此 Agent 新增至 Template? [Y/n${sHasId ? '/v 查看人設' : ''}] (預設: Y): ${c.reset}`
            )).trim().toLowerCase();

            if (answer === 'v' && sHasId) {
              console.log(`\n${c.dim}--- hive/agents/${sAgent.id}/identity.md ---${c.reset}`);
              console.log(sIdContent);
              console.log(`${c.dim}-------------------------------------------${c.reset}\n`);
              continue;
            }

            if (answer === 'n') {
              choice = 'n';
              break;
            } else if (answer === '' || answer === 'y') {
              choice = 'y';
              break;
            }
          }
        }

        if (choice === 'y') {
          const cleaned = cleanAgentForTemplate(sAgent, sourceDir);
          pendingActions.newAgents.push({
            agent: cleaned,
            identityContent: sIdContent || `# ${sAgent.name || sAgent.id} (${sAgent.id})\n- Role: ${sAgent.description || sAgent.role || 'Agent'}\n- Capabilities: —\n- Working directory: {{HARNESS_HOME}}\n`,
          });
          stagedAgentMap.set(cleaned.id, cleaned);
          console.log(`${c.green}  ✔ 已排定加入 Template${c.reset}\n`);
        } else {
          console.log(`${c.gray}  ✖ 略過此 Agent${c.reset}\n`);
        }
      } else {
        // [CASE 2: 現有 Agent 配置比對]
        const diffs = [];
        const normSourceCwd = normalizeCwd(sAgent.cwd, sourceDir);

        for (const key of CONFIG_KEYS) {
          let sVal = sAgent[key];
          let tVal = tAgent[key];
          if (key === 'cwd') {
            sVal = normSourceCwd;
          }
          if (key === 'isGod') {
            sVal = Boolean(sVal);
            tVal = Boolean(tVal);
          }
          if (sVal !== undefined && tVal !== undefined && sVal !== tVal) {
            diffs.push({ key, oldVal: tVal, newVal: sVal });
          } else if (sVal !== undefined && tVal === undefined) {
            diffs.push({ key, oldVal: '(未設定)', newVal: sVal });
          }
        }

        // 檢查是否有額外的自訂屬性
        for (const [key, val] of Object.entries(sAgent)) {
          if (!CONFIG_KEYS.includes(key) && !RUNTIME_KEYS.has(key)) {
            if (tAgent[key] !== val) {
              diffs.push({ key, oldVal: tAgent[key] ?? '(未設定)', newVal: val });
            }
          }
        }

        if (diffs.length > 0) {
          console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
          console.log(`🔄 ${c.bold}Agent 配置變更: [${sAgent.id}] ${sAgent.name || tAgent.name}${c.reset}`);
          console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
          console.log(`以下欄位與 Template 範本有差異：`);
          for (const d of diffs) {
            console.log(`  • ${c.cyan}${d.key}${c.reset}: "${c.red}${d.oldVal}${c.reset}" ➔ "${c.green}${d.newVal}${c.reset}"`);
          }
          console.log();

          let updateChoice = 'y';
          if (!autoYes) {
            const answer = (await prompt.question(
              `${c.cyan}? 是否將上述設定更新至 Template? [Y/n] (預設: Y): ${c.reset}`
            )).trim().toLowerCase();
            if (answer === 'n') {
              updateChoice = 'n';
            }
          }

          if (updateChoice === 'y') {
            const staged = stagedAgentMap.get(sAgent.id);
            for (const d of diffs) {
              staged[d.key] = d.newVal;
            }
            pendingActions.updatedAgents.push({ id: sAgent.id, diffs });
            console.log(`${c.green}  ✔ 已排定更新 Template 中的 [${sAgent.id}] 配置${c.reset}\n`);
          } else {
            console.log(`${c.gray}  ✖ 保留 Template 原有配置${c.reset}\n`);
          }
        }

        // [CASE 3: identity.md 人設 Prompt 比對]
        if (sHasId && sIdPath !== tIdPath) {
          const sTrimmed = sIdContent.trim();
          const tTrimmed = (tIdContent || '').trim();

          if (!tHasId || sTrimmed !== tTrimmed) {
            console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
            console.log(`📝 ${c.bold}Agent 人設 Prompt 差異: [${sAgent.id}] (hive/agents/${sAgent.id}/identity.md)${c.reset}`);
            console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
            if (!tHasId) {
              console.log(`  • Template 目前無 identity.md，來源有 ${sIdContent.split('\n').length} 行。`);
            } else {
              console.log(`  • Template 與來源的 Prompt 內容存在差異。`);
            }
            console.log();

            let idChoice = 'y';
            if (!autoYes) {
              while (true) {
                const answer = (await prompt.question(
                  `${c.cyan}? 是否將目前 identity.md 同步至 Template? [Y/n${tHasId ? '/d 查看差異' : ''}] (預設: Y): ${c.reset}`
                )).trim().toLowerCase();

                if (answer === 'd' && tHasId) {
                  console.log();
                  printDiff(tIdContent, sIdContent, `Template (hive/agents/${sAgent.id}/identity.md)`, `來源 (hive/agents/${sAgent.id}/identity.md)`);
                  continue;
                }

                if (answer === 'n') {
                  idChoice = 'n';
                  break;
                } else if (answer === '' || answer === 'y') {
                  idChoice = 'y';
                  break;
                }
              }
            }

            if (idChoice === 'y') {
              pendingActions.updatedIdentities.push({
                id: sAgent.id,
                newContent: sIdContent,
                oldContent: tIdContent,
              });
              console.log(`${c.green}  ✔ 已排定同步 identity.md${c.reset}\n`);
            } else {
              console.log(`${c.gray}  ✖ 保留 Template 原有 identity.md${c.reset}\n`);
            }
          }
        }
      }
    }

    // [CASE 4: Template 有但 Source 沒有的 Agent]
    for (const tAgent of templateAgents) {
      if (!sourceAgentMap.has(tAgent.id)) {
        console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
        console.log(`ℹ️ ${c.bold}範本專屬 Agent: [${tAgent.id}] ${tAgent.name || ''}${c.reset}`);
        console.log(`${c.yellow}${c.bold}------------------------------------------------------------${c.reset}`);
        console.log(`  此 Agent 存在於 Template，但在目前 Munder Difflin 中不存在。`);
        console.log();

        let removeChoice = 'n';
        if (!autoYes) {
          const answer = (await prompt.question(
            `${c.cyan}? 是否從 Template 中移除此 Agent? [y/N (選 N 保留)] (預設: N): ${c.reset}`
          )).trim().toLowerCase();
          if (answer === 'y') {
            removeChoice = 'y';
          }
        }

        if (removeChoice === 'y') {
          stagedAgentMap.delete(tAgent.id);
          pendingActions.removedAgents.push({ id: tAgent.id, name: tAgent.name });
          console.log(`${c.red}  ✔ 已排定從 Template 移除 [${tAgent.id}]${c.reset}\n`);
        } else {
          console.log(`${c.gray}  ✔ 保留此 Agent 於 Template${c.reset}\n`);
        }
      }
    }

    // 彙總與確認
    const hasChanges =
      pendingActions.newAgents.length > 0 ||
      pendingActions.updatedAgents.length > 0 ||
      pendingActions.updatedIdentities.length > 0 ||
      pendingActions.removedAgents.length > 0;

    printHeader('變更摘要 (Summary of Changes)');

    if (!hasChanges) {
      console.log(`${c.green}🎉 目前 Munder Difflin 與 Template 的 Agent 配置完全一致，無任何需同步項目！${c.reset}\n`);
      return;
    }

    if (pendingActions.newAgents.length > 0) {
      console.log(`${c.green}${c.bold}➕ 新增 Agent (${pendingActions.newAgents.length}):${c.reset}`);
      for (const item of pendingActions.newAgents) {
        console.log(`   - [${item.agent.id}] ${item.agent.name} (${item.agent.model || '無模型'})`);
      }
    }

    if (pendingActions.updatedAgents.length > 0) {
      console.log(`${c.yellow}${c.bold}🔄 更新 Agent 配置 (${pendingActions.updatedAgents.length}):${c.reset}`);
      for (const item of pendingActions.updatedAgents) {
        const fields = item.diffs.map(d => d.key).join(', ');
        console.log(`   - [${item.id}] (修改欄位: ${fields})`);
      }
    }

    if (pendingActions.updatedIdentities.length > 0) {
      console.log(`${c.blue}${c.bold}📝 更新 Prompt / identity.md (${pendingActions.updatedIdentities.length}):${c.reset}`);
      for (const item of pendingActions.updatedIdentities) {
        console.log(`   - hive/agents/${item.id}/identity.md`);
      }
    }

    if (pendingActions.removedAgents.length > 0) {
      console.log(`${c.red}${c.bold}🗑️ 移除 Agent (${pendingActions.removedAgents.length}):${c.reset}`);
      for (const item of pendingActions.removedAgents) {
        console.log(`   - [${item.id}] ${item.name}`);
      }
    }

    console.log();

    if (isDryRun) {
      console.log(`${c.yellow}⚠️ 目前處於 --dry-run 模式，未寫入任何變更。${c.reset}\n`);
      return;
    }

    let confirmSave = 'y';
    if (!autoYes) {
      const answer = (await prompt.question(
        `${c.cyan}${c.bold}? 確認將以上變更寫入 Template? [Y/n] (預設: Y): ${c.reset}`
      )).trim().toLowerCase();
      if (answer === 'n') {
        confirmSave = 'n';
      }
    }

    if (confirmSave !== 'y') {
      console.log(`${c.gray}已取消寫入。${c.reset}\n`);
      return;
    }

    // 執行寫入
    console.log(`\n${c.bold}📦 正在寫入範本倉庫...${c.reset}`);

    // 1. 組合新的 roster.template.json
    const finalAgents = Array.from(stagedAgentMap.values());
    templateData.agents = finalAgents;
    templateData.savedAt = new Date().toISOString();

    fs.writeFileSync(templateRosterPath, JSON.stringify(templateData, null, 2) + '\n', 'utf8');
    console.log(`  ${c.green}✔ 已更新 roster.template.json${c.reset}`);

    // 2. 寫入 / 複製新 Agent 人設檔與信箱骨架
    for (const item of pendingActions.newAgents) {
      const agentDir = path.join(targetDir, 'hive', 'agents', item.agent.id);
      const inboxDone = path.join(agentDir, 'inbox', '.done');
      const outbox = path.join(agentDir, 'outbox');
      const idFile = path.join(agentDir, 'identity.md');

      fs.mkdirSync(inboxDone, { recursive: true });
      fs.mkdirSync(outbox, { recursive: true });

      // 建立 .gitkeep 確保 Git 追蹤空目錄
      fs.writeFileSync(path.join(agentDir, 'inbox', '.gitkeep'), '', 'utf8');
      fs.writeFileSync(path.join(inboxDone, '.gitkeep'), '', 'utf8');
      fs.writeFileSync(path.join(outbox, '.gitkeep'), '', 'utf8');

      fs.writeFileSync(idFile, item.identityContent, 'utf8');
      console.log(`  ${c.green}✔ 已建立 hive/agents/${item.agent.id}/identity.md 與信箱目錄結構${c.reset}`);
    }

    // 3. 寫入修改的 identity.md
    for (const item of pendingActions.updatedIdentities) {
      const idFile = path.join(targetDir, 'hive', 'agents', item.id, 'identity.md');
      fs.mkdirSync(path.dirname(idFile), { recursive: true });
      fs.writeFileSync(idFile, item.newContent, 'utf8');
      console.log(`  ${c.green}✔ 已更新 hive/agents/${item.id}/identity.md${c.reset}`);
    }

    console.log(`\n${c.green}${c.bold}🎉 恭喜！已成功將變更更新至 Template 範本！${c.reset}\n`);
    console.log(`${c.yellow}💡 下一步建議：${c.reset}`);
    console.log(`  檢視 Git 變更: ${c.bold}git status && git diff roster.template.json${c.reset}`);
    console.log(`  提交並推送到遠端:`);
    console.log(`    ${c.bold}git add .${c.reset}`);
    console.log(`    ${c.bold}git commit -m "feat(template): sync latest agent configs from munder-difflin"${c.reset}`);
    console.log(`    ${c.bold}git push${c.reset}\n`);

  } finally {
    prompt.close();
  }
}

main().catch(err => {
  console.error(`\n${c.red}❌ 發生錯誤: ${err.message}${c.reset}`);
  console.error(err);
  process.exit(1);
});
