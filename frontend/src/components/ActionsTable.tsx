import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, CheckCircle, Download, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Action, Document, RaidItemHistory } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { dueDateLabel } from "@/lib/utils";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";
import {
  SortTh, SortDir, nextDir, applySort,
  exportCsv, csvDate, downloadDocumentFile,
} from "@/lib/tableUtils";

const STATUS_BADGE: Record<string, "default" | "info" | "success" | "urgent" | "outline"> = {
  open:        "default",
  in_progress: "info",
  done:        "success",
  blocked:     "urgent",
};

const PRIORITY_BADGE: Record<string, "urgent" | "warning" | "outline"> = {
  high:   "urgent",
  medium: "warning",
  low:    "outline",
};

const PRIORITY_ORD: Record<string, number> = { high: 2, medium: 1, low: 0 };
const STATUS_ORD: Record<string, number>   = { blocked: 3, open: 2, in_progress: 1, done: 0 };

type SortField = "due_date" | "status" | "priority" | "owner";

function sortValue(a: Action, field: SortField): string | number {
  switch (field) {
    case "due_date":  return a.due_date ?? "9999-99-99";
    case "priority":  return PRIORITY_ORD[a.priority] ?? 1;
    case "status":    return STATUS_ORD[a.status] ?? 0;
    case "owner":     return a.owner?.toLowerCase() ?? "";
  }
}

function fmtHistDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function docName(docs: Map<number, Document>, id: number | null): string {
  if (!id) return "";
  const name = docs.get(id)?.filename ?? "";
  return name.length > 22 ? name.slice(0, 21) + "…" : name;
}

