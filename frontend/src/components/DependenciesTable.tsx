import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Dependency, Document, RaidItemHistory } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";
import {
  SortTh, SortDir, nextDir, applySort,
  exportCsv, csvDate,
} from "@/lib/tableUtils";

const TYPE_BADGE: Record<string, "urgent" | "warning" | "outline"> = {
  blocks:     "urgent",
  enables:    "outline",
  relates_to: "outline",
};

const DEP_TYPE_ORD: Record<string, number> = { blocks: 2, relates_to: 1, enables: 0 };

type SortField = "dependency_type" | "task_a" | "task_b";

function sortValue(d: Dependency, field: SortField): string | number {
  switch (field) {
    case "dependency_type": return DEP_TYPE_ORD[d.dependency_type] ?? 0;
    case "task_a":          return d.task_a.toLowerCase();
    case "task_b":          return d.task_b.toLowerCase();
  }
}

function fmtHistDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function snippetDesc(desc: string | null): string {
  if (!desc) return "";
  return desc.length > 60 ? desc.slice(0, 60) + "…" : desc;
}

export function DependenciesTable() {
  const [deps, setDeps]           = useState<Dependency[]>([]);
  const [docs, setDocs]           = useState<Map<number, Document>>(new Map());
  const [history, setHistory]     = useState<Map<number, RaidItemHistory[]>>(new Map());
  const [expanded, setExpanded]   = useState<Set<number>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(0);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir]     = useState<SortDir>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({
    task_a: "", task_b: "", dependency_type: "blocks", notes: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [data, docList] = await Promise.all([
        api.listDependencies(),
        api.listDocuments(),
      ]);
      setDeps(data);
      setDocs(new Map(docList.map((d) => [d.id, d])));
      const histEntries = await Promise.all(
        data.map(async (dep) => {
          const h = await api.getHistory("dependencies", dep.id).catch(() => []);
          return [dep.id, h] as [number, RaidItemHistory[]];
        })
      );
      setHistory(new Map(histEntries));
    } catch { toast("Failed to load dependencies", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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
    () => applySort(deps, sortField, sortDir, (d, f) => sortValue(d, f as SortField)),
    [deps, sortField, sortDir],
  );

  const deleteDep = async (id: number) => {
    try {
      await api.deleteDependency(id);
      setDeps((prev) => prev.filter((d) => d.id !== id));
      toast("Dependency deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const addDep = async () => {
    if (!form.task_a.trim() || !form.task_b.trim()) return;
    try {
      const d = await api.createDependency({
        task_a: form.task_a,
        task_b: form.task_b,
        dependency_type: form.dependency_type as Dependency["dependency_type"],
        notes: form.notes || undefined,
      });
      setDeps((prev) => [...prev, d]);
      setForm({ task_a: "", task_b: "", dependency_type: "blocks", notes: "" });
      setShowAdd(false);
      toast("Dependency created", "success");
    } catch { toast("Create failed", "error"); }
  };

  const handleExport = () => {
    const rows = sorted.map((d) => ({
      reference_id:     d.reference_id ?? "",
      task_a:           d.task_a,
      dependency_type:  d.dependency_type.replace("_", " "),
      task_b:           d.task_b,
      notes:            d.notes ?? "",
    }));
    exportCsv(rows, [
      { key: "reference_id",    label: "Ref ID" },
      { key: "task_a",          label: "Task A" },
      { key: "dependency_type", label: "Type" },
      { key: "task_b",          label: "Task B" },
      { key: "notes",           label: "Notes" },
    ], `dependencies_export_${csvDate()}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Dependencies <span className="text-zinc-500 text-sm font-normal">({deps.length})</span>
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={handleExport} title="Export all to CSV">
            <FileDown size={13} /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}><Plus size={13} /> Add</Button>
        </div>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New Dependency</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={form.task_a}
                onChange={(e) => setForm((f) => ({ ...f, task_a: e.target.value }))}
                placeholder="Task A *"
                className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
              />
              <select
                value={form.dependency_type}
                onChange={(e) => setForm((f) => ({ ...f, dependency_type: e.target.value }))}
                className="bg-zinc-700 border border-zinc-600 text-zinc-200 text-sm rounded px-2 py-1.5"
              >
                <option value="blocks">blocks</option>
                <option value="enables">enables</option>
                <option value="relates_to">relates to</option>
              </select>
              <input
                value={form.task_b}
                onChange={(e) => setForm((f) => ({ ...f, task_b: e.target.value }))}
                placeholder="Task B *"
                className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
              />
            </div>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes (optional)"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={addDep}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : deps.length === 0 ? (
        <p className="text-sm text-zinc-500">No dependencies recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Ref</th>
                <SortTh label="Task A" field="task_a"          sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Type"   field="dependency_type" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Task B" field="task_b"          sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="pb-2 pr-4 font-medium">Notes</th>
                <th className="pb-2 pr-4 font-medium">History</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((d) => {
                const hist     = history.get(d.id) ?? [];
                const oldest   = hist[hist.length - 1];
                const newest   = hist[0];
                const hasMany  = hist.length > 1;
                const isExpanded = expanded.has(d.id);
                return (
                  <Fragment key={d.id}>
                    <tr className="border-b border-zinc-800 hover:bg-zinc-800/40">
                      <td className="py-2.5 pr-3">
                        {d.reference_id
                          ? <span className="text-xs font-mono text-zinc-300">{d.reference_id}</span>
                          : <span className="text-xs font-mono bg-amber-900/40 text-amber-400 border border-amber-700 rounded px-1.5 py-0.5">No ID</span>
                        }
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-200 max-w-[180px]">
                        <span className="truncate block" title={d.task_a}>{d.task_a}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={TYPE_BADGE[d.dependency_type]}>
                          {d.dependency_type.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-200 max-w-[180px]">
                        <span className="truncate block" title={d.task_b}>{d.task_b}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-400 max-w-[160px]">
                        <span className="truncate block" title={d.notes ?? undefined}>
                          {d.notes ?? <span className="text-zinc-600">—</span>}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 min-w-[140px]">
                        <div className="text-xs text-zinc-500 space-y-0.5">
                          {oldest && (
                            <div>Created {fmtHistDate(oldest.changed_at)}{oldest.description ? ` · ${snippetDesc(oldest.description)}` : ""}</div>
                          )}
                          {newest && newest !== oldest && (
                            <div>Updated {fmtHistDate(newest.changed_at)}{newest.description ? ` · ${snippetDesc(newest.description)}` : ""}</div>
                          )}
                        </div>
                        {hasMany && (
                          <button
                            onClick={() => toggleExpand(d.id)}
                            className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 cursor-pointer hover:text-gray-200"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>{hist.length} entries</span>
                          </button>
                        )}
                      </td>
                      <td className="py-2.5">
                        <Button size="icon" variant="ghost" onClick={() => deleteDep(d.id)}>
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-zinc-900/60 border-b border-zinc-800">
                        <td colSpan={7} className="px-4 py-2">
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
