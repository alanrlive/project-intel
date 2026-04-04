import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { Action } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { dueDateLabel } from "@/lib/utils";
import { Pagination, PAGE_SIZE } from "@/components/ui/pagination";

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

export function ActionsTable() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newPriority, setNewPriority] = useState<Action["priority"]>("medium");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listActions({
        ...(statusFilter && { status: statusFilter }),
        ...(priorityFilter && { priority: priorityFilter }),
      });
      setActions(data);
    } catch { toast("Failed to load actions", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setPage(0); }, [statusFilter, priorityFilter]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Actions <span className="text-zinc-500 text-sm font-normal">({actions.length})</span>
        </h2>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
          <Plus size={13} /> Add
        </Button>
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
                <th className="pb-2 pr-4 font-medium">Description</th>
                <th className="pb-2 pr-4 font-medium">Owner</th>
                <th className="pb-2 pr-4 font-medium">Due</th>
                <th className="pb-2 pr-4 font-medium">Priority</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {actions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((a) => {
                const due = dueDateLabel(a.due_date);
                return (
                  <tr key={a.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2.5 pr-4 text-zinc-200 max-w-xs">
                      <span className={a.status === "done" ? "line-through text-zinc-500" : ""}>
                        {a.description}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-400">{a.owner ?? "—"}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {a.due_date ? (
                        <span className={due.urgent ? "text-red-400" : "text-zinc-400"}>
                          {due.label}
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={PRIORITY_BADGE[a.priority ?? "medium"]}>
                        {a.priority}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={STATUS_BADGE[a.status]}>
                        {a.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        {a.status !== "done" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Mark done"
                            onClick={() => markDone(a.id)}
                          >
                            <CheckCircle size={14} className="text-emerald-400" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => deleteAction(a.id)}
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination total={actions.length} page={page} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
