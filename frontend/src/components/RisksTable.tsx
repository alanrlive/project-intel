import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Risk, Document, RaidItemHistory } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";
import {
  SortTh, SortDir, nextDir, applySort,
  exportCsv, csvDate,
} from "@/lib/tableUtils";

const IMPACT_BADGE: Record<string, "urgent" | "warning" | "outline"> = {
  high:   "urgent",
  medium: "warning",
  low:    "outline",
};

const LEVEL_ORD: Record<string, number>       = { high: 2, medium: 1, low: 0 };
const RISK_STATUS_ORD: Record<string, number> = { open: 3, accepted: 2, mitigated: 1, closed: 0 };

type SortField = "impact" | "likelihood" | "status";

function sortValue(r: Risk, field: SortField): string | number {
  switch (field) {
    case "impact":     return LEVEL_ORD[r.impact] ?? 1;
    case "likelihood": return LEVEL_ORD[r.likelihood] ?? 1;
    case "status":     return RISK_STATUS_ORD[r.status] ?? 0;
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

export function RisksTable() {
  const [risks, setRisks]           = useState<Risk[]>([]);
  const [docs, setDocs]             = useState<Map<number, Document>>(new Map());
  const [history, setHistory]       = useState<Map<number, RaidItemHistory[]>>(new Map());
  const [expanded, setExpanded]     = useState<Set<number>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage]             = useState(0);
  const [sortField, setSortField]   = useState<SortField | null>(null);
  const [sortDir, setSortDir]       = useState<SortDir>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [form, setForm]             = useState({
    description: "", impact: "medium", likelihood: "medium", mitigation: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [data, docList] = await Promise.all([
        api.listRisks(statusFilter || undefined),
        api.listDocuments(),
      ]);
      setRisks(data);
      setDocs(new Map(docList.map((d) => [d.id, d])));
      const histEntries = await Promise.all(
        data.map(async (r) => {
          const h = await api.getHistory("risks", r.id).catch(() => []);
          return [r.id, h] as [number, RaidItemHistory[]];
        })
      );
      setHistory(new Map(histEntries));
    } catch { toast("Failed to load risks", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setPage(0); }, [statusFilter]);

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
    () => applySort(risks, sortField, sortDir, (r, f) => sortValue(r, f as SortField)),
    [risks, sortField, sortDir],
  );

  const updateStatus = async (id: number, status: Risk["status"]) => {
    try {
      const updated = await api.updateRisk(id, { status });
      setRisks((prev) => prev.map((r) => r.id === id ? updated : r));
      toast("Risk updated", "success");
    } catch { toast("Update failed", "error"); }
  };

  const deleteRisk = async (id: number) => {
    try {
      await api.deleteRisk(id);
      setRisks((prev) => prev.filter((r) => r.id !== id));
      toast("Risk deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const addRisk = async () => {
    if (!form.description.trim()) return;
    try {
      const r = await api.createRisk({
        description: form.description,
        impact: form.impact as Risk["impact"],
        likelihood: form.likelihood as Risk["likelihood"],
        mitigation: form.mitigation || undefined,
      });
      setRisks((prev) => [r, ...prev]);
      setForm({ description: "", impact: "medium", likelihood: "medium", mitigation: "" });
      setShowAdd(false);
      toast("Risk created", "success");
    } catch { toast("Create failed", "error"); }
  };

  const handleExport = () => {
    const rows = sorted.map((r) => ({
      reference_id: r.reference_id ?? "",
      description:  r.description,
      impact:       r.impact,
      likelihood:   r.likelihood,
      mitigation:   r.mitigation ?? "",
      status:       r.status,
    }));
    exportCsv(rows, [
      { key: "reference_id", label: "Ref ID" },
      { key: "description",  label: "Description" },
      { key: "impact",       label: "Impact" },
      { key: "likelihood",   label: "Likelihood" },
      { key: "mitigation",   label: "Mitigation" },
      { key: "status",       label: "Status" },
    ], `risks_export_${csvDate()}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Risks <span className="text-zinc-500 text-sm font-normal">({risks.length})</span>
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="mitigated">Mitigated</option>
          <option value="accepted">Accepted</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New Risk</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description *"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <div className="flex gap-2">
              {(["impact", "likelihood"] as const).map((field) => (
                <select
                  key={field}
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="flex-1 bg-zinc-700 border border-zinc-600 text-zinc-200 text-sm rounded px-2 py-1.5 capitalize"
                >
                  <option value="high">High {field}</option>
                  <option value="medium">Medium {field}</option>
                  <option value="low">Low {field}</option>
                </select>
              ))}
            </div>
            <input
              value={form.mitigation}
              onChange={(e) => setForm((f) => ({ ...f, mitigation: e.target.value }))}
              placeholder="Mitigation (optional)"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={addRisk}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : risks.length === 0 ? (
        <p className="text-sm text-zinc-500">No risks found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Ref</th>
                <th className="pb-2 pr-4 font-medium">Description</th>
                <SortTh label="Impact"     field="impact"     sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Likelihood" field="likelihood" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="pb-2 pr-4 font-medium">Mitigation</th>
                <SortTh label="Status"     field="status"     sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="pb-2 pr-4 font-medium">History</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => {
                const hist     = history.get(r.id) ?? [];
                const oldest   = hist[hist.length - 1];
                const newest   = hist[0];
                const hasMany  = hist.length > 1;
                const isExpanded = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-zinc-800 hover:bg-zinc-800/40">
                      <td className="py-2.5 pr-3">
                        {r.reference_id
                          ? <span className="text-xs font-mono text-zinc-300">{r.reference_id}</span>
                          : <span className="text-xs font-mono bg-amber-900/40 text-amber-400 border border-amber-700 rounded px-1.5 py-0.5">No ID</span>
                        }
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-200 max-w-xs">{r.description}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={IMPACT_BADGE[r.impact]}>{r.impact}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={IMPACT_BADGE[r.likelihood]}>{r.likelihood}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-400 max-w-[180px]">
                        <span className="truncate block" title={r.mitigation ?? undefined}>
                          {r.mitigation ?? <span className="text-zinc-600">—</span>}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value as Risk["status"])}
                          className="bg-zinc-700 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
                        >
                          <option value="open">Open</option>
                          <option value="mitigated">Mitigated</option>
                          <option value="accepted">Accepted</option>
                          <option value="closed">Closed</option>
                        </select>
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
                            onClick={() => toggleExpand(r.id)}
                            className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 cursor-pointer hover:text-gray-200"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>{hist.length} entries</span>
                          </button>
                        )}
                      </td>
                      <td className="py-2.5">
                        <Button size="icon" variant="ghost" onClick={() => deleteRisk(r.id)}>
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-zinc-900/60 border-b border-zinc-800">
                        <td colSpan={8} className="px-4 py-2">
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
