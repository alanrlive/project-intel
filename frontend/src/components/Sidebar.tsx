import { Bell, Bot, CheckSquare, FileUp, Shield, Triangle, Link2, Layers, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type View =
  | "notifications"
  | "upload"
  | "chat"
  | "actions"
  | "risks"
  | "deadlines"
  | "dependencies"
  | "scope"
  | "settings";

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "notifications", label: "Briefing",  icon: <Bell size={16} /> },
  { id: "upload",        label: "Upload",    icon: <FileUp size={16} /> },
  { id: "chat",          label: "Ask AI",    icon: <Bot size={16} /> },
  { id: "actions",       label: "Actions",   icon: <CheckSquare size={16} /> },
  { id: "risks",         label: "Risks",     icon: <Shield size={16} /> },
  { id: "deadlines",     label: "Deadlines", icon: <Triangle size={16} /> },
  { id: "dependencies",  label: "Depends",   icon: <Link2 size={16} /> },
  { id: "scope",         label: "Scope",     icon: <Layers size={16} /> },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "settings", label: "Settings", icon: <Settings size={16} /> },
];

interface SidebarProps {
  current: View;
  onChange: (view: View) => void;
  unreadCount: number;
  ollamaOk: boolean;
}

export function Sidebar({ current, onChange, unreadCount, ollamaOk }: SidebarProps) {
  return (
    <aside className="flex flex-col w-44 min-h-screen bg-zinc-900 border-r border-zinc-700 py-4">
      {/* App title */}
      <div className="px-4 mb-6">
        <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
          Project Intel
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors cursor-pointer",
              current === item.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === "notifications" && unreadCount > 0 && (
              <span className="ml-auto bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom nav (Settings) */}
      <div className="px-2 pb-1 border-t border-zinc-700 pt-2 space-y-0.5">
        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors cursor-pointer",
              current === item.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Ollama status dot */}
      <div className="px-4 mt-4 flex items-center gap-2 text-xs text-zinc-500">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            ollamaOk ? "bg-emerald-500" : "bg-red-500 animate-pulse"
          )}
        />
        {ollamaOk ? "Ollama ready" : "Ollama offline"}
      </div>
    </aside>
  );
}
