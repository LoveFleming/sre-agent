/**
 * Execution Logs Tab
 *
 * 瀏覽 agent 執行記錄，點開看 step-by-step trace
 */

import { useState, useEffect, useCallback } from "react";

const API = "";

interface ExecSummary {
  execId: string;
  type: string;
  workflowId: string | null;
  workflowName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  turns: number;
  stepCount: number;
  cost: { tokensIn: number; tokensOut: number; llmCalls: number; toolCalls: number };
  result: string | null;
  error: string | null;
}

interface ExecStep {
  execId: string;
  ts: string;
  stepType: string; // llm | tool | error | info
  turn?: number;
  tool?: string;
  model?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
  summary?: string;
  finishReason?: string;
}

interface ExecDetail extends ExecSummary {
  steps: ExecStep[];
}

export default function ExecutionLogs() {
  const [logs, setLogs] = useState<ExecSummary[]>([]);
  const [selected, setSelected] = useState<ExecDetail | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      params.set("limit", "50");
      const r = await fetch(`${API}/api/logs?${params}`);
      const d = await r.json();
      setLogs(d.entries || []);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const openDetail = useCallback(async (execId: string) => {
    try {
      const r = await fetch(`${API}/api/logs/${execId}`);
      const d = await r.json();
      setSelected(d);
    } catch {}
  }, []);

  // ── Detail view ──
  if (selected) {
    return <DetailView exec={selected} onBack={() => setSelected(null)} />;
  }

  // ── List view ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="lbl">Execution Logs</p>
        <div className="flex items-center gap-2">
          {["", "running", "completed", "failed"].map(s => (
            <button key={s || "all"} onClick={() => setFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                filter === s ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"
              }`}>
              {s || "All"}
            </button>
          ))}
          <span className="text-xs text-stone-400 ml-2">{logs.length} records</span>
        </div>
      </div>

      {logs.map(e => {
        const isRunning = e.status === "running";
        const isError = e.status === "failed" || e.error;
        const dur = e.durationMs ? _fmtDuration(e.durationMs) : isRunning ? "..." : "?";
        const time = e.startedAt ? new Date(e.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "?";

        return (
          <div key={e.execId} onClick={() => openDetail(e.execId)}
            className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all p-3.5 cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Status icon */}
              <div className="shrink-0">
                {isRunning ? (
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                ) : isError ? (
                  <span className="text-sm">❌</span>
                ) : (
                  <span className="text-sm">✅</span>
                )}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-800 truncate">
                    {e.workflowName || e.type}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-stone-100 text-stone-500">
                    {e.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-stone-400 font-mono">{time}</span>
                  <span className="text-xs text-stone-400">{dur}</span>
                  <span className="text-xs text-stone-400">{e.turns} turns</span>
                  <span className="text-xs text-stone-400">{e.stepCount} steps</span>
                </div>
              </div>

              {/* Cost */}
              <div className="shrink-0 text-right">
                {e.cost.llmCalls > 0 && (
                  <div className="text-xs text-stone-500 font-mono">
                    {(e.cost.tokensIn + e.cost.tokensOut).toLocaleString()} tok
                  </div>
                )}
                {e.cost.toolCalls > 0 && (
                  <div className="text-xs text-stone-400">{e.cost.toolCalls} tool calls</div>
                )}
              </div>

              {/* Error preview */}
              {isError && e.error && (
                <div className="shrink-0 max-w-[200px] truncate text-xs text-red-500">
                  {e.error}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {logs.length === 0 && !loading && (
        <div className="text-center py-16 bg-white rounded-xl border border-stone-200">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-sm text-stone-400">No execution logs yet</p>
          <p className="text-xs text-stone-300 mt-1">Run a workflow to see logs here</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Detail View — Step Trace
// ════════════════════════════════════════════════════════════

function DetailView({ exec, onBack }: { exec: ExecDetail; onBack: () => void }) {
  const steps = exec.steps || [];
  const isError = exec.status === "failed" || exec.error;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-stone-800">
              {exec.workflowName || exec.type}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              exec.status === "running" ? "bg-amber-50 text-amber-600"
              : isError ? "bg-red-50 text-red-600"
              : "bg-emerald-50 text-emerald-600"
            }`}>
              {exec.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-stone-400 font-mono">{exec.execId}</span>
            <span className="text-xs text-stone-400">
              {exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "?"}
            </span>
            {exec.durationMs && (
              <span className="text-xs text-stone-400">{_fmtDuration(exec.durationMs)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4">
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Turns" value={exec.turns} />
          <Stat label="Steps" value={steps.length} />
          <Stat label="LLM Calls" value={exec.cost?.llmCalls || 0} />
          <Stat label="Tool Calls" value={exec.cost?.toolCalls || 0} />
        </div>
        {(exec.cost?.tokensIn || exec.cost?.tokensOut) && (
          <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-stone-100">
            <Stat label="Tokens In" value={(exec.cost?.tokensIn || 0).toLocaleString()} />
            <Stat label="Tokens Out" value={(exec.cost?.tokensOut || 0).toLocaleString()} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {exec.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">❌</span>
            <span className="text-sm font-semibold text-red-700">Error</span>
          </div>
          <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{exec.error}</pre>
        </div>
      )}

      {/* Result */}
      {exec.result && !isError && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">📋</span>
            <span className="text-sm font-semibold text-stone-700">Result</span>
          </div>
          <div className="text-sm text-stone-600 whitespace-pre-wrap leading-relaxed">{exec.result}</div>
        </div>
      )}

      {/* Step Trace */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <span className="text-sm font-semibold text-stone-700">Step Trace</span>
        </div>
        <div className="divide-y divide-stone-50">
          {steps.map((s, i) => (
            <StepRow key={i} step={s} n={i + 1} />
          ))}
          {steps.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-stone-400">No steps recorded</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepRow({ step, n }: { step: ExecStep; n: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLLM = step.stepType === "llm";
  const isTool = step.stepType === "tool";
  const isError = step.stepType === "error";
  const isInfo = step.stepType === "info";

  const icon = isLLM ? "🧠" : isTool ? (step.error ? "❌" : "🔧") : isError ? "❌" : "ℹ️";
  const label = isLLM ? `LLM: ${step.model || "?"}` : isTool ? `Tool: ${step.tool}` : step.error || step.summary || "Info";

  return (
    <div className="px-4 py-2.5 hover:bg-stone-50 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-stone-300 w-5 text-right shrink-0">{n}</span>
        <span className="text-xs shrink-0">{icon}</span>
        <span className="text-sm font-mono text-stone-700 shrink-0">{label}</span>
        {step.turn && (
          <span className="text-xs text-stone-400 shrink-0">turn {step.turn}</span>
        )}
        <div className="flex-1" />
        {isLLM && (step.tokensIn || step.tokensOut) && (
          <span className="text-xs text-stone-400 font-mono shrink-0">
            {step.tokensIn}→{step.tokensOut}
          </span>
        )}
        {step.summary && isTool && (
          <span className="text-xs text-stone-400 truncate max-w-[200px] shrink-0">{step.summary}</span>
        )}
        {step.durationMs != null && (
          <span className="text-xs text-stone-400 shrink-0">{_fmtDuration(step.durationMs)}</span>
        )}
        {step.finishReason && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 shrink-0">{step.finishReason}</span>
        )}
      </div>
      {expanded && step.error && (
        <div className="mt-1.5 ml-8 text-xs text-red-500 font-mono whitespace-pre-wrap">{step.error}</div>
      )}
    </div>
  );
}

// ── Helpers ──

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-bold text-stone-800">{value}</div>
      <div className="text-xs text-stone-400">{label}</div>
    </div>
  );
}

function _fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}
