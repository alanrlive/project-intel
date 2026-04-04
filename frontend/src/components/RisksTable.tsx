import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Risk } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";

const IMPACT_BADGE: Record<string, "urgent" | "warning" | "outline"> = {
  high:   "urgent",
  medium: "warning",
  low:    "outline",
};

export function RisksTable() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: "", impact: "medium", likelihood: "medium", mitigation: "" });

  const load = async () => {
    setLoading(true);
    try {
      setRisks(await api.listRisks(statusFilter || undefined));
    } catch { toast("Failed to load risks", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setPage(0); }, [statusFilter]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Risks <span className="text-zinc-500 text-sm font-normal">({risks.length})</span>
        </h2>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}><Plus size={13} /> Add</Button>
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
        <div className="space-y-2">
          {risks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-zinc-200 flex-1">{r.description}</p>
                  <div className="flex gap-1.5 shrink-0">
                    <Badge variant={IMPACT_BADGE[r.impact]}>
                      {r.impact} impact
                    </Badge>
                    <Badge variant={IMPACT_BADGE[r.likelihood]}>
                      {r.likelihood} likelihood
                    </Badge>
                  </div>
                </div>
                {r.mitigation && (
                  <p className="text-xs text-zinc-400">
                    <span className="font-medium text-zinc-500">Mitigation:</span> {r.mitigation}
                  </p>
                )}
                <div className="flex items-center justify-between">
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
                  <Button size="icon" variant="ghost" onClick={() => deleteRisk(r.id)}>
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <Pagination total={risks.length} page={page} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
