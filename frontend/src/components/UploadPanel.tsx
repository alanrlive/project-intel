import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2, X,
  ChevronRight, RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import type { BatchUploadResult, DocumentType } from "@/types";
import type { View } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_EXT = [".pdf", ".docx", ".xlsx", ".txt", ".md"];
const ACCEPTED_ATTR = ACCEPTED_EXT.join(",");

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = "queued" | "processing" | "success" | "error";

interface QueueEntry {
  id: string;          // stable key (random)
  file: File;
  typeId: number;
  status: FileStatus;
  result?: BatchUploadResult;
  error?: string;
}

interface Props {
  onNavigate?: (view: View) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessTypeId(filename: string, types: DocumentType[], generalId: number): number {
  const lower = filename.toLowerCase();
  const find = (keywords: string[]) =>
    keywords.some((k) => lower.includes(k));

  if (find(["raid", "risk", "assumption", "issue", "dependency"])) {
    return types.find((t) => t.name === "RAID Log")?.id ?? generalId;
  }
  if (find(["plan", "roadmap", "schedule", "gantt"])) {
    return types.find((t) => t.name === "Project Plan")?.id ?? generalId;
  }
  if (find(["task", "action", "todo", "backlog"])) {
    return types.find((t) => t.name === "Task List")?.id ?? generalId;
  }
  if (find(["budget", "finance", "cost", "invoice", "spend"])) {
    return types.find((t) => t.name === "Financial Data")?.id ?? generalId;
  }
  return generalId;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "queued")     return <span className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />;
  if (status === "processing") return <Loader2 size={16} className="text-blue-400 animate-spin shrink-0" />;
  if (status === "success")    return <CheckCircle size={16} className="text-emerald-400 shrink-0" />;
  return <AlertCircle size={16} className="text-red-400 shrink-0" />;
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════

export function UploadPanel({ onNavigate }: Props) {
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [generalId, setGeneralId] = useState<number>(0);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load document types once
  useEffect(() => {
    api.listDocumentTypes()
      .then((types) => {
        setDocTypes(types);
        const general = types.find((t) => t.name === "General");
        if (general) setGeneralId(general.id);
      })
      .catch(() => toast("Could not load document types", "error"));
  }, []);

  // ── File ingestion ──────────────────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: QueueEntry[] = Array.from(files)
      .filter((f) => ACCEPTED_EXT.some((ext) => f.name.toLowerCase().endsWith(ext)))
      .map((f) => ({
        id: uid(),
        file: f,
        typeId: guessTypeId(f.name, docTypes, generalId),
        status: "queued" as FileStatus,
      }));

    if (!next.length) {
      toast("No supported files found (PDF, DOCX, XLSX, TXT, MD)", "error");
      return;
    }
    setEntries((prev) => [...prev, ...next]);
    setDone(false);
  }, [docTypes, generalId]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear the highlight when leaving the drop zone itself, not its children.
    // relatedTarget is where the cursor went — if it's still inside the zone, ignore.
    const zone = e.currentTarget as HTMLElement;
    if (!zone.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeEntry = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const setType = (id: string, typeId: number) =>
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, typeId } : e));

  // ── Processing ──────────────────────────────────────────────────────────────

  const processAll = async () => {
    setProcessing(true);
    const queued = entries.filter((e) => e.status === "queued");

    // Mark all as processing immediately so the UI shows spinners
    setEntries((prev) => prev.map((e) =>
      e.status === "queued" ? { ...e, status: "processing" } : e
    ));

    try {
      const results = await api.uploadBatch(
        queued.map((e) => e.file),
        queued.map((e) => e.typeId),
      );

      // Map results back to entries by index (guaranteed same order)
      setEntries((prev) => {
        const updated = [...prev];
        let ri = 0;
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].status === "processing") {
            const res = results[ri++];
            updated[i] = {
              ...updated[i],
              status: res.success ? "success" : "error",
              result: res,
              error: res.error,
            };
          }
        }
        return updated;
      });
    } catch (err) {
      // Whole-batch failure (network error, server crash)
      const msg = err instanceof Error ? err.message : "Batch upload failed";
      toast(msg, "error");
      setEntries((prev) => prev.map((e) =>
        e.status === "processing" ? { ...e, status: "error", error: msg } : e
      ));
    }

    setProcessing(false);
    setDone(true);
  };

  // ── Derived state ───────────────────────────────────────────────────────────

  const queued      = entries.filter((e) => e.status === "queued");
  const succeeded   = entries.filter((e) => e.status === "success");
  const failed      = entries.filter((e) => e.status === "error");
  const inFlight    = entries.find((e) => e.status === "processing");
  const processedN  = succeeded.length + failed.length;
  const totalN      = entries.length;
  const canProcess  = queued.length > 0 && !processing;

  const totalCounts = succeeded.reduce(
    (acc, e) => {
      if (!e.result?.extracted) return acc;
      for (const [k, v] of Object.entries(e.result.extracted)) {
        acc[k] = (acc[k] ?? 0) + v;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const resetQueue = () => {
    setEntries([]);
    setDone(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Upload Documents</h2>
          {queued.length > 0 && !processing && !done && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {queued.length} {queued.length === 1 ? "file" : "files"} ready to process
            </p>
          )}
          {processing && (
            <p className="text-xs text-blue-400 mt-0.5">
              Processing {processedN + 1} of {totalN}…
            </p>
          )}
        </div>
        {done && (
          <Button size="sm" variant="ghost" onClick={resetQueue}>
            <RotateCcw size={13} /> Upload More
          </Button>
        )}
      </div>

      {/* Drop zone — hidden while actively processing */}
      {!processing && (
        <div
          onDrop={onDrop}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3",
            "cursor-pointer transition-all duration-150 select-none",
            dragging
              ? "border-blue-500 bg-blue-950/30 scale-[1.01]"
              : "border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800/40"
          )}
        >
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            dragging ? "bg-blue-900/60" : "bg-zinc-800"
          )}>
            <Upload size={22} className={dragging ? "text-blue-400" : "text-zinc-400"} />
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-200 font-medium">
              {dragging ? "Release to add files" : "Drop files here or click to browse"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              PDF · DOCX · XLSX · TXT · MD
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_ATTR}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>
      )}

      {/* Queue list */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isQueued = entry.status === "queued";
            const isCurrent = entry.id === inFlight?.id;

            return (
              <Card
                key={entry.id}
                className={cn(
                  "transition-all",
                  isCurrent && "border-blue-700 bg-blue-950/20",
                  entry.status === "success" && "border-emerald-800/50",
                  entry.status === "error" && "border-red-800/50",
                )}
              >
                <CardContent className="py-3 flex items-center gap-3">
                  <StatusIcon status={entry.status} />

                  <FileText size={14} className="text-zinc-500 shrink-0" />

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-100 truncate">{entry.file.name}</p>
                    <p className="text-xs text-zinc-500">{formatSize(entry.file.size)}</p>
                    {entry.result?.extracted && entry.status === "success" && (
                      <p className="text-xs text-emerald-400 mt-0.5 leading-snug">
                        {Object.entries(entry.result.extracted)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${v} ${k.replace("_", " ")}`)
                          .join(", ") || "No items extracted"}
                      </p>
                    )}
                    {entry.result?.warning && (
                      <p className="text-xs text-amber-400 mt-0.5">{entry.result.warning}</p>
                    )}
                    {entry.error && (
                      <p className="text-xs text-red-400 mt-0.5">{entry.error}</p>
                    )}
                  </div>

                  {/* Document type selector */}
                  {isQueued && docTypes.length > 0 && (
                    <select
                      value={entry.typeId}
                      onChange={(e) => setType(entry.id, Number(e.target.value))}
                      className="bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded px-2 py-1 shrink-0"
                    >
                      {docTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}

                  {/* Status badge for non-queued */}
                  {entry.status === "processing" && (
                    <Badge variant="info">Processing…</Badge>
                  )}
                  {entry.status === "success" && (
                    <Badge variant="success">Done</Badge>
                  )}
                  {entry.status === "error" && (
                    <Badge variant="urgent">Error</Badge>
                  )}

                  {/* Remove button — only while queued and not processing */}
                  {isQueued && !processing && (
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Process All button */}
      {canProcess && (
        <Button onClick={processAll} className="w-full justify-center" size="sm">
          Process All Documents
          <Badge variant="outline" className="ml-2 text-xs">
            {queued.length}
          </Badge>
        </Button>
      )}

      {/* Summary card */}
      {done && (
        <Card className={cn(
          "border",
          failed.length === 0 ? "border-emerald-800/60" : "border-amber-700/50"
        )}>
          <CardHeader>
            <CardTitle>Processing Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Counts */}
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-400" />
                <span className="text-zinc-300">
                  <span className="font-semibold text-emerald-400">{succeeded.length}</span> succeeded
                </span>
              </div>
              {failed.length > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-400" />
                  <span className="text-zinc-300">
                    <span className="font-semibold text-red-400">{failed.length}</span> failed
                  </span>
                </div>
              )}
            </div>

            {/* Extraction totals */}
            {Object.keys(totalCounts).length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Items extracted across all documents:</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(totalCounts)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <Badge key={k} variant="outline">
                        {v} {k.replace("_", " ")}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {/* Per-file errors */}
            {failed.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-500 font-medium">Errors:</p>
                {failed.map((e) => (
                  <p key={e.id} className="text-xs text-red-400">
                    <span className="font-medium">{e.file.name}:</span> {e.error}
                  </p>
                ))}
              </div>
            )}

            {/* Navigation shortcuts */}
            {succeeded.length > 0 && onNavigate && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">View extracted items:</p>
                <div className="flex flex-wrap gap-2">
                  {(["actions", "risks", "deadlines", "dependencies"] as View[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => onNavigate(v)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                      <ChevronRight size={11} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
