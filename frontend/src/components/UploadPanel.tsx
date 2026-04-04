import { useCallback, useRef, useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { UploadResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DOC_TYPES = [
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "email",         label: "Email" },
  { value: "plan",          label: "Project Plan" },
  { value: "raid",          label: "RAID Log" },
  { value: "other",         label: "Other" },
];

const ACCEPTED = ".pdf,.docx,.txt,.md,.eml,.msg";

interface UploadEntry {
  file: File;
  docType: string;
  status: "pending" | "uploading" | "done" | "error";
  result?: UploadResult;
  error?: string;
}

export function UploadPanel() {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const newEntries: UploadEntry[] = Array.from(files).map((f) => ({
      file: f,
      docType: guessDocType(f.name),
      status: "pending",
    }));
    setEntries((prev) => [...prev, ...newEntries]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, []);

  const uploadEntry = async (idx: number) => {
    const entry = entries[idx];
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, status: "uploading" } : e));
    try {
      const result = await api.uploadDocument(entry.file, entry.docType);
      setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, status: "done", result } : e));
      toast(`Processed ${entry.file.name} — ${result.summary}`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, status: "error", error: msg } : e));
      toast(`Failed: ${entry.file.name} — ${msg}`, "error");
    }
  };

  const uploadAll = async () => {
    const pending = entries.map((_, i) => i).filter((i) => entries[i].status === "pending");
    for (const idx of pending) await uploadEntry(idx);
  };

  const removeEntry = (idx: number) =>
    setEntries((prev) => prev.filter((_, i) => i !== idx));

  const hasPending = entries.some((e) => e.status === "pending");

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold text-zinc-100">Upload Document</h2>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors",
          dragging ? "border-blue-500 bg-blue-950/30" : "border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800/50"
        )}
      >
        <Upload size={32} className="text-zinc-400" />
        <p className="text-sm text-zinc-300 font-medium">Drop files here or click to browse</p>
        <p className="text-xs text-zinc-500">PDF, DOCX, TXT, MD, EML — max 20 MB</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Queue */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <Card key={idx}>
              <CardContent className="flex items-center gap-3 py-3">
                <FileText size={16} className="text-zinc-400 shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100 truncate">{entry.file.name}</p>
                  <p className="text-xs text-zinc-500">
                    {(entry.file.size / 1024).toFixed(0)} KB
                  </p>
                  {entry.result && (
                    <p className="text-xs text-emerald-400 mt-1">{entry.result.summary}</p>
                  )}
                  {entry.result?.warning && (
                    <p className="text-xs text-amber-400 mt-1">{entry.result.warning}</p>
                  )}
                  {entry.error && (
                    <p className="text-xs text-red-400 mt-1">{entry.error}</p>
                  )}
                </div>

                {/* Doc type picker — only for pending */}
                {entry.status === "pending" && (
                  <select
                    value={entry.docType}
                    onChange={(e) =>
                      setEntries((prev) =>
                        prev.map((en, i) => i === idx ? { ...en, docType: e.target.value } : en)
                      )
                    }
                    className="bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded px-2 py-1"
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                )}

                {/* Status */}
                {entry.status === "uploading" && (
                  <Badge variant="info">Processing…</Badge>
                )}
                {entry.status === "done" && (
                  <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                )}
                {entry.status === "error" && (
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                )}

                {/* Actions */}
                {entry.status === "pending" && (
                  <Button size="sm" onClick={() => uploadEntry(idx)}>Upload</Button>
                )}
                {(entry.status === "done" || entry.status === "error") && (
                  <Button size="sm" variant="ghost" onClick={() => removeEntry(idx)}>
                    Dismiss
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          {hasPending && (
            <Button onClick={uploadAll} className="w-full justify-center">
              Upload All ({entries.filter((e) => e.status === "pending").length} files)
            </Button>
          )}
        </div>
      )}

      {/* Extraction counts legend */}
      {entries.some((e) => e.status === "done") && (
        <Card>
          <CardHeader><CardTitle>Extraction Results</CardTitle></CardHeader>
          <CardContent>
            {entries.filter((e) => e.status === "done" && e.result).map((e, idx) => (
              <div key={idx} className="mb-3 last:mb-0">
                <p className="text-xs font-medium text-zinc-300 mb-1">{e.file.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(e.result!.counts).map(([k, v]) =>
                    v > 0 ? (
                      <Badge key={k} variant="outline">
                        {v} {k.replace("_", " ")}
                      </Badge>
                    ) : null
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function guessDocType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("meeting") || lower.includes("minutes") || lower.includes("notes")) return "meeting_notes";
  if (lower.includes("email") || lower.endsWith(".eml") || lower.endsWith(".msg")) return "email";
  if (lower.includes("plan") || lower.includes("roadmap")) return "plan";
  if (lower.includes("raid") || lower.includes("risk")) return "raid";
  return "other";
}
