import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Dependency } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const TYPE_BADGE: Record<string, "urgent" | "warning" | "outline"> = {
  blocks:     "urgent",
  enables:    "outline",
  relates_to: "default" as "outline",
};

export function DependenciesTable() {
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ task_a: "", task_b: "", dependency_type: "blocks", notes: "" });

  const load = async () => {
    setLoading(true);
    try { setDeps(await api.listDependencies()); }
    catch { toast("Failed to load dependencies", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Dependencies <span className="text-zinc-500 text-sm font-normal">({deps.length})</span>
        </h2>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}><Plus size={13} /> Add</Button>
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
        <div className="space-y-2">
          {deps.map((d) => (
            <Card key={d.id}>
              <CardContent className="py-3 flex items-center gap-3">
                <span className="text-sm text-zinc-200 flex-1 min-w-0 truncate">{d.task_a}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ArrowRight size={14} className="text-zinc-500" />
                  <Badge variant={TYPE_BADGE[d.dependency_type]}>
                    {d.dependency_type.replace("_", " ")}
                  </Badge>
                  <ArrowRight size={14} className="text-zinc-500" />
                </div>
                <span className="text-sm text-zinc-200 flex-1 min-w-0 truncate">{d.task_b}</span>
                <Button size="icon" variant="ghost" onClick={() => deleteDep(d.id)}>
                  <Trash2 size={14} className="text-red-400" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
