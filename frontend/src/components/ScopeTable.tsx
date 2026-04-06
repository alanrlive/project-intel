import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, CheckCircle, FileDown } from "lucide-react";
import { api } from "@/lib/api";
import type { ScopeItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";
import {
  SortTh, SortDir, nextDir, applySort,
  exportCsv, csvDate,
} from "@/lib/tableUtils";

const SOURCE_BADGE: Record<string, "info" | "warning" | "outline" | "urgent"> = {
  original_plan:  "outline",
  original:       "outline",
  change_request: "warning",
  meeting:        "info",
  deferred:       "urgent",
};

const SOURCE_ORD: Record<string, number> = {
  deferred:       3,
  change_request: 2,
  meeting:        1,
  original_plan:  0,
  original:       0,
};

type SortField = "approved" | "added_date" | "source";

function sortValue(s: ScopeItem, field: SortField): string | number | boolean {
  switch (field) {
    case "approved":   return s.approved;
    case "added_date": return s.added_date ?? "";
    case "source":     return SOURCE_ORD[s.source] ?? 0;
  }
}

export function ScopeTable() {
  const [items, setItems]           = useState<ScopeItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(0);
  const [approvedFilter, setApprovedFilter] = useState<"" | "true" | "false">("");
  const [sortField, setSortField]   = useState<SortField | null>(null);
  const [sortDir, setSortDir]       = useState<SortDir>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [form, setForm]             = useState({
    description: "", source: "meeting", impact_assessment: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const approved = approvedFilter === "" ? undefined : approvedFilter === "true";
      setItems(await api.listScopeItems(approved));
    } catch { toast("Failed to load scope items", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setPage(0); }, [approvedFilter]);

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
    () => applySort(items, sortField, sortDir, (s, f) => sortValue(s, f as SortField)),
    [items, sortField, sortDir],
  );

  const toggleApproved = async (id: number, approved: boolean) => {
    try {
      const updated = await api.updateScopeItem(id, { approved });
      setItems((prev) => prev.map((s) => s.id === id ? updated : s));
      toast(approved ? "Scope item approved" : "Approval revoked", "success");
    } catch { toast("Update failed", "error"); }
  };

  const deleteItem = async (id: number) => {
    try {
      await api.deleteScopeItem(id);
      setItems((prev) => prev.filter((s) => s.id !== id));
      toast("Scope item deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const addItem = async () => {
    if (!form.description.trim()) return;
    try {
      const s = await api.createScopeItem({
        description: form.description,
        source: form.source as ScopeItem["source"],
        impact_assessment: form.impact_assessment || undefined,
        approved: false,
      });
      setItems((prev) => [s, ...prev]);
      setForm({ description: "", source: "meeting", impact_assessment: "" });
      setShowAdd(false);
      toast("Scope item created", "success");
    } catch { toast("Create failed", "error"); }
  };

  const handleExport = () => {
    const rows = sorted.map((s) => ({
      description:       s.description,
      source:            s.source.replace("_", " "),
      approved:          s.approved ? "Yes" : "No",
      impact_assessment: s.impact_assessment ?? "",
      added_date:        s.added_date ?? "",
    }));
    exportCsv(rows, [
      { key: "description",       label: "Description" },
      { key: "source",            label: "Origin" },
      { key: "approved",          label: "Approved" },
      { key: "impact_assessment", label: "Impact Assessment" },
      { key: "added_date",        label: "Added Date" },
    ], `scope_export_${csvDate()}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Scope Items <span className="text-zinc-500 text-sm font-normal">({items.length})</span>
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={handleExport} title="Export all to CSV">
            <FileDown size={13} /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}><Plus size={13} /> Add</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <select
          value={approvedFilter}
          onChange={(e) => setApprovedFilter(e.target.value as "" | "true" | "false")}
          className="bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="false">Pending approval</option>
          <option value="true">Approved</option>
        </select>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New Scope Item</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description *"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <select
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="w-full bg-zinc-700 border border-zinc-600 text-zinc-200 text-sm rounded px-2 py-1.5"
            >
              <option value="original_plan">Original Plan</option>
              <option value="change_request">Change Request</option>
              <option value="meeting">Meeting</option>
            </select>
            <input
              value={form.impact_assessment}
              onChange={(e) => setForm((f) => ({ ...f, impact_assessment: e.target.value }))}
              placeholder="Impact assessment (optional)"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={addItem}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No scope items found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Description</th>
                <SortTh label="Origin"   field="source"     sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Approved" field="approved"   sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="pb-2 pr-4 font-medium">Impact</th>
                <SortTh label="Added"    field="added_date" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((s) => (
                <tr key={s.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                  <td className="py-2.5 pr-4 text-zinc-200 max-w-xs">{s.description}</td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={SOURCE_BADGE[s.source]}>
                      {s.source.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={s.approved ? "success" : "warning"}>
                      {s.approved ? "Approved" : "Pending"}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-zinc-400 max-w-[180px]">
                    <span className="truncate block" title={s.impact_assessment ?? undefined}>
                      {s.impact_assessment ?? <span className="text-zinc-600">—</span>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-zinc-400 whitespace-nowrap">
                    {formatDate(s.added_date)}
                  </td>
                  <td className="py-2.5">
                    <div className="flex gap-1">
                      <Button
                        size="icon" variant="ghost"
                        title={s.approved ? "Revoke approval" : "Approve"}
                        onClick={() => toggleApproved(s.id, !s.approved)}
                      >
                        <CheckCircle size={14} className={s.approved ? "text-zinc-500" : "text-emerald-400"} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteItem(s.id)}>
                        <Trash2 size={14} className="text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={sorted.length} page={page} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
