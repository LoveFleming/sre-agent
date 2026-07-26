import { useState, useEffect, useCallback, useRef } from "react";

const API = "";

// ── Types ──
interface Workflow {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  mode?: string;
  status?: string;
}

interface ToolCall {
  tool: string;
  args: Record<string, any>;
  result: Record<string, any>;
  turn?: number;
  timestamp?: string;
}

interface RunState {
  runId: string;
  status: string;
  turns: number;
  toolCalls: ToolCall[];
  result?: { summary?: string };
  startedAt?: string;
  completedAt?: string;
}

interface Provider {
  id: string;
  type: string;
  status: string;
  toolCount: number;
  tools?: { name: string; description: string }[];
}

interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
}

// ════════════════════════════════════════════════════════════
// App
// ════════════════════════════════════════════════════════════

export default function App() {
  const [tab, setTab] = useState<"workflows" | "runs" | "logs" | "tools" | "chat">("workflows");
  const [editingWf, setEditingWf] = useState<string | "new" | null>(null);

  const tabs = [
    { id: "workflows" as const, label: "Workflows" },
    { id: "runs" as const, label: "Runs" },
    { id: "logs" as const, label: "Logs" },
    { id: "tools" as const, label: "Tools" },
    { id: "chat" as const, label: "Chat" },
  ];

  // If editing, show full-screen editor (regardless of tab)
  if (editingWf !== null) {
    return <WorkflowEditorView workflowId={editingWf === "new" ? undefined : editingWf} onBack={() => setEditingWf(null)} />;
  }

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <h1 className="text-base font-bold text-stone-800 tracking-tight">Agentic Platform</h1>
          <div className="flex gap-0.5 ml-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${
                  tab === t.id
                    ? "bg-stone-800 text-white"
                    : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {tab === "workflows" && <WorkflowsTab onEdit={(id) => setEditingWf(id)} onNew={() => setEditingWf("new")} />}
        {tab === "runs" && <RunsTab />}
        {tab === "logs" && <ExecutionLogs />}
        {tab === "tools" && <ToolsTab />}
        {tab === "chat" && <ChatTab />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Workflow Editor View (wrapper)
// ════════════════════════════════════════════════════════════

function WorkflowEditorView({ workflowId, onBack }: { workflowId?: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-stone-100">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <Editor workflowId={workflowId} onBack={onBack} />
      </div>
    </div>
  );
}

// ── Import the actual editor component ──
import Editor from "./WorkflowEditor";
import ExecutionLogs from "./ExecutionLogs";

// ════════════════════════════════════════════════════════════
// Workflows Tab
// ════════════════════════════════════════════════════════════

function WorkflowsTab({ onEdit, onNew }: { onEdit: (id: string) => void; onNew: () => void }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [launchId, setLaunchId] = useState<Workflow | null>(null);
  const [running, setRunning] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [result, setResult] = useState<RunState | null>(null);
  const composingRef = useRef(false);
  const [form, setForm] = useState({
    title: "", menu: "", roomId: "rainy-afternoon-tea",
    participants: "", deadline: "5 分鐘",
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/workflows`);
      const d = await r.json();
      setWorkflows(d.workflows || []);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const launch = useCallback(async () => {
    if (!launchId || !form.menu.trim()) return;
    setRunning(true); setResult(null); setToolCalls([]);
    const participants = form.participants.split(",").map(s => s.trim()).filter(Boolean);
    try {
      const r = await fetch(`${API}/api/workflows/${launchId.id}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {
          title: form.title, menu: form.menu,
          roomId: form.roomId, targetChatId: form.roomId,
          participants, deadline: form.deadline, organizer: "User",
        }}),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); setRunning(false); return; }
      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`${API}/api/runs/${d.runId}`);
          const sd = await sr.json();
          if (sd.error) { clearInterval(poll); setRunning(false); return; }
          setToolCalls(sd.toolCalls || []);
          if (sd.status === "completed" || sd.status === "failed") {
            clearInterval(poll); setResult(sd); setRunning(false);
          }
        } catch {}
      }, 3000);
    } catch (err: any) { alert(err.message); setRunning(false); }
  }, [launchId, form]);

  // ── Launch view ──
  if (launchId) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setLaunchId(null)}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xl">{launchId.icon || "📋"}</span>
          <h2 className="text-base font-bold text-stone-800">{launchId.name}</h2>
          <button onClick={() => { setLaunchId(null); onEdit(launchId.id); }}
            className="ml-auto px-3 py-1.5 text-xs bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-600 transition-colors">
            ✏️ Edit
          </button>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Inp label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
            <Inp label="Room ID" value={form.roomId} mono onChange={v => setForm(f => ({ ...f, roomId: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Inp label="Deadline" value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} />
            <Inp label="Participants (comma-separated)" value={form.participants} onChange={v => setForm(f => ({ ...f, participants: v }))} />
          </div>
          <div>
            <label className="lbl">Menu / Task Content</label>
            <textarea value={form.menu}
              onChange={e => setForm(f => ({ ...f, menu: e.target.value }))}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onKeyDown={e => {
                if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); launch(); }
              }}
              placeholder={"珍奶 $65\n紅茶 $40"} rows={4}
              className="inp font-mono resize-y" />
            <p className="text-xs text-stone-400 mt-1">⌘+Enter to launch</p>
          </div>
          <button onClick={launch} disabled={running || !form.menu.trim()}
            className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {running ? (
              <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running...</>
            ) : (<>🚀 Launch Agent</>)}
          </button>
        </div>

        {/* Live tool calls */}
        {toolCalls.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <p className="lbl">Live Activity</p>
            </div>
            <div className="space-y-1.5">
              {toolCalls.map((tc, i) => {
                const err = "error" in String(tc.result).toLowerCase();
                return (
                  <div key={i} className="flex items-center gap-2.5 text-sm py-1">
                    <span className="text-xs font-mono text-stone-300 w-5 text-right">{i + 1}</span>
                    <span className="text-xs">{err ? "❌" : "✅"}</span>
                    <span className="font-mono text-stone-700 text-xs">{tc.tool}</span>
                    <span className="text-xs text-stone-400 truncate flex-1 font-mono">
                      {tc.tool === "wait" ? `${tc.args.seconds}s` : tc.tool === "finish" ? `"${(tc.args.summary || "").slice(0, 60)}..."` : JSON.stringify(tc.args).slice(0, 60)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white rounded-xl border border-stone-300 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              {result.status === "completed" ? "✅" : "⚠️"}
              <p className="text-sm font-semibold text-stone-700">{result.status === "completed" ? "Completed" : "Finished"}</p>
              <span className="text-xs text-stone-400">· {result.turns} turns · {result.toolCalls?.length} calls</span>
            </div>
            <div className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
              {result.result?.summary || "No summary"}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="lbl">Workflows</p>
        <button onClick={onNew}
          className="px-3 py-1.5 text-sm bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {workflows.map(wf => (
        <div key={wf.id} className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">{wf.icon || "📋"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-stone-800">{wf.name}</span>
                {wf.mode === "agentic" && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-stone-800 text-white">Agent</span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  wf.status === "published" ? "bg-emerald-50 text-emerald-600"
                  : wf.status === "archived" ? "bg-stone-100 text-stone-400"
                  : "bg-amber-50 text-amber-600"
                }`}>{wf.status || "draft"}</span>
              </div>
              <p className="text-xs text-stone-400 truncate mt-0.5">{wf.description}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setLaunchId(wf)}
                className="px-3 py-1.5 text-xs bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-medium transition-colors">
                ▶ Launch
              </button>
              <button onClick={() => onEdit(wf.id)}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
      {workflows.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-stone-200">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-sm text-stone-400 mb-3">No workflows yet</p>
          <button onClick={onNew} className="text-sm text-stone-600 hover:text-stone-800 font-medium underline">
            Create your first workflow
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Runs Tab
// ════════════════════════════════════════════════════════════

function RunsTab() {
  const [runs, setRuns] = useState<any[]>([]);
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/runs`);
        const d = await r.json();
        setRuns(d.active || []);
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="lbl">Active Runs</p>
        <span className="text-xs text-stone-400">{runs.length} running</span>
      </div>
      {runs.map(r => (
        <div key={r.runId} className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-stone-800 truncate">{r.workflowName}</div>
            <div className="text-xs text-stone-400 font-mono">{r.runId}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-stone-700">{r.turns}</div>
            <div className="text-xs text-stone-400">turns</div>
          </div>
          <div className="w-px h-8 bg-stone-200" />
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-stone-700">{r.toolCallCount}</div>
            <div className="text-xs text-stone-400">tools</div>
          </div>
        </div>
      ))}
      {runs.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-stone-200">
          <p className="text-2xl mb-2">⚡</p>
          <p className="text-sm text-stone-400">No active runs</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tools Tab
// ════════════════════════════════════════════════════════════

function ToolsTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  useEffect(() => {
    fetch(`${API}/api/tool-providers`).then(r => r.json()).then(d => setProviders(d.providers || [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <p className="lbl">MCP Tool Providers</p>
      {providers.map(p => (
        <div key={p.id} className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${p.status === "ready" ? "bg-emerald-500" : "bg-red-400"}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-stone-800">{p.id}</span>
                <span className="text-xs text-stone-400 font-mono">{p.type}</span>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-stone-100 text-stone-600">{p.toolCount} tools</span>
          </div>
          {p.tools && p.tools.length > 0 && (
            <div className="divide-y divide-stone-100">
              {p.tools.map(t => (
                <div key={t.name} className="px-4 py-2.5 flex items-baseline gap-3">
                  <code className="text-xs text-stone-700 font-medium shrink-0">{t.name}</code>
                  <span className="text-xs text-stone-400 truncate">{t.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {providers.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-stone-200">
          <p className="text-2xl mb-2">🔧</p>
          <p className="text-sm text-stone-400">No providers loaded</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Chat Tab
// ════════════════════════════════════════════════════════════

function ChatTab() {
  const [chatId, setChatId] = useState("rainy-afternoon-tea");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const composingRef = useRef(false);

  const load = useCallback(async () => {
    if (!chatId) return;
    try {
      const r = await fetch(`${API}/api/chat/${chatId}`);
      const d = await r.json();
      setMessages(d.messages || []);
    } catch {}
  }, [chatId]);
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  const send = useCallback(async () => {
    if (!reply.trim()) return;
    try {
      await fetch(`${API}/api/chat/${chatId}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply, role: "user" }),
      });
      setReply(""); load();
    } catch {}
  }, [chatId, reply, load]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <div className="flex gap-2 mb-3">
        <input value={chatId} onChange={e => setChatId(e.target.value)}
          placeholder="Room ID" className="inp flex-1 font-mono" />
        <button onClick={load} className="px-4 py-2 text-sm bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-medium transition-colors">Refresh</button>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm flex-1 overflow-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "assistant" ? "" : "flex-row-reverse"}`}>
            <div className={`max-w-[75%] ${m.role === "assistant" ? "" : "text-right"}`}>
              <div className={`inline-block px-3 py-2 rounded-xl text-sm leading-relaxed ${
                m.role === "assistant" ? "bg-stone-100 text-stone-700" : "bg-stone-800 text-white"
              }`}>
                <span className="whitespace-pre-wrap text-left">{m.content}</span>
              </div>
              {m.timestamp && (
                <div className="text-xs text-stone-400 mt-0.5 px-1">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-stone-400">No messages in this room</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        <input value={reply} onChange={e => setReply(e.target.value)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={e => {
            if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") { e.preventDefault(); send(); }
          }}
          placeholder="Simulate a reply..." className="inp flex-1" />
        <button onClick={send} className="px-5 py-2 text-sm bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-medium transition-colors">Send</button>
      </div>
    </div>
  );
}

// ── Shared input components ──

function Inp({ label, value, onChange, mono }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean;
}) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className={`inp ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
