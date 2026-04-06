import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Wifi, WifiOff, RefreshCw, Folder, X, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { DocumentType } from "@/types";
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
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Form state (controlled)
  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formModel, setFormModel] = useState("mistral-nemo");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [docTypes, modelsResp] = await Promise.allSettled([
        api.listDocumentTypes(),
        api.listOllamaModels(),
      ]);
      if (docTypes.status === "fulfilled") setTypes(docTypes.value);
      if (modelsResp.status === "fulfilled") setAvailableModels(modelsResp.value.models);
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
    setFormModel(availableModels[0] ?? "mistral-nemo");
    setModal({ mode: "create" });
  };

  const openEdit = (dt: DocumentType) => {
    setFormName(dt.name);
    setFormPrompt(dt.extraction_prompt);
    setFormModel(dt.target_model);
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
          target_model: formModel,
        });
        setTypes((prev) => [...prev, created]);
        toast("Document type created", "success");
      } else if (modal?.type) {
        const updated = await api.updateDocumentType(modal.type.id, {
          name: formName.trim(),
          extraction_prompt: formPrompt.trim(),
          target_model: formModel,
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

  // Model options: available from Ollama + known fallbacks deduplicated
  const FALLBACK_MODELS = ["mistral-nemo", "llama3.1", "deepseek-r1"];
  const modelOptions = Array.from(new Set([...availableModels, ...FALLBACK_MODELS]));

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
                      <Badge variant="outline" className="font-mono text-xs">
                        {dt.target_model}
                      </Badge>
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
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-medium">Target model:</span>
                        <span className="font-mono text-zinc-300">{dt.target_model}</span>
                      </div>
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
                <label className="text-xs font-medium text-zinc-400 block mb-1">Target Model</label>
                <select
                  className={cn(INPUT, "cursor-pointer")}
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
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

function LlmConfigPanel() {
  const [status, setStatus] = useState<{
    connected: boolean | null;
    url: string;
    models: string[];
    error?: string;
  }>({ connected: null, url: "http://localhost:11434", models: [] });
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const result = await api.testOllamaConnection();
      setStatus({
        connected: result.connected,
        url: result.ollama_url,
        models: result.models ?? [],
        error: result.error,
      });
      if (result.connected) {
        toast(`Connected — ${result.model_count} model(s) available`, "success");
      } else {
        toast("Ollama not reachable", "error");
      }
    } catch {
      toast("Connection test failed", "error");
    } finally {
      setTesting(false);
    }
  };

  // Run on mount
  useEffect(() => { test(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">LLM Configuration</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          All inference runs locally via Ollama. No data leaves your machine.
        </p>
      </div>

      {/* Connection status */}
      <Card>
        <CardHeader>
          <CardTitle>Ollama Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status.connected === null ? (
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-500 animate-pulse" />
              ) : status.connected ? (
                <Wifi size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <WifiOff size={18} className="text-red-400 shrink-0" />
              )}
              <div>
                <p className={cn(
                  "text-sm font-medium",
                  status.connected === null ? "text-zinc-400"
                    : status.connected ? "text-emerald-400"
                    : "text-red-400"
                )}>
                  {status.connected === null ? "Checking…"
                    : status.connected ? "Connected"
                    : "Not reachable"}
                </p>
                <p className="text-xs text-zinc-500 font-mono">{status.url}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={test} disabled={testing}>
              <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          </div>

          {status.error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">
              {status.error}
            </p>
          )}

          {!status.connected && status.connected !== null && (
            <div className="text-xs text-zinc-500 bg-zinc-800 rounded px-3 py-2 space-y-1">
              <p className="font-medium text-zinc-400">To start Ollama:</p>
              <code className="block text-zinc-300">ollama serve</code>
              <p className="pt-1 font-medium text-zinc-400">Required models:</p>
              <code className="block text-zinc-300">ollama pull mistral-nemo</code>
              <code className="block text-zinc-300">ollama pull llama3.1</code>
              <code className="block text-zinc-300">ollama pull deepseek-r1</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available models */}
      {status.connected && status.models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Models ({status.models.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {status.models.map((m) => {
                const isConfigured = ["mistral-nemo", "llama3.1", "deepseek-r1"].some(
                  (known) => m.startsWith(known)
                );
                return (
                  <div key={m} className="flex items-center justify-between py-1.5 border-b border-zinc-700 last:border-0">
                    <span className="text-sm font-mono text-zinc-200">{m}</span>
                    {isConfigured && (
                      <Badge variant="success">In use</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Model strategy reference */}
      <Card>
        <CardHeader>
          <CardTitle>Model Strategy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { model: "mistral-nemo", role: "Fast structured extraction (actions, risks, deadlines)" },
              { model: "llama3.1",     role: "General Q&A, summaries, project plan analysis" },
              { model: "deepseek-r1",  role: "Deep reasoning, financial analysis, scope impact" },
            ].map(({ model, role }) => (
              <div key={model} className="flex items-start gap-3">
                <code className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 shrink-0 mt-0.5">
                  {model}
                </code>
                <span className="text-zinc-400">{role}</span>
              </div>
            ))}
          </div>
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