export function ActionsTable() {
  const [actions, setActions]         = useState<Action[]>([]);
  const [docs, setDocs]               = useState<Map<number, Document>>(new Map());
  const [history, setHistory]         = useState<Map<number, RaidItemHistory[]>>(new Map());
  const [expanded, setExpanded]       = useState<Set<number>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter]   = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage]               = useState(0);
  const [sortField, setSortField]     = useState<SortField | null>(null);
  const [sortDir, setSortDir]         = useState<SortDir>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [newDesc, setNewDesc]         = useState("");
  const [newOwner, setNewOwner]       = useState("");
  const [newDue, setNewDue]           = useState("");
  const [newPriority, setNewPriority] = useState<Action["priority"]>("medium");

  const load = async () => {
    setLoading(true);
    try {
      const [data, docList] = await Promise.all([
        api.listActions({
          ...(statusFilter && { status: statusFilter }),
          ...(priorityFilter && { priority: priorityFilter }),
        }),
        api.listDocuments(),
      ]);
      setActions(data);
      setDocs(new Map(docList.map((d) => [d.id, d])));
      const histEntries = await Promise.all(
        data.map(async (a) => {
          const h = await api.getHistory("actions", a.id).catch(() => []);
          return [a.id, h] as [number, RaidItemHistory[]];
        })
      );
      setHistory(new Map(histEntries));
    } catch { toast("Failed to load actions", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setPage(0); }, [statusFilter, priorityFilter]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onSort = (field: string) => {
    const f = field as SortField;
    if (f === sortField) {
      const next = nextDir(sortDir);
      setSortDir(next);
      if (next === null) setSortField(null);
    } else {
      setSortField(f);
      setSortDir("asc");
    }
    setPage(0);
  };

  const sorted = useMemo(
    () => applySort(actions, sortField, sortDir, (a, f) => sortValue(a, f as SortField)),
    [actions, sortField, sortDir],
  );

  const markDone = async (id: number) => {
    try {
      await api.updateAction(id, { status: "done" });
      setActions((prev) => prev.map((a) => a.id === id ? { ...a, status: "done" } : a));
      toast("Marked as done", "success");
    } catch { toast("Update failed", "error"); }
  };

  const deleteAction = async (id: number) => {
    try {
      await api.deleteAction(id);
      setActions((prev) => prev.filter((a) => a.id !== id));
      toast("Action deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const addAction = async () => {
    if (!newDesc.trim()) return;
    try {
      const a = await api.createAction({
        description: newDesc,
        owner: newOwner || undefined,
        due_date: newDue || undefined,
        priority: newPriority,
      });
      setActions((prev) => [a, ...prev]);
      setNewDesc(""); setNewOwner(""); setNewDue(""); setShowAdd(false);
      toast("Action created", "success");
    } catch { toast("Create failed", "error"); }
  };

  const handleExport = () => {
    const rows = sorted.map((a) => ({
      reference_id: a.reference_id ?? "",
      description:  a.description,
      owner:        a.owner ?? "",
      due_date:     a.due_date ?? "",
      priority:     a.priority,
      status:       a.status,
      source_doc:   a.created_from_doc_id ? (docs.get(a.created_from_doc_id)?.filename ?? "") : "",
    }));
    exportCsv(rows, [
      { key: "reference_id", label: "Ref ID" },
      { key: "description",  label: "Description" },
      { key: "owner",        label: "Owner" },
      { key: "due_date",     label: "Due Date" },
      { key: "priority",     label: "Priority" },
      { key: "status",       label: "Status" },
      { key: "source_doc",   label: "Source Document" },
    ], `actions_export_${csvDate()}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Actions <span className="text-zinc-500 text-sm font-normal">({actions.length})</span>
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={handleExport} title="Export all to CSV">
            <FileDown size={13} /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
            <Plus size={13} /> Add
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New Action</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description *"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <div className="flex gap-2">
              <input
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="Owner"
                className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
              />
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
              />
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Action["priority"])}
                className="bg-zinc-700 border border-zinc-600 text-zinc-200 text-sm rounded px-2 py-1.5"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={addAction}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : actions.length === 0 ? (
        <p className="text-sm text-zinc-500">No actions found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Ref</th>
                <th className="pb-2 pr-4 font-medium">Description</th>
                <SortTh label="Owner"    field="owner"    sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Due"      field="due_date" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Status"   field="status"   sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="pb-2 pr-4 font-medium">Document</th>
                <th className="pb-2 pr-4 font-medium">History</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((a) => {
                const due        = dueDateLabel(a.due_date);
                const isComplete = a.status === "done" || a.status === "cancelled";
                const srcDoc     = a.created_from_doc_id ? docs.get(a.created_from_doc_id) : undefined;
                const hist     = history.get(a.id) ?? [];
                const oldest   = hist[hist.length - 1];
                const newest   = hist[0];
                const hasMany  = hist.length > 1;
                const isExpanded = expanded.has(a.id);
                return (
                  <Fragment key={a.id}>
                    <tr className="border-b border-zinc-800 hover:bg-zinc-800/40">
                      <td className="py-2.5 pr-3">
                        {a.reference_id
                          ? <span className="text-xs font-mono text-zinc-300">{a.reference_id}</span>
                          : <span className="text-xs font-mono bg-amber-900/40 text-amber-400 border border-amber-700 rounded px-1.5 py-0.5">No ID</span>
                        }
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-200 max-w-xs">
                        <span className={a.status === "done" ? "line-through text-zinc-500" : ""}>
                          {a.description}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-400">{a.owner ?? "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {a.due_date ? (
                          <span className={!isComplete && due.urgent ? "text-red-400" : "text-zinc-400"}>
                            {isComplete ? (due.date ?? due.label) : due.label}
                            {!isComplete && due.date && (
                              <span className="block text-xs text-zinc-500">{due.date}</span>
                            )}
                          </span>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={PRIORITY_BADGE[a.priority ?? "medium"]}>{a.priority}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={STATUS_BADGE[a.status]}>{a.status.replace("_", " ")}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 max-w-[140px]">
                        {srcDoc ? (
                          <button
                            onClick={async () => {
                              try { await downloadDocumentFile(srcDoc.id, srcDoc.filename); }
                              catch { toast("Could not download file", "error"); }
                            }}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 truncate max-w-full"
                            title={`Download ${srcDoc.filename}`}
                          >
                            <Download size={11} className="shrink-0" />
                            <span className="truncate">{srcDoc.filename}</span>
                          </button>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 min-w-[140px]">
                        <div className="text-xs text-zinc-500 space-y-0.5">
                          {oldest && (
                            <div>Created {fmtHistDate(oldest.changed_at)}{oldest.source_document_id ? ` · ${docName(docs, oldest.source_document_id)}` : ""}</div>
                          )}
                          {newest && newest !== oldest && (
                            <div>Updated {fmtHistDate(newest.changed_at)}{newest.source_document_id ? ` · ${docName(docs, newest.source_document_id)}` : ""}</div>
                          )}
                        </div>
                        {hasMany && (
                          <button
                            onClick={() => toggleExpand(a.id)}
                            className="mt-0.5 text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5 text-xs"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>{hist.length} entries</span>
                          </button>
                        )}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          {a.status !== "done" && (
                            <Button size="icon" variant="ghost" title="Mark done" onClick={() => markDone(a.id)}>
                              <CheckCircle size={14} className="text-emerald-400" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="Delete" onClick={() => deleteAction(a.id)}>
                            <Trash2 size={14} className="text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-zinc-900/60 border-b border-zinc-800">
                        <td colSpan={9} className="px-4 py-2">
                          <div className="space-y-1">
                            {hist.map((h) => (
                              <div key={h.id} className="flex gap-3 text-xs text-zinc-400">
                                <span className="text-zinc-500 whitespace-nowrap w-14 shrink-0">{fmtHistDate(h.changed_at)}</span>
                                <span className="flex-1 truncate">{h.description}</span>
                                {h.status && <span className="text-zinc-500 shrink-0">{h.status}</span>}
                                {h.source_document_id && <span className="text-zinc-500 truncate max-w-[140px]">{docs.get(h.source_document_id)?.filename}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <Pagination total={sorted.length} page={page} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
