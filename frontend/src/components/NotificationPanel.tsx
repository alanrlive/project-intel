import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Bell, AlertTriangle, Clock, Info } from "lucide-react";
import { api } from "@/lib/api";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface NotificationPanelProps {
  onAllRead: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  urgent:  "border-l-red-500 bg-red-950/20",
  warning: "border-l-amber-500 bg-amber-950/20",
  info:    "border-l-blue-500 bg-blue-950/20",
};

const SEVERITY_BADGE: Record<string, "urgent" | "warning" | "info"> = {
  urgent:  "urgent",
  warning: "warning",
  info:    "info",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  action:       <Clock size={14} className="text-amber-400" />,
  deadline:     <AlertTriangle size={14} className="text-red-400" />,
  risk:         <AlertTriangle size={14} className="text-amber-400" />,
  scope_change: <Info size={14} className="text-blue-400" />,
};

export function NotificationPanel({ onAllRead }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      // backend may not be running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await api.refreshBriefing();
      toast(`Briefing updated — ${result.total_notifications} notifications`, "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
      onAllRead();
    } catch {
      toast("Failed to mark all read", "error");
    }
  };

  const handleMarkOne = async (id: number) => {
    try {
      await api.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, read: true } : n)
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  // Group by severity
  const urgent  = notifications.filter((n) => n.severity === "urgent");
  const warning = notifications.filter((n) => n.severity === "warning");
  const info    = notifications.filter((n) => n.severity === "info");

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-100">Daily Briefing</h2>
          {unread > 0 && (
            <Badge variant="urgent">{unread} unread</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
          <Button size="sm" loading={refreshing} onClick={handleRefresh}>
            <RefreshCw size={13} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-zinc-500">Loading…</p>
      )}

      {!loading && notifications.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-zinc-500 text-sm">
            No notifications. Click Refresh to generate a briefing.
          </CardContent>
        </Card>
      )}

      {[
        { label: "Urgent", items: urgent },
        { label: "This Week", items: warning },
        { label: "Info", items: info },
      ].map(({ label, items }) =>
        items.length > 0 ? (
          <section key={label}>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              {label}
            </h3>
            <div className="space-y-1.5">
              {items.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && handleMarkOne(n.id)}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 rounded border-l-2 transition-opacity cursor-pointer",
                    SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.info,
                    n.read && "opacity-40"
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {TYPE_ICON[n.type] ?? <Bell size={14} className="text-zinc-400" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 leading-snug">{n.message}</p>
                    {n.related_type && (
                      <span className="text-xs text-zinc-500 capitalize">
                        {n.related_type} #{n.related_id}
                      </span>
                    )}
                  </div>
                  <Badge variant={SEVERITY_BADGE[n.severity] ?? "info"} className="shrink-0 mt-0.5">
                    {n.type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        ) : null
      )}
    </div>
  );
}
