/**
 * Workflow Routes — CRUD + Agentic Runner
 *
 * Fully self-contained. No PAAW dependency.
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { readBody, json } from "../index.mjs";
import {
  startExecution, logStep, endExecution,
  listExecutions, getExecution,
} from "../lib/exec-logger.mjs";

// ── Active agentic runs ──
const _activeAgenticWorkflows = new Map();

// ── Route handler ──

export async function handleWorkflowRoutes(req, res, path, PATHS) {
  // ── GET /api/workflows — list all ──
  if (req.method === "GET" && path === "/api/workflows") {
    try {
      const files = await readdir(PATHS.WORKFLOWS_ROOT);
      const wfs = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const wf = JSON.parse(readFileSync(join(PATHS.WORKFLOWS_ROOT, f), "utf-8"));
          wfs.push({
            id: wf.id, name: wf.name, description: wf.description,
            icon: wf.icon, mode: wf.mode || "deterministic",
            status: wf.status || "draft",
          });
        } catch {}
      }
      json(res, { workflows: wfs });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── GET /api/workflows/:id — get one ──
  if (req.method === "GET" && path.startsWith("/api/workflows/") && !path.includes("/run")) {
    const wfId = path.split("/api/workflows/")[1].split("/")[0];
    const wfPath = join(PATHS.WORKFLOWS_ROOT, `${wfId}.json`);
    if (!existsSync(wfPath)) { json(res, { error: "Not found" }, 404); return true; }
    try {
      const wf = JSON.parse(readFileSync(wfPath, "utf-8"));
      json(res, wf);
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── POST /api/workflows — create new ──
  if (req.method === "POST" && path === "/api/workflows") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = body.id || `wf-${Date.now()}`;
      const wfPath = join(PATHS.WORKFLOWS_ROOT, `${id}.json`);
      if (existsSync(wfPath)) { json(res, { error: `Workflow '${id}' already exists` }, 409); return true; }

      const wf = {
        id,
        name: body.name || "Untitled Workflow",
        description: body.description || "",
        icon: body.icon || "📋",
        mode: body.mode || "agentic",
        status: body.status || "draft",
        goal: body.goal || "",
        rules: body.rules || [],
        tools: body.tools || ["finish"],
        config: body.config || { maxTurns: 50, timeoutSeconds: 3600, fallbacks: [] },
        inputSchema: body.inputSchema || { type: "object", properties: {} },
        ...body.extra,
      };
      await mkdir(PATHS.WORKFLOWS_ROOT, { recursive: true });
      await writeFile(wfPath, JSON.stringify(wf, null, 2), "utf-8");
      json(res, { ok: true, workflow: wf });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── PUT /api/workflows/:id — update ──
  if (req.method === "PUT" && path.startsWith("/api/workflows/") && !path.includes("/run")) {
    try {
      const wfId = path.split("/api/workflows/")[1];
      const wfPath = join(PATHS.WORKFLOWS_ROOT, `${wfId}.json`);
      const body = JSON.parse(await readBody(req));

      let wf;
      if (existsSync(wfPath)) {
        wf = JSON.parse(readFileSync(wfPath, "utf-8"));
      } else {
        wf = { id: wfId, name: wfId, mode: "agentic", status: "draft", rules: [], tools: ["finish"], config: {} };
      }

      // Merge fields
      for (const key of ["name", "description", "icon", "mode", "status", "goal", "rules", "tools", "config", "inputSchema", "inputMappingHints"]) {
        if (body[key] !== undefined) wf[key] = body[key];
      }
      // Ensure config.fallbacks is saved
      if (body.config?.fallbacks !== undefined) wf.config = wf.config || {}; wf.config.fallbacks = body.config.fallbacks;

      await mkdir(PATHS.WORKFLOWS_ROOT, { recursive: true });
      await writeFile(wfPath, JSON.stringify(wf, null, 2), "utf-8");
      json(res, { ok: true, workflow: wf });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── DELETE /api/workflows/:id ──
  if (req.method === "DELETE" && path.startsWith("/api/workflows/") && !path.includes("/run")) {
    try {
      const wfId = path.split("/api/workflows/")[1];
      const wfPath = join(PATHS.WORKFLOWS_ROOT, `${wfId}.json`);
      if (!existsSync(wfPath)) { json(res, { error: "Not found" }, 404); return true; }
      const { unlink } = await import("fs/promises");
      await unlink(wfPath);
      json(res, { ok: true });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── GET /api/tools — list all available tools from MCP Hub ──
  if (req.method === "GET" && path === "/api/tools") {
    try {
      const { listProviders } = await import("../lib/mcp-hub.mjs");
      const providers = listProviders();
      const allTools = [];
      const seen = new Set();
      for (const p of providers) {
        for (const t of p.tools || []) {
          if (seen.has(t.name)) continue;
          seen.add(t.name);
          allTools.push({
            name: t.name,
            description: t.description,
            provider: p.id,
          });
        }
      }
      // Add builtin tools if not already present
      if (!seen.has("wait")) allTools.push({ name: "wait", description: "等待指定秒數", provider: "builtin" });
      if (!seen.has("finish")) allTools.push({ name: "finish", description: "結束 workflow 並回傳結果", provider: "builtin" });
      json(res, { tools: allTools });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── GET /api/models — list available models from providers.json ──
  if (req.method === "GET" && path === "/api/models") {
    try {
      const localPath = join(PATHS.DATA_ROOT, "config", "providers.local.json");
      const configPath = existsSync(localPath) ? localPath : join(PATHS.DATA_ROOT, "config", "providers.json");
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const activeId = config.active || "zai";
      const activeProvider = config.providers?.[activeId];
      const models = [];
      for (const [pid, p] of Object.entries(config.providers || {})) {
        for (const m of p.models || []) {
          const mid = typeof m === "string" ? m : m.id;
          const mname = typeof m === "string" ? m : (m.name || m.id);
          models.push({
            id: `${pid}/${mid}`,
            name: mname,
            provider: pid,
            providerName: p.name || pid,
            active: pid === activeId,
          });
        }
      }
      json(res, {
        models,
        active: activeId,
        defaultModel: config.defaultModel,
        defaultFallbacks: config.fallbacks || [],
      });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── POST /api/workflows/:id/run — launch async agentic workflow ──
  if (req.method === "POST" && path.match(/\/api\/workflows\/.+\/run$/)) {
    try {
      const wfId = path.split("/api/workflows/")[1].replace("/run", "");
      const wfPath = join(PATHS.WORKFLOWS_ROOT, `${wfId}.json`);
      if (!existsSync(wfPath)) { json(res, { error: "Workflow not found" }, 404); return true; }

      const wf = JSON.parse(readFileSync(wfPath, "utf-8"));
      if (wf.mode !== "agentic") { json(res, { error: `Workflow mode is '${wf.mode}', expected 'agentic'` }, 400); return true; }

      const body = JSON.parse(await readBody(req));
      const runId = await launchAgenticWorkflow(wf, body.input || {}, PATHS);
      json(res, { runId, workflowId: wf.id, status: "running", message: "Workflow launched" });
    } catch (err) {
      console.error("[agentic] Launch error:", err);
      json(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── GET /api/runs/:runId — poll status ──
  if (req.method === "GET" && path.startsWith("/api/runs/")) {
    const runId = path.split("/api/runs/")[1];
    const state = _activeAgenticWorkflows.get(runId);
    if (!state) { json(res, { error: "Run not found", runId }, 404); return true; }
    json(res, state);
    return true;
  }

  // ── GET /api/runs — active runs ──
  if (req.method === "GET" && path === "/api/runs") {
    const runs = Array.from(_activeAgenticWorkflows.values()).map(s => ({
      runId: s.runId, workflowId: s.workflowId, workflowName: s.workflowName,
      status: s.status, turns: s.turns, toolCallCount: s.toolCalls.length,
      startedAt: s.startedAt, lastTool: s.toolCalls.at(-1)?.tool || null,
    }));
    json(res, { active: runs, count: runs.length });
    return true;
  }

  // ── GET /api/logs — execution log list ──
  if (req.method === "GET" && path === "/api/logs") {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const opts = {};
      const status = url.searchParams.get("status");
      const type = url.searchParams.get("type");
      const wfId = url.searchParams.get("workflowId");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      if (status) opts.status = status;
      if (type) opts.type = type;
      if (wfId) opts.workflowId = wfId;
      opts.limit = limit;
      opts.offset = offset;
      const result = await listExecutions(PATHS.DATA_ROOT, opts);
      json(res, result);
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── GET /api/logs/:execId — single execution detail with steps ──
  if (req.method === "GET" && path.startsWith("/api/logs/exec-") ) {
    try {
      const execId = path.split("/api/logs/")[1];
      const detail = await getExecution(PATHS.DATA_ROOT, execId);
      if (!detail) { json(res, { error: "Not found" }, 404); return true; }
      json(res, detail);
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── POST /api/chat/:chatId/send — inject message ──
  if (req.method === "POST" && path.startsWith("/api/chat/") && path.endsWith("/send")) {
    try {
      const chatId = path.split("/api/chat/")[1].replace("/send", "");
      const { content, role = "user" } = JSON.parse(await readBody(req));
      if (!content) { json(res, { error: "content is required" }, 400); return true; }

      const chatFile = join(PATHS.CHAT_DIR, `${chatId}.json`);
      let chat;
      try { chat = JSON.parse(await readFile(chatFile, "utf-8")); }
      catch { chat = { id: chatId, title: chatId, messages: [], createdAt: new Date().toISOString() }; }

      chat.messages.push({ role, content, timestamp: new Date().toISOString() });
      chat.updatedAt = new Date().toISOString();
      await writeFile(chatFile, JSON.stringify(chat, null, 2), "utf-8");
      json(res, { ok: true });
    } catch (err) { json(res, { error: err.message }, 500); }
    return true;
  }

  // ── GET /api/chat/:chatId — read chat ──
  if (req.method === "GET" && path.startsWith("/api/chat/") && !path.includes("/send")) {
    const chatId = path.split("/api/chat/")[1];
    const chatFile = join(PATHS.CHAT_DIR, `${chatId}.json`);
    if (!existsSync(chatFile)) { json(res, { id: chatId, messages: [] }); return true; }
    try {
      const chat = JSON.parse(readFileSync(chatFile, "utf-8"));
      json(res, chat);
    } catch { json(res, { id: chatId, messages: [] }); }
    return true;
  }

  // ── GET /api/tool-providers — list MCP tools ──
  if (req.method === "GET" && path === "/api/tool-providers") {
    const { listProviders } = await import("../lib/mcp-hub.mjs");
    json(res, { providers: listProviders() });
    return true;
  }

  return false;
}

// ── Agentic Workflow Runner ──

async function launchAgenticWorkflow(wf, input, PATHS) {
  const { loadMCPServers, getToolDefinitions, executeToolCall } = await import("../lib/mcp-hub.mjs");
  await loadMCPServers(PATHS.MCP_CONFIG, PATHS.ROOT);

  const runId = `aw-${Date.now()}`;
  const startedAt = new Date().toISOString();

  const state = {
    runId, workflowId: wf.id, workflowName: wf.name,
    status: "running", startedAt,
    turns: 0, toolCalls: [], result: null, completedAt: null,
  };
  _activeAgenticWorkflows.set(runId, state);

  // Start execution log
  const execId = await startExecution(PATHS.DATA_ROOT, {
    type: "workflow",
    workflowId: wf.id,
    workflowName: wf.name,
    runId,
  });
  state.execId = execId;

  _runAgenticLoop(runId, wf, input, PATHS, state, { getToolDefinitions, executeToolCall }, execId).catch(async (err) => {
    state.status = "failed";
    state.result = { summary: `❌ ${err.message}`, details: state.toolCalls };
    state.completedAt = new Date().toISOString();
    try { await endExecution(PATHS.DATA_ROOT, execId, { status: "failed", error: err.message, summary: err.message }); } catch {}
    console.error(`[agentic] CRASH runId=${runId}:`, err);
  });

  console.log(`[agentic] LAUNCHED runId=${runId} workflow=${wf.id}`);
  return runId;
}

async function _runAgenticLoop(runId, wf, input, PATHS, state, toolRegistry, execId) {
  // Resolve LLM config — workflow config overrides global defaults
  const globalLlm = _resolveLLM(PATHS.DATA_ROOT);
  const wfModel = wf.config?.model;
  const wfFallbacks = wf.config?.fallbacks || [];
  const llm = wfModel ? { ...globalLlm, model: wfModel } : globalLlm;
  if (wfFallbacks.length > 0) {
    llm.fallbacks = wfFallbacks.map(f => {
      const fp = globalLlm._providers?.[f.provider];
      if (!fp) return null;
      return { provider: f.provider, model: f.model, apiUrl: fp.baseURL, apiKey: fp.apiKey };
    }).filter(Boolean);
  }

  const maxTurns = wf.config?.maxTurns || 100;
  const timeoutMs = (wf.config?.timeoutSeconds || 7200) * 1000;

  // ── Build system prompt — truly agentic ──
  const systemParts = [
    `你是 Agentic Platform 的自主代理人。你根據任務目標和可用工具，自己判斷怎麼完成任務。`,
    ``,
    `## 任務目標`,
    wf.goal || "按照使用者指示完成任務。",
    ``,
  ];

  if (wf.rules?.length > 0) {
    systemParts.push(`## 規則`);
    for (const rule of wf.rules) systemParts.push(`- ${rule}`);
    systemParts.push(``);
  }

  const requestedTools = wf.tools || [];
  const tools = getToolDefinitions(requestedTools);

  systemParts.push(`## 可用工具`);
  for (const t of tools) {
    systemParts.push(`- **${t.function.name}**: ${t.function.description}`);
  }
  systemParts.push(``);
  systemParts.push(`## 你的職責`);
  systemParts.push(`你自己判斷怎麼完成這個任務。沒有人會告訴你要做幾步、等多久。`);
  systemParts.push(`你應該根據任務目標和輸入資料，自主決定：`);
  systemParts.push(`- 什麼時候發訊息、等多久再 check`);
  systemParts.push(`- 需不需要催人、催幾次、怎麼催`);
  systemParts.push(`- 什麼時候任務算完成`);
  systemParts.push(``);
  systemParts.push(`**結束條件：**`);
  systemParts.push(`- 任務目標已達成 → 呼叫 finish 帶彙總`);
  systemParts.push(`- 截止時間到了 → 呼叫 finish 帶彙總`);
  systemParts.push(`- 你判斷繼續等下去沒有意義 → 呼叫 finish 帶目前的結果`);
  systemParts.push(``);
  systemParts.push(`**重要：** 不要盲目循環 wait→read。每次 read 之後，根據實際收到的回覆內容判斷下一步該做什麼。`);

  const inputDesc = JSON.stringify(input, null, 2);
  const messages = [
    { role: "system", content: systemParts.join("\n") },
    { role: "user", content: `輸入參數：\n${inputDesc}\n\n請開始執行任務。` },
  ];

  console.log(`[agentic] START runId=${runId} workflow=${wf.id} tools=${tools.map(t => t.function.name).join(",")}`);

  const startTime = Date.now();
  const execContext = { paawRoot: PATHS.ROOT, chatDir: PATHS.CHAT_DIR };

  for (let turn = 0; turn < maxTurns; turn++) {
    if (Date.now() - startTime > timeoutMs) {
      state.result = { summary: "⏱️ 超時結束", details: state.toolCalls };
      await logStep(PATHS.DATA_ROOT, execId, { type: "info", turn: turn + 1, summary: "超時結束" });
      break;
    }

    state.turns = turn + 1;

    // Call LLM
    const llmStart = Date.now();
    let response;
    try {
      response = await _callLLM(llm, messages, tools);
    } catch (err) {
      await logStep(PATHS.DATA_ROOT, execId, { type: "error", turn: turn + 1, error: err.message, durationMs: Date.now() - llmStart });
      throw err;
    }
    const llmDuration = Date.now() - llmStart;
    const choice = response.choices?.[0];
    if (!choice) {
      await logStep(PATHS.DATA_ROOT, execId, { type: "error", turn: turn + 1, error: "No choice returned", durationMs: llmDuration });
      break;
    }

    // Log LLM step
    const usage = response.usage || {};
    await logStep(PATHS.DATA_ROOT, execId, {
      type: "llm", turn: turn + 1,
      model: llm.model,
      tokensIn: usage.prompt_tokens || 0,
      tokensOut: usage.completion_tokens || 0,
      durationMs: llmDuration,
      finishReason: choice.finish_reason,
    });

    const msg = choice.message;
    const toolCalls = msg.tool_calls || [];

    if (toolCalls.length === 0 || choice.finish_reason === "stop") {
      state.result = { summary: msg.content || "完成", details: state.toolCalls };
      break;
    }

    messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

      console.log(`[agentic] turn=${turn + 1} tool=${tc.function.name} args=${JSON.stringify(args).slice(0, 200)}`);

      const toolStart = Date.now();
      let toolResult;
      let toolError = null;
      try {
        toolResult = await executeToolCall(tc.function.name, args, execContext);
      } catch (e) {
        toolError = e.message;
        toolResult = { error: e.message };
      }
      const toolDuration = Date.now() - toolStart;
      state.toolCalls.push({ tool: tc.function.name, args, result: toolResult, turn: turn + 1, timestamp: new Date().toISOString() });

      // Log tool step
      await logStep(PATHS.DATA_ROOT, execId, {
        type: "tool", turn: turn + 1,
        tool: tc.function.name,
        durationMs: toolDuration,
        error: toolError,
        summary: tc.function.name === "finish" ? (args.summary || "").slice(0, 120) : JSON.stringify(args).slice(0, 80),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
      });

      if (tc.function.name === "finish") {
        state.result = { summary: args.summary || "完成", details: state.toolCalls };
      }
    }

    if (state.result) break;
  }

  if (!state.result) {
    state.result = { summary: "達到最大輪數限制", details: state.toolCalls };
  }

  state.status = "completed";
  state.completedAt = new Date().toISOString();
  console.log(`[agentic] END runId=${runId} status=completed turns=${state.turns}`);

  // End execution log
  await endExecution(PATHS.DATA_ROOT, execId, {
    status: state.status,
    summary: state.result?.summary || "Completed",
    error: state.result?.summary?.startsWith("❌") ? state.result.summary : null,
  });

  // Write exec history
  try {
    const histDir = join(PATHS.WORKFLOWS_ROOT, "_exec-history");
    await mkdir(histDir, { recursive: true });
    const histFile = join(histDir, `${wf.id}.json`);
    let history = [];
    try { history = JSON.parse(await readFile(histFile, "utf-8")); } catch {}
    history.unshift({
      runId, workflowId: wf.id, workflowName: wf.name,
      status: state.status, startedAt, completedAt: state.completedAt,
      turns: state.turns, result: state.result,
    });
    if (history.length > 50) history = history.slice(0, 50);
    await writeFile(histFile, JSON.stringify(history, null, 2), "utf-8");
  } catch {}

  // Keep in memory 5 min
  setTimeout(() => _activeAgenticWorkflows.delete(runId), 5 * 60 * 1000);
}

// ── LLM config + call helper ──

function _resolveLLM(dataRoot) {
  try {
    const localPath = join(dataRoot, "config", "providers.local.json");
    const configFilePath = existsSync(localPath) ? localPath : join(dataRoot, "config", "providers.json");
    const config = JSON.parse(readFileSync(configFilePath, "utf-8"));
    const activeId = config.active || "zai";
    const provider = config.providers?.[activeId];
    if (!provider) throw new Error(`Provider '${activeId}' not found`);

    const model = config.defaultModel || provider.models?.[0]?.id || "glm-5.1";
    const fallbacks = (config.fallbacks || []).map(f => {
      const fp = config.providers?.[f.provider];
      return fp ? { ...f, apiUrl: fp.baseURL, apiKey: fp.apiKey } : null;
    }).filter(Boolean);

    return {
      apiUrl: provider.baseURL,
      apiKey: provider.apiKey,
      model,
      fallbacks,
      _providers: config.providers,  // expose for per-workflow override
    };
  } catch (err) {
    console.error("[agentic] LLM config error:", err.message);
    return { apiUrl: "", apiKey: "", model: "glm-5.1", fallbacks: [] };
  }
}

async function _callLLM(llm, messages, tools) {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${llm.apiKey}` };
  const body = {
    model: llm.model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    temperature: 0.7,
  };

  // Try primary
  try {
    return await _doFetch(llm.apiUrl, headers, body);
  } catch (err) {
    console.error(`[agentic] LLM primary failed: ${err.message}`);
  }

  // Try fallbacks
  for (const fb of llm.fallbacks || []) {
    try {
      console.log(`[agentic] LLM fallback: ${fb.provider}/${fb.model}`);
      const fbHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${fb.apiKey}` };
      return await _doFetch(fb.apiUrl, fbHeaders, { ...body, model: fb.model });
    } catch (err) {
      console.error(`[agentic] LLM fallback ${fb.provider} failed: ${err.message}`);
    }
  }

  throw new Error("All LLM providers failed");
}

async function _doFetch(apiUrl, headers, body) {
  const url = apiUrl.endsWith("/chat/completions") ? apiUrl : apiUrl + "/chat/completions";
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json();
}
