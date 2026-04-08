import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Wifi, WifiOff, RefreshCw, Folder, X, Check, Download, AlertTriangle, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { DocumentType, ModelAssignments } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type SettingsTab = "document-types" | "folders" | "llm" | "about";

// ── Modal state ───────────────────────────────────────────────────────────────

interface ModalState {
  mode: "create" | "edit";
  type?: DocumentType;
}

// ── Shared input styles ───────────────────────────────────────────────────────

const INPUT = "w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-400";
const TEXTAREA = `${INPUT} resize-none font-mono leading-relaxed`;

const PROMPT_MAX = 5000;

// ══════════════════════════════════════════════════════════════════════════════
// Document Types panel
// ══════════════════════════════════════════════════════════════════════════════

function DocumentTypesPanel() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);

  // Form state (controlled)
  const [formName, setFormName]     = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const docTypes = await api.listDocumentTypes();
      setTypes(docTypes);
    } catch {
      toast("Failed to load document types", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openCreate = () => {
    setFormName("");
    setFormPrompt("");
    setModal({ mode: "create" });
  };

  const openEdit = (dt: DocumentType) => {
    setFormName(dt.name);
    setFormPrompt(dt.extraction_prompt);
    setModal({ mode: "edit", type: dt });
  };

  const closeModal = () => { setModal(null); setSaving(false); };

  const handleSave = async () => {
    if (!formName.trim()) { toast("Name is required", "error"); return; }
    if (!formPrompt.trim()) { toast("Extraction prompt is required", "error"); return; }
    if (formPrompt.length > PROMPT_MAX) {
      toast(`Prompt must be under ${PROMPT_MAX} characters`, "error");
      return;
    }
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const created = await api.createDocumentType({
          name: formName.trim(),
          extraction_prompt: formPrompt.trim(),
        });
        setTypes((prev) => [...prev, created]);
        toast("Document type created", "success");
      } else if (modal?.type) {
        const updated = await api.updateDocumentType(modal.type.id, {
          name: formName.trim(),
          extraction_prompt: formPrompt.trim(),
        });
        setTypes((prev) => prev.map((t) => t.id === updated.id ? updated : t));
        toast("Document type updated", "success");
      }
      closeModal();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
      setSaving(false);
    }
  };

  const handleDelete = async (dt: DocumentType) => {
    if (!confirm(`Delete "${dt.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteDocumentType(dt.id);
      setTypes((prev) => prev.filter((t) => t.id !== dt.id));
      toast(`"${dt.name}" deleted`, "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Document Types</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            System types are built-in and cannot be modified. Custom types use your own extraction prompts.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={13} /> Add Custom Type
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {types.map((dt) => {
            const isExpanded = expanded.has(dt.id);
            return (
              <Card key={dt.id}>
                <CardContent className="py-0">
                  {/* Row header */}
                  <div
                    className="flex items-center gap-3 py-3 cursor-pointer select-none"
                    onClick={() => toggle(dt.id)}
                  >
                    <span className="text-zinc-400 shrink-0">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>

                    <span className="text-sm font-medium text-zinc-100 flex-1">{dt.name}</span>

                    <div className="flex items-center gap-2 shrink-0">
                      {dt.is_system && (
                        <Badge variant="info">System</Badge>
                      )}
                    </div>

                    {/* Action buttons — stop propagation so click doesn't toggle expand */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        title={dt.is_system ? "System types cannot be edited" : "Edit"}
                        disabled={dt.is_system}
                        onClick={() => openEdit(dt)}
                      >
                        <Pencil size={13} className={dt.is_system ? "text-zinc-600" : "text-zinc-400"} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={dt.is_system ? "System types cannot be deleted" : "Delete"}
                        disabled={dt.is_system}
                        onClick={() => handleDelete(dt)}
                      >
                        <Trash2 size={13} className={dt.is_system ? "text-zinc-600" : "text-red-400"} />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-zinc-700 py-3 space-y-2">
                      <div>
                        <p className="text-xs text-zinc-500 font-medium mb-1">Extraction prompt:</p>
                        <pre className="text-xs text-zinc-300 bg-zinc-800 rounded p-3 whitespace-pre-wrap leading-relaxed font-mono">
                          {dt.extraction_prompt}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-700 shrink-0">
              <h3 className="text-base font-semibold text-zinc-100">
                {modal.mode === "create" ? "New Custom Document Type" : `Edit: ${modal.type?.name}`}
              </h3>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Name *</label>
                <input
                  className={INPUT}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Meeting Notes"
                  maxLength={100}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-zinc-400">Extraction Prompt *</label>
                  <span className={cn(
                    "text-xs",
                    formPrompt.length > PROMPT_MAX ? "text-red-400" : "text-zinc-500"
                  )}>
                    {formPrompt.length}/{PROMPT_MAX}
                  </span>
                </div>
                <textarea
                  className={TEXTAREA}
                  rows={12}
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder={`Describe what to extract from this document type.\nReturn results as JSON with arrays: actions, risks, deadlines, dependencies, scope_items.`}
                />
                <p className="text-xs text-zinc-600 mt-1">
                  The prompt is sent to the LLM with the document text appended. Return only valid JSON.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-zinc-700 flex justify-end gap-2 shrink-0">
              <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || formPrompt.length > PROMPT_MAX}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LLM Configuration panel
// ══════════════════════════════════════════════════════════════════════════════

const ROLE_LABELS: Record<keyof ModelAssignments, { label: string; description: string }> = {
  extraction: {
    label: "Structured Extraction",
    description: "Used when processing uploaded documents (actions, risks, deadlines)",
  },
  general: {
    label: "General Q&A",
    description: "Used for chat, summaries, and conversational queries",
  },
  reasoning: {
    label: "Deep Reasoning",
    description: "Used for scope analysis, impact assessment, complex queries",
  },
};

const CONTEXT_OPTIONS = [4096, 8192, 16384, 32768] as const;
const DEFAULT_CONTEXTS: Record<keyof ModelAssignments, number> = {
  extraction: 8192,
  general:    8192,
  reasoning:  16384,
};

const SYSTEM_PROMPT_MAX = 2000;

function LlmConfigPanel() {
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [ollamaUrl, setOllamaUrl]             = useState("http://localhost:11434");
  const [ollamaError, setOllamaError]         = useState<string | undefined>();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testing, setTesting]                 = useState(false);

  const [assignments, setAssignments]             = useState<ModelAssignments | null>(null);
  const [draft, setDraft]                         = useState<ModelAssignments | null>(null);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignmentsDirty, setAssignmentsDirty]   = useState(false);

  const [pullingModel, setPullingModel] = useState<string | null>(null);

  useEffect(() => {
    testConnection();
    loadAssignments();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await api.testOllamaConnection();
      setOllamaConnected(result.connected);
      setOllamaUrl(result.ollama_url);
      setOllamaError(result.error);
      setAvailableModels(result.models ?? []);

      // Auto-assign on first run: if configured models aren't installed, use first available
      if (result.connected && result.models?.length) {
        const current = await api.getModelAssignments();
        const available = result.models;
        const extractionInstalled = available.some(
          (m) => m === current.extraction.model ||
                 m.startsWith(current.extraction.model.split(":")[0])
        );
        if (!extractionInstalled) {
          const first = available[0];
          const init: ModelAssignments = {
            extraction: { model: first, context: DEFAULT_CONTEXTS.extraction, system_prompt: current.extraction.system_prompt },
            general:    { model: first, context: DEFAULT_CONTEXTS.general,    system_prompt: current.general.system_prompt },
            reasoning:  { model: first, context: DEFAULT_CONTEXTS.reasoning,  system_prompt: current.reasoning.system_prompt },
          };
          await api.saveModelAssignments(init);
          setAssignments(init);
          setDraft(init);
        }
      }

      if (result.connected) {
        toast(`Connected — ${result.model_count} model(s) available`, "success");
      } else {
        toast("Ollama not reachable", "error");
      }
    } catch {
      setOllamaConnected(false);
      toast("Connection test failed", "error");
    } finally {
      setTesting(false);
    }
  };

  const loadAssignments = async () => {
    try {
      const a = await api.getModelAssignments();
      setAssignments(a);
      setDraft(a);
    } catch {
      toast("Could not load model assignments", "error");
    }
  };

  const updateDraftModel = (role: keyof ModelAssignments, model: string) => {
    setDraft((prev) => prev ? { ...prev, [role]: { ...prev[role], model } } : null);
    setAssignmentsDirty(true);
  };

  const updateDraftContext = (role: keyof ModelAssignments, context: number) => {
    setDraft((prev) => prev ? { ...prev, [role]: { ...prev[role], context } } : null);
    setAssignmentsDirty(true);
  };

  const updateDraftSystemPrompt = (role: keyof ModelAssignments, system_prompt: string) => {
    setDraft((prev) => prev ? { ...prev, [role]: { ...prev[role], system_prompt } } : null);
    setAssignmentsDirty(true);
  };

  const saveAssignments = async () => {
    if (!draft) return;
    setSavingAssignments(true);
    try {
      const saved = await api.saveModelAssignments(draft);
      setAssignments(saved);
      setAssignmentsDirty(false);
      toast("Model assignments saved", "success");
    } catch {
      toast("Failed to save assignments", "error");
    } finally {
      setSavingAssignments(false);
    }
  };

  const pullModel = async (model: string) => {
    setPullingModel(model);
    toast(`Pulling ${model}… this may take several minutes`, "info");
    try {
      const result = await api.pullOllamaModel(model);
      if (result.success) {
        toast(`${model} downloaded successfully`, "success");
        const refreshed = await api.testOllamaConnection();
        setAvailableModels(refreshed.models ?? []);
      } else {
        toast(result.error ?? "Pull failed", "error");
      }
    } catch {
      toast("Pull request failed", "error");
    } finally {
      setPullingModel(null);
    }
  };

  const rolesForModel = (modelName: string): string[] => {
    if (!assignments) return [];
    return (Object.keys(assignments) as (keyof ModelAssignments)[])
      .filter((role) => assignments[role].model === modelName)
      .map((role) => ROLE_LABELS[role].label);
  };

  const isInstalled = (modelName: string) =>
    availableModels.some(
      (m) => m === modelName || m.startsWith(modelName.split(":")[0])
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">LLM Configuration</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          All inference runs locally via Ollama. No data leaves your machine.
        </p>
      </div>

      {/* ── Connection status ── */}
      <Card>
        <CardHeader>
          <CardTitle>Ollama Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {ollamaConnected === null ? (
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-500 animate-pulse" />
              ) : ollamaConnected ? (
                <Wifi size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <WifiOff size={18} className="text-red-400 shrink-0" />
              )}
              <div>
                <p className={cn(
                  "text-sm font-medium",
                  ollamaConnected === null ? "text-zinc-400"
                    : ollamaConnected ? "text-emerald-400"
                    : "text-red-400"
                )}>
                  {ollamaConnected === null ? "Checking…"
                    : ollamaConnected ? "Connected"
                    : "Not reachable"}
                </p>
                <p className="text-xs text-zinc-500 font-mono">{ollamaUrl}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={testConnection} disabled={testing}>
              <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
              {testing ? "Testing…" : "Refresh"}
            </Button>
          </div>

          {ollamaError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">
              {ollamaError}
            </p>
          )}

          {ollamaConnected === false && (
            <div className="text-xs text-zinc-500 bg-zinc-800 rounded px-3 py-2 space-y-1">
              <p className="font-medium text-zinc-400">To start Ollama:</p>
              <code className="block text-zinc-300">ollama serve</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Model assignments ── */}
      <Card>
        <CardHeader>
          <CardTitle>Model Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">
            Assign which installed model handles each role. Changes take effect immediately — no restart needed.
          </p>

          {draft ? (
            <>
              <div className="space-y-4">
                {(Object.keys(ROLE_LABELS) as (keyof ModelAssignments)[]).map((role) => {
                  const roleModel        = draft[role].model;
                  const roleContext      = draft[role].context;
                  const rolePrompt      = draft[role].system_prompt;
                  const broken  = !isInstalled(roleModel) && ollamaConnected === true;
                  const highCtx = roleContext >= 32768;
                  const promptOver = rolePrompt.length > SYSTEM_PROMPT_MAX;

                  return (
                    <div key={role} className="space-y-1.5 pb-4 border-b border-zinc-700 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-zinc-300">
                          {ROLE_LABELS[role].label}
                        </label>
                        {broken && (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <AlertTriangle size={11} /> not installed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600">{ROLE_LABELS[role].description}</p>

                      {/* Model + context side by side */}
                      <div className="flex gap-2">
                        <select
                          value={roleModel}
                          onChange={(e) => updateDraftModel(role, e.target.value)}
                          className={cn(
                            "flex-1 bg-zinc-700 border rounded px-2 py-1.5 text-sm text-zinc-200 cursor-pointer",
                            broken ? "border-amber-700" : "border-zinc-600"
                          )}
                        >
                          {availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                          {!isInstalled(roleModel) && (
                            <option value={roleModel}>{roleModel} (not installed)</option>
                          )}
                          {availableModels.length === 0 && (
                            <option value={roleModel}>{roleModel}</option>
                          )}
                        </select>

                        <div className="flex items-center gap-1 shrink-0">
                          <select
                            value={roleContext}
                            onChange={(e) => updateDraftContext(role, Number(e.target.value))}
                            className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-200 cursor-pointer"
                            title="Context window size (tokens)"
                          >
                            {CONTEXT_OPTIONS.map((n) => (
                              <option key={n} value={n}>{(n / 1024).toFixed(0)}k ctx</option>
                            ))}
                          </select>
                          {highCtx && (
                            <span title="32k context uses significant RAM — may be slow on systems with less than 16 GB">
                              <AlertTriangle size={13} className="text-amber-400" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* System prompt */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-zinc-500">System prompt</label>
                          <span className={cn("text-xs", promptOver ? "text-red-400" : "text-zinc-600")}>
                            {rolePrompt.length}/{SYSTEM_PROMPT_MAX}
                          </span>
                        </div>
                        <textarea
                          value={rolePrompt}
                          onChange={(e) => updateDraftSystemPrompt(role, e.target.value)}
                          rows={3}
                          className={cn(
                            "w-full bg-zinc-800 border rounded px-2 py-1.5 text-xs text-zinc-300 resize-none font-mono leading-relaxed focus:outline-none focus:border-zinc-400",
                            promptOver ? "border-red-700" : "border-zinc-700"
                          )}
                          placeholder="Instructions sent to the model before every request for this role…"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                size="sm"
                onClick={saveAssignments}
                disabled={
                  !assignmentsDirty || savingAssignments ||
                  (Object.keys(ROLE_LABELS) as (keyof ModelAssignments)[]).some(
                    (r) => draft[r].system_prompt.length > SYSTEM_PROMPT_MAX
                  )
                }
                className="w-full justify-center"
              >
                <Save size={13} />
                {savingAssignments ? "Saving…" : "Save Assignments"}
              </Button>
            </>
          ) : (
            <p className="text-xs text-zinc-500">Loading assignments…</p>
          )}
        </CardContent>
      </Card>

      {/* ── Available models ── */}
      <Card>
        <CardHeader>
          <CardTitle>
            Installed Models
            {availableModels.length > 0 && (
              <span className="text-zinc-500 text-sm font-normal ml-1">({availableModels.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {availableModels.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-500">
                {ollamaConnected ? "No models installed." : "Connect to Ollama to see available models."}
              </p>
              {ollamaConnected && (
                <div className="text-xs text-zinc-500 bg-zinc-800 rounded px-3 py-2 space-y-1">
                  <p className="font-medium text-zinc-400">Recommended models:</p>
                  {["mistral-nemo", "llama3.1", "deepseek-r1"].map((m) => (
                    <div key={m} className="flex items-center justify-between">
                      <code className="text-zinc-300">{m}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => pullModel(m)}
                        disabled={pullingModel !== null}
                        className="text-xs h-auto py-0.5 px-2"
                      >
                        {pullingModel === m
                          ? <RefreshCw size={11} className="animate-spin" />
                          : <Download size={11} />}
                        {pullingModel === m ? "Pulling…" : "Pull"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {availableModels.map((m) => {
                const roles = rolesForModel(m);
                const isPulling = pullingModel === m;
                return (
                  <div key={m} className="flex items-center justify-between py-1.5 border-b border-zinc-700 last:border-0 gap-2">
                    <span className="text-sm font-mono text-zinc-200 flex-1 min-w-0 truncate">{m}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {roles.map((r) => (
                        <Badge key={r} variant="success" className="text-xs">{r}</Badge>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        title={`Pull latest ${m}`}
                        onClick={() => pullModel(m)}
                        disabled={pullingModel !== null}
                        className="text-xs h-auto py-0.5 px-2"
                      >
                        {isPulling
                          ? <RefreshCw size={11} className="animate-spin" />
                          : <Download size={11} />}
                        {isPulling ? "Pulling…" : "Update"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Folders panel
// ══════════════════════════════════════════════════════════════════════════════

function FoldersPanel() {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [scanResult, setScanResult] = useState<{ files: number; error?: string } | null>(null);

  useEffect(() => {
    api.getIntakeFolder()
      .then((r) => {
        setCurrentPath(r.path ?? null);
        setInputPath(r.path ?? "");
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!inputPath.trim()) return;
    setSaving(true);
    setScanResult(null);
    try {
      const r = await api.setIntakeFolder(inputPath.trim());
      setCurrentPath(r.path);
      setInputPath(r.path);
      toast("Intake folder saved", "success");
      // Quick scan to show file count
      const scan = await api.scanIntakeFolder();
      setScanResult({ files: scan.files.length, error: scan.error });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save folder", "error");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await api.clearIntakeFolder();
      setCurrentPath(null);
      setInputPath("");
      setScanResult(null);
      toast("Intake folder cleared", "info");
    } catch {
      toast("Could not clear folder", "error");
    } finally {
      setClearing(false);
    }
  };

  const scan = async () => {
    if (!currentPath) return;
    try {
      const result = await api.scanIntakeFolder();
      setScanResult({ files: result.files.length, error: result.error });
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast(`${result.files.length} file(s) in intake folder`, "info");
      }
    } catch {
      toast("Scan failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Folders</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Configure folders for automatic document intake.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Folder size={15} className="text-zinc-400" />
              Intake Folder
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-400">
            Drop files into this folder outside the app. Use{" "}
            <span className="font-medium text-zinc-300">Load from Intake Folder</span>{" "}
            on the Upload screen to queue them for processing.
          </p>

          {/* Path input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 block">Folder path</label>
            <div className="flex gap-2">
              <input
                className={cn(INPUT, "flex-1 font-mono text-xs")}
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="e.g. C:\Users\Alan\ProjectIntakeFolder"
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
              <Button size="sm" onClick={save} disabled={saving || !inputPath.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {/* Current status */}
          {currentPath && (
            <div className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Check size={13} className="text-emerald-400 shrink-0" />
                  <span className="text-xs font-mono text-zinc-300 truncate">{currentPath}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button size="sm" variant="ghost" onClick={scan} className="text-xs px-2 py-1 h-auto">
                    Scan
                  </Button>
                  <button
                    onClick={clear}
                    disabled={clearing}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                    title="Clear intake folder"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              {scanResult && (
                <p className={cn("text-xs", scanResult.error ? "text-red-400" : "text-zinc-500")}>
                  {scanResult.error
                    ? `Error: ${scanResult.error}`
                    : `${scanResult.files} supported file(s) ready to load`}
                </p>
              )}
            </div>
          )}

          <div className="text-xs text-zinc-600 space-y-1 pt-1">
            <p>Supported: PDF · DOCX · XLSX · TXT · MD</p>
            <p>After processing, files are moved to the uploads folder automatically.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// About panel
// ══════════════════════════════════════════════════════════════════════════════

function AboutPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-100">About</h2>
      <Card>
        <CardContent className="py-4 space-y-3 text-sm text-zinc-400">
          <p>
            <span className="font-semibold text-zinc-200">Project Intel V2</span> — a self-hosted,
            GDPR-compliant AI project management assistant.
          </p>
          <p>All data stays on your machine. No cloud APIs. No tracking.</p>
          <div className="pt-2 space-y-1 text-xs font-mono text-zinc-500">
            <p>Backend: FastAPI + SQLite</p>
            <p>Frontend: Tauri + React + TypeScript</p>
            <p>LLM: Ollama (local inference)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Settings page
// ══════════════════════════════════════════════════════════════════════════════

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "document-types", label: "Document Types" },
  { id: "folders",        label: "Folders" },
  { id: "llm",            label: "LLM Configuration" },
  { id: "about",          label: "About" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("document-types");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-700 pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t transition-colors cursor-pointer -mb-px border-b-2",
              tab === t.id
                ? "text-zinc-100 border-blue-500"
                : "text-zinc-400 border-transparent hover:text-zinc-200 hover:border-zinc-500"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div>
        {tab === "document-types" && <DocumentTypesPanel />}
        {tab === "folders"        && <FoldersPanel />}
        {tab === "llm"            && <LlmConfigPanel />}
        {tab === "about"          && <AboutPanel />}
      </div>
    </div>
  );
}
