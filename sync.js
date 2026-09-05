#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const templatePath = path.join(rootDir, 'roster.template.json');
const rosterPath = path.join(rootDir, 'roster.json');

if (!fs.existsSync(templatePath)) {
  console.error(`❌ 找不到範本檔案: ${templatePath}`);
  process.exit(1);
}

// 取得當前工作目錄路徑作為預設 HARNESS_HOME
const harnessHome = process.env.HARNESS_HOME || rootDir;

function resolvePlaceholder(val) {
  if (typeof val === 'string') {
    return val.replace(/\{\{HARNESS_HOME\}\}/g, harnessHome);
  }
  return val;
}

// 1. 確保基本檔案結構與看板存在
const tasksPath = path.join(rootDir, 'hive', 'tasks.json');
const tasksTemplatePath = path.join(rootDir, 'hive', 'tasks.template.json');
if (!fs.existsSync(tasksPath) && fs.existsSync(tasksTemplatePath)) {
  fs.copyFileSync(tasksTemplatePath, tasksPath);
  console.log('📄 初始化 hive/tasks.json');
}

const boardPath = path.join(rootDir, 'hive', 'board.md');
const boardTemplatePath = path.join(rootDir, 'hive', 'board.template.md');
if (!fs.existsSync(boardPath) && fs.existsSync(boardTemplatePath)) {
  fs.copyFileSync(boardTemplatePath, boardPath);
  console.log('📄 初始化 hive/board.md');
}

// 2. 處理 roster.json
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

if (!fs.existsSync(rosterPath)) {
  // 初次建立
  const initial = JSON.parse(JSON.stringify(template));
  initial.agents = initial.agents.map(a => ({
    ...a,
    cwd: resolvePlaceholder(a.cwd),
  }));
  fs.writeFileSync(rosterPath, JSON.stringify(initial, null, 2), 'utf8');
  console.log('✅ 初始化建立本機 roster.json 完成');
} else {
  // 增量合併 (Smart Merge)
  let local;
  try {
    local = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
  } catch (err) {
    console.error('⚠️ 本機 roster.json 解析失敗，備份後重新產生...');
    fs.copyFileSync(rosterPath, `${rosterPath}.corrupted.${Date.now()}`);
    local = { agents: [] };
  }

  const localAgents = local.agents || [];
  const localMap = new Map(localAgents.map(a => [a.id, a]));

  const mergedAgents = template.agents.map(tplAgent => {
    const loc = localMap.get(tplAgent.id);
    if (!loc) {
      console.log(`➕ 新增 Agent: [${tplAgent.id}] ${tplAgent.name}`);
      return {
        ...tplAgent,
        cwd: resolvePlaceholder(tplAgent.cwd),
      };
    }

    // 保留本地執行期狀態
    return {
      ...tplAgent,
      cwd: (loc.cwd && loc.cwd !== '{{HARNESS_HOME}}') ? loc.cwd : resolvePlaceholder(tplAgent.cwd),
      ptyId: loc.ptyId || '',
      status: loc.status || 'idle',
      action: loc.action || '',
      progress: typeof loc.progress === 'number' ? loc.progress : 0,
      currentStation: loc.currentStation || tplAgent.currentStation || 'desk',
      tmuxTarget: loc.tmuxTarget || '',
      terminalGeneration: typeof loc.terminalGeneration === 'number' ? loc.terminalGeneration : 0,
    };
  });

  // 保留本機自己額外手動加入的自訂 Agent (若不在範本中)
  for (const loc of localAgents) {
    if (!template.agents.some(t => t.id === loc.id)) {
      mergedAgents.push(loc);
      console.log(`ℹ️ 保留本機專屬 Agent: [${loc.id}] ${loc.name}`);
    }
  }

  local.version = template.version || 1;
  local.agents = mergedAgents;
  if (!local.selectedId && template.selectedId) {
    local.selectedId = template.selectedId;
  }

  fs.writeFileSync(rosterPath, JSON.stringify(local, null, 2), 'utf8');
  console.log('✅ 成功將範本更新 (Model/Prompt/Roles) 合併至本機 roster.json');
}

// 3. 確保每個 Agent 的信箱與記憶體目錄齊全
const updatedRoster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
for (const agent of updatedRoster.agents || []) {
  const agentDir = path.join(rootDir, 'hive', 'agents', agent.id);
  const inboxDone = path.join(agentDir, 'inbox', '.done');
  const outbox = path.join(agentDir, 'outbox');
  const memPath = path.join(agentDir, 'memory.md');
  const idPath = path.join(agentDir, 'identity.md');

  fs.mkdirSync(inboxDone, { recursive: true });
  fs.mkdirSync(outbox, { recursive: true });

  if (!fs.existsSync(memPath)) {
    const tplMem = path.join(rootDir, 'hive', 'agents', 'god', 'memory.template.md');
    let initContent = `# Memory — ${agent.name} (${agent.id})\n\n_Append durable facts, decisions, and context below._\n`;
    if (agent.id === 'god' && fs.existsSync(tplMem)) {
      initContent = fs.readFileSync(tplMem, 'utf8');
    }
    fs.writeFileSync(memPath, initContent, 'utf8');
    console.log(`📝 初始化 Agent 記憶檔: hive/agents/${agent.id}/memory.md`);
  }

  if (!fs.existsSync(idPath)) {
    const starterId = `# ${agent.name} (${agent.id})\n- Role: ${agent.description || agent.role || 'Agent'}\n- Capabilities: —\n- Working directory: ${agent.cwd}\n`;
    fs.writeFileSync(idPath, starterId, 'utf8');
    console.log(`📝 初始化 Agent 人設檔: hive/agents/${agent.id}/identity.md`);
  }
}

console.log('🎉 所有設定與工作目錄驗證完成！');
