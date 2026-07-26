/**
 * Execution Logger — 統一執行日誌
 *
 * 記錄 agent 每次執行的完整軌跡：
 * - LLM call（model、token、duration）
 * - Tool call（name、args、result、duration）
 * - Error、status 變化
 *
 * 存儲：data/execution-logs/YYYY-MM-DD.jsonl
 * 索引：data/execution-logs/index.json（最近 200 筆摘要）
 */

import { appendFile, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getLogDir(dataRoot) {
  return join(dataRoot, "execution-logs");
}

function getTodayFile(dataRoot) {
  const today = new Date().toISOString().slice(0, 10);
  return join(getLogDir(dataRoot), `${today}.jsonl`);
}

function getIndexFile(dataRoot) {
  return join(getLogDir(dataRoot), "index.json");
}

// ── Public API ──

/**
 * 開始一個新執行記錄
 * @returns {string} execId
 */
export async function startExecution(dataRoot, meta) {
  const execId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    execId,
    ts: new Date().toISOString(),
    type: meta.type || "workflow",        // workflow | chat | cron | manual
    workflowId: meta.workflowId || null,
    workflowName: meta.workflowName || null,
    runId: meta.runId || null,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    turns: 0,
    steps: [],
    result: null,
    error: null,
    // 成本累計
    cost: { tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0 },
  };

  await _appendLog(dataRoot, record);
  await _updateIndex(dataRoot, record);
  return execId;
}

/**
 * 記錄一個 step（LLM call 或 tool call）
 */
export async function logStep(dataRoot, execId, step) {
  const entry = {
    execId,
    ts: new Date().toISOString(),
    stepType: step.type,       // llm | tool | error | info
    ...step,
  };
  delete entry.type;

  // Append to today's log
  await _appendLog(dataRoot, entry);

  // Update in-memory index summary (find by execId)
  await _patchIndexEntry(dataRoot, execId, (rec) => {
    rec.steps.push({
      n: rec.steps.length + 1,
      ts: entry.ts,
      type: step.type,
      tool: step.tool || step.model || null,
      durationMs: step.durationMs || null,
      tokensIn: step.tokensIn || 0,
      tokensOut: step.tokensOut || 0,
      error: step.error || null,
      summary: step.summary || null,
    });

    // Update cost
    if (step.type === "llm") {
      rec.cost.llmCalls++;
      rec.cost.tokensIn += step.tokensIn || 0;
      rec.cost.tokensOut += step.tokensOut || 0;
    }
    if (step.type === "tool") {
      rec.cost.toolCalls++;
    }
    if (step.type === "error" && !rec.error) {
      rec.error = step.error || step.summary || "Unknown error";
    }

    rec.turns = Math.max(rec.turns, step.turn || rec.turns);
  });
}

/**
 * 結束執行記錄
 */
export async function endExecution(dataRoot, execId, result) {
  await _patchIndexEntry(dataRoot, execId, (rec) => {
    rec.status = result.status || "completed";
    rec.completedAt = new Date().toISOString();
    rec.result = result.summary || null;
    rec.error = result.error || rec.error || null;
    const start = new Date(rec.startedAt).getTime();
    rec.durationMs = Date.now() - start;

    // Write final record to log file
    _appendLog(dataRoot, {
      execId,
      ts: new Date().toISOString(),
      event: "execution_end",
      status: rec.status,
      durationMs: rec.durationMs,
      result: rec.result,
      error: rec.error,
    });
  });
}

// ── Query API ──

/**
 * 取得執行列表（摘要）
 */
export async function listExecutions(dataRoot, opts = {}) {
  const { status, type, workflowId, limit = 50, offset = 0 } = opts;
  const indexFile = getIndexFile(dataRoot);
  if (!existsSync(indexFile)) return { entries: [], total: 0 };

  let index;
  try {
    index = JSON.parse(readFileSync(indexFile, "utf-8"));
  } catch {
    return { entries: [], total: 0 };
  }

  let entries = index.entries || [];

  // Filter
  if (status) entries = entries.filter(e => e.status === status);
  if (type) entries = entries.filter(e => e.type === type);
  if (workflowId) entries = entries.filter(e => e.workflowId === workflowId);

  const total = entries.length;
  entries = entries.slice(offset, offset + limit);

  return { entries, total };
}

/**
 * 取得單筆執行的完整 step trace
 */
export async function getExecution(dataRoot, execId) {
  // First find which date file has it
  const indexFile = getIndexFile(dataRoot);
  if (!existsSync(indexFile)) return null;

  let index;
  try {
    index = JSON.parse(readFileSync(indexFile, "utf-8"));
  } catch { return null; }

  const summary = (index.entries || []).find(e => e.execId === execId);
  if (!summary) return null;

  // Find the date from startedAt
  const dateStr = summary.startedAt?.slice(0, 10);
  if (!dateStr) return summary;

  const logFile = join(getLogDir(dataRoot), `${dateStr}.jsonl`);
  if (!existsSync(logFile)) return summary;

  // Read all entries for this execId
  let steps = [];
  try {
    const raw = readFileSync(logFile, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.execId === execId && rec.stepType) {
          steps.push(rec);
        }
      } catch {}
    }
  } catch {}

  return { ...summary, steps };
}

// ── Internal helpers ──

async function _appendLog(dataRoot, record) {
  const dir = getLogDir(dataRoot);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const file = getTodayFile(dataRoot);
  await appendFile(file, JSON.stringify(record) + "\n");
}

async function _ensureIndex(dataRoot) {
  const file = getIndexFile(dataRoot);
  if (!existsSync(file)) {
    const dir = getLogDir(dataRoot);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify({ entries: [], version: 1 }), "utf-8");
  }
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return { entries: [], version: 1 };
  }
}

async function _updateIndex(dataRoot, record) {
  const index = await _ensureIndex(dataRoot);
  // Add summary entry
  const summary = {
    execId: record.execId,
    type: record.type,
    workflowId: record.workflowId,
    workflowName: record.workflowName,
    runId: record.runId,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: null,
    durationMs: null,
    turns: 0,
    stepCount: 0,
    cost: record.cost,
    result: null,
    error: null,
  };
  index.entries.unshift(summary);
  // Keep last 200
  if (index.entries.length > 200) index.entries = index.entries.slice(0, 200);
  await writeFile(getIndexFile(dataRoot), JSON.stringify(index), "utf-8");
}

async function _patchIndexEntry(dataRoot, execId, fn) {
  const index = await _ensureIndex(dataRoot);
  const entry = index.entries.find(e => e.execId === execId);
  if (!entry) return;
  fn(entry);
  entry.stepCount = (entry.steps?.length) || entry.stepCount || 0;
  await writeFile(getIndexFile(dataRoot), JSON.stringify(index), "utf-8");
}
