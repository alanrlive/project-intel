import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { Deadline } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { dueDateLabel } from "@/lib/utils";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";

export function DeadlinesTable() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [metFilter, setMetFilter] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const met = metFilter === "" ? undefined : metFilter === "true";
      setDeadlines(await api.listDeadlines(met));
    } catch { toast("Failed to load deadlines", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setPage(0); }, [metFilter]);

  const markMet = async (id: number, met: boolean) => {
    try {
      const updated = await api.updateDeadline(id, { met });
      setDeadlines((prev) => prev.map((d) => d.id === id ? updated : d));
      toast(met ? "Deadline marked met" : "Deadline reopened", "success");
    } catch { toast("Update failed", "error"); }
  };

  const deleteDeadline = async (id: number) => {
    try {
      await api.deleteDeadline(id);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
      toast("Deadline deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const addDeadline = async () => {
    if (!newDesc.trim() || !newDate) return;
    try {
      const d = await api.createDeadline({ description: newDesc, deadline_date: newDate });
      setDeadlines((prev) => [...prev, d].sort((a, b) =>
        a.deadline_date.localeCompare(b.deadline_date)
      ));
      setNewDesc(""); setNewDate(""); setShowAdd(false);
      toast("Deadline created", "success");
    } catch { toast("Create failed", "error"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Deadlines <span className="text-zinc-500 text-sm font-normal">({deadlines.length})</span>
        </h2>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}><Plus size={13} /> Add</Button>
      </div>

      <div className="flex gap-2">
        <select
          value={metFilter}
          onChange={(e) => setMetFilter(e.target.value as "" | "true" | "false")}
          className="bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="false">Upcoming</option>
          <option value="true">Met</option>
        </select>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New Deadline</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description *"
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100"
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={addDeadline}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : deadlines.length === 0 ? (
        <p className="text-sm text-zinc-500">No deadlines found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Description</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {deadlines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((d) => {
                const due = dueDateLabel(d.deadline_date);
                return (
                  <tr key={d.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2.5 pr-4 text-zinc-200">
                      <span className={d.met ? "line-through text-zinc-500" : ""}>{d.description}</span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span className={!d.met && due.urgent ? "text-red-400" : "text-zinc-400"}>
                        {due.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={d.met ? "success" : due.urgent ? "urgent" : "warning"}>
                        {d.met ? "Met" : "Pending"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" title={d.met ? "Reopen" : "Mark met"}
                          onClick={() => markMet(d.id, !d.met)}>
                          <CheckCircle size={14} className={d.met ? "text-zinc-500" : "text-emerald-400"} />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteDeadline(d.id)}>
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination total={deadlines.length} page={page} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
