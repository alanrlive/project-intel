import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { ScopeItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

const SOURCE_BADGE: Record<string, "info" | "warning" | "outline"> = {
  original_plan:  "outline",
  change_request: "warning",
  meeting:        "info",
};

export function ScopeTable() {
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvedFilter, setApprovedFilter] = useState<"" | "true" | "false">("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    description: "",
    source: "meeting",
    impact_assessment: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const approved = approvedFilter === "" ? undefined : approvedFilter === "true";
      setItems(await api.listScopeItems(approved));
    } catch { toast("Failed to load scope items", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [approvedFilter]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Scope Items <span className="text-zinc-500 text-sm font-normal">({items.length})</span>
        </h2>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}><Plus size={13} /> Add</Button>
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
        <div className="space-y-2">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-zinc-200 flex-1">{s.description}</p>
                  <div className="flex gap-1.5 shrink-0">
                    <Badge variant={SOURCE_BADGE[s.source]}>
                      {s.source.replace("_", " ")}
                    </Badge>
                    <Badge variant={s.approved ? "success" : "warning"}>
                      {s.approved ? "Approved" : "Pending"}
                    </Badge>
                  </div>
                </div>
                {s.impact_assessment && (
                  <p className="text-xs text-zinc-400">
                    <span className="font-medium text-zinc-500">Impact:</span> {s.impact_assessment}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Added {formatDate(s.added_date)}</span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title={s.approved ? "Revoke approval" : "Approve"}
                      onClick={() => toggleApproved(s.id, !s.approved)}
                    >
                      <CheckCircle size={14} className={s.approved ? "text-zinc-500" : "text-emerald-400"} />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteItem(s.id)}>
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
