import { useState, useEffect, useCallback } from "react";

const API = "";

interface ToolDef {
  name: string;
  description: string;
  provider: string;
}

interface WorkflowConfig {
  maxTurns?: number;
  timeoutSeconds?: number;
  model?: string | null;
  fallbacks?: { provider: string; model: string }[];
  preloadSkills?: string[];
}

interface AvailableModel {
  id: string;       // "zai/glm-5.1"
  name: string;
  provider: string; // "zai"
  providerName: string;
  active: boolean;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  mode: string;
  status: string;
  goal: string;
  rules: string[];
  tools: string[];
  config: WorkflowConfig;
  inputSchema?: any;
  _isNew?: boolean;
}

const EMPTY_WF: Workflow = {
  id: "",
  name: "New Workflow",
  description: "",
  icon: "📋",
  mode: "agentic",
  status: "draft",
  goal: "",
  rules: [],
  tools: ["finish"],
  config: { maxTurns: 50, timeoutSeconds: 3600, model: null, fallbacks: [], preloadSkills: [] },
};

export default function WorkflowEditor({ workflowId, onBack }: {
  workflowId?: string;
  onBack: () => void;
}) {
  const [wf, setWf] = useState<Workflow>(EMPTY_WF);
  const [availableTools, setAvailableTools] = useState<ToolDef[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newRule, setNewRule] = useState("");

  const loadTools = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/tools`);
      const d = await r.json();
      setAvailableTools(d.tools || []);
    } catch {}
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/models`);
      const d = await r.json();
      setAvailableModels(d.models || []);
    } catch {}
  }, []);

  const loadWf = useCallback(async () => {
    if (!workflowId) { setWf({ ...EMPTY_WF, _isNew: true }); return; }
    try {
      const r = await fetch(`${API}/api/workflows/${workflowId}`);
      const d = await r.json();
      setWf(d);
    } catch {}
  }, [workflowId]);

  useEffect(() => { loadTools(); loadModels(); loadWf(); }, [loadTools, loadModels, loadWf]);

  const save = useCallback(async () => {
    setSaving(true); setSaved(false);
    try {
      const method = wf._isNew ? "POST" : "PUT";
      const url = wf._isNew ? `${API}/api/workflows` : `${API}/api/workflows/${wf.id}`;
      const body = wf._isNew ? { ...wf } : { ...wf };
      delete body._isNew;

      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); setSaving(false); return; }
      if (d.workflow) setWf(d.workflow);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert(String(err)); }
    setSaving(false);
  }, [wf]);

  const deleteWf = useCallback(async () => {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    try {
      await fetch(`${API}/api/workflows/${wf.id}`, { method: "DELETE" });
      onBack();
    } catch {}
  }, [wf, onBack]);

  const toggleTool = useCallback((name: string) => {
    setWf(w => {
      const has = w.tools.includes(name);
      const tools = has ? w.tools.filter(t => t !== name) : [...w.tools, name];
      // finish is always included
      if (!tools.includes("finish")) tools.push("finish");
      return { ...w, tools };
    });
  }, []);

  const addRule = useCallback(() => {
    if (!newRule.trim()) return;
    setWf(w => ({ ...w, rules: [...w.rules, newRule.trim()] }));
    setNewRule("");
  }, [newRule]);

  const removeRule = useCallback((idx: number) => {
    setWf(w => ({ ...w, rules: w.rules.filter((_, i) => i !== idx) }));
  }, []);

  const toolsByProvider = availableTools.reduce((acc, t) => {
    if (!acc[t.provider]) acc[t.provider] = [];
    acc[t.provider].push(t);
    return acc;
  }, {} as Record<string, ToolDef[]>);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xl">{wf.icon}</span>
        <h2 className="text-base font-bold text-stone-800">
          {wf._isNew ? "New Workflow" : "Edit Workflow"}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>}
          {!wf._isNew && (
            <button onClick={deleteWf}
              className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              Delete
            </button>
          )}
          <button onClick={save} disabled={saving || !wf.name || !wf.id}
            className="px-4 py-1.5 text-sm bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-medium transition-colors disabled:opacity-40">
            {saving ? "Saving..." : "💾 Save"}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <Section title="Basic Info">
        <div className="grid grid-cols-4 gap-3">
          <Field label="Icon">
            <input value={wf.icon} onChange={e => setWf({ ...wf, icon: e.target.value })}
              className="inp text-center text-lg" />
          </Field>
          <div className="col-span-3">
            <Field label="Name">
              <input value={wf.name} onChange={e => setWf({ ...wf, name: e.target.value })}
                className="inp" />
            </Field>
          </div>
        </div>
        <Field label="ID (URL key)">
          <input value={wf.id} disabled={!wf._isNew}
            onChange={e => setWf({ ...wf, id: e.target.value })}
            placeholder="afternoon-tea"
            className={`inp font-mono ${wf._isNew ? "" : "opacity-50 bg-stone-100"}`} />
        </Field>
        <Field label="Description">
          <textarea value={wf.description} onChange={e => setWf({ ...wf, description: e.target.value })}
            rows={2} className="inp resize-y" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select value={wf.status} onChange={e => setWf({ ...wf, status: e.target.value })}
              className="inp">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Mode">
            <select value={wf.mode} onChange={e => setWf({ ...wf, mode: e.target.value })}
              className="inp">
              <option value="agentic">Agentic (AI-driven)</option>
              <option value="deterministic">Deterministic</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Goal */}
      <Section title="Goal" desc="What the agent should accomplish. Be specific — the AI reads this.">
        <textarea value={wf.goal} onChange={e => setWf({ ...wf, goal: e.target.value })}
          placeholder="e.g. Help the team order afternoon tea: send the menu, collect orders, remind stragglers, summarize."
          rows={3}
          className="inp resize-y" />
      </Section>

      {/* Rules */}
      <Section title="Rules" desc="Constraints and guidelines the agent must follow.">
        <div className="space-y-2">
          {wf.rules.map((rule, i) => (
            <div key={i} className="flex items-start gap-2 group">
              <span className="text-xs font-mono text-stone-400 mt-2 shrink-0 w-5">{i + 1}.</span>
              <p className="flex-1 text-sm text-stone-600 leading-relaxed py-1.5 px-2.5 bg-stone-50 rounded-lg">
                {rule}
              </p>
              <button onClick={() => removeRule(i)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-stone-300 hover:text-red-400 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={newRule}
            onChange={e => setNewRule(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }}
            placeholder="Add a rule..."
            className="inp flex-1" />
          <button onClick={addRule}
            className="px-3 py-2 text-sm bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-600 font-medium transition-colors">
            Add
          </button>
        </div>
      </Section>

      {/* Tools */}
      <Section title="Tools" desc="Which tools the agent can use. Finish is always included.">
        <div className="space-y-3">
          {Object.entries(toolsByProvider).map(([provider, tools]) => (
            <div key={provider}>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1.5">{provider}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {tools.map(t => {
                  const active = wf.tools.includes(t.name);
                  return (
                    <button key={t.name} onClick={() => toggleTool(t.name)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                        active
                          ? "bg-stone-800 text-white"
                          : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                      }`}>
                      <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                        active ? "bg-white border-white" : "border-stone-300 bg-white"
                      }`}>
                        {active && (
                          <svg className="w-2.5 h-2.5 text-stone-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-xs font-mono font-medium truncate ${active ? "text-white" : "text-stone-700"}`}>
                          {t.name}
                        </div>
                        <div className={`text-xs truncate ${active ? "text-stone-300" : "text-stone-400"}`}>
                          {t.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Advanced Config */}
      <Section title="Advanced" desc="Execution limits and model override.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max Turns">
            <input type="number" value={wf.config?.maxTurns ?? 50}
              onChange={e => setWf({ ...wf, config: { ...wf.config, maxTurns: parseInt(e.target.value) || 50 } })}
              className="inp" />
          </Field>
          <Field label="Timeout (seconds)">
            <input type="number" value={wf.config?.timeoutSeconds ?? 3600}
              onChange={e => setWf({ ...wf, config: { ...wf.config, timeoutSeconds: parseInt(e.target.value) || 3600 } })}
              className="inp" />
          </Field>
        </div>
        {/* Model Selector */}
        <div>
          <label className="lbl">Primary Model</label>
          <select
            value={wf.config?.model || ""}
            onChange={e => setWf({ ...wf, config: { ...wf.config, model: e.target.value || null } })}
            className="inp"
          >
            <option value="">Default (from platform config)</option>
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.providerName}
              </option>
            ))}
          </select>
        </div>

        {/* Fallback Models */}
        <div>
          <label className="lbl">Fallback Models</label>
          <p className="text-xs text-stone-400 mb-2">If primary fails, tries these in order.</p>
          <div className="space-y-1.5">
            {(wf.config?.fallbacks || []).map((fb, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <span className="text-xs font-mono text-stone-400 shrink-0 w-5">{i + 1}.</span>
                <div className="flex-1 px-2.5 py-1.5 bg-stone-50 rounded-lg text-sm text-stone-600">
                  <code className="text-xs text-stone-700">{fb.model}</code>
                  <span className="text-xs text-stone-400 ml-2">via {fb.provider}</span>
                </div>
                <button onClick={() => {
                  const fbs = [...(wf.config?.fallbacks || [])];
                  fbs.splice(i, 1);
                  setWf({ ...wf, config: { ...wf.config, fallbacks: fbs } });
                }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-stone-300 hover:text-red-400 shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {(wf.config?.fallbacks || []).length === 0 && (
              <p className="text-xs text-stone-400 italic px-2.5 py-1">No fallbacks set — uses platform defaults</p>
            )}
          </div>
          {/* Add fallback */}
          <div className="flex gap-2 mt-2">
            <select id="fallback-select" className="inp flex-1" defaultValue="">
              <option value="" disabled>Add a fallback model...</option>
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {m.providerName}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById("fallback-select") as HTMLSelectElement;
                if (!sel?.value) return;
                const [provider, ...modelParts] = sel.value.split("/");
                const model = modelParts.join("/");
                const fbs = [...(wf.config?.fallbacks || []), { provider, model }];
                setWf({ ...wf, config: { ...wf.config, fallbacks: fbs } });
                sel.value = "";
              }}
              className="px-3 py-2 text-sm bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-600 font-medium transition-colors"
            >Add</button>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── Reusable components ──

function Section({ title, desc, children }: {
  title: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-stone-800 mb-1">{title}</h3>
      {desc && <p className="text-xs text-stone-400 mb-3">{desc}</p>}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
