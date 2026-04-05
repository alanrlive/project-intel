import { useEffect, useState } from "react";
import { Sidebar, type View } from "@/components/Sidebar";
import { NotificationPanel } from "@/components/NotificationPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { ChatInterface } from "@/components/ChatInterface";
import { ActionsTable } from "@/components/ActionsTable";
import { RisksTable } from "@/components/RisksTable";
import { DeadlinesTable } from "@/components/DeadlinesTable";
import { DependenciesTable } from "@/components/DependenciesTable";
import { ScopeTable } from "@/components/ScopeTable";
import { SettingsPage } from "@/components/SettingsPage";
import { api } from "@/lib/api";
import { ToastContainer } from "@/components/ui/toast";
import "./index.css";

export default function App() {
  const [view, setView] = useState<View>("notifications");
  const [unreadCount, setUnreadCount] = useState(0);
  const [ollamaOk, setOllamaOk] = useState(false);

  // Poll unread count and Ollama status on mount + every 60s
  useEffect(() => {
    async function poll() {
      try {
        const [notifs, llm] = await Promise.all([
          api.getNotifications(true),
          api.llmStatus(),
        ]);
        setUnreadCount(notifs.unread);
        setOllamaOk(llm.ollama_running);
      } catch {
        setOllamaOk(false);
      }
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleNotificationsRead = () => setUnreadCount(0);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-900">
      <Sidebar
        current={view}
        onChange={setView}
        unreadCount={unreadCount}
        ollamaOk={ollamaOk}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Ollama offline banner */}
        {!ollamaOk && (
          <div className="bg-red-900/50 border-b border-red-700 px-4 py-2 text-sm text-red-200 flex items-center gap-2">
            <span className="font-semibold">Ollama not running</span>
            <span className="text-red-300">— LLM features unavailable. Start with:</span>
            <code className="bg-red-950 px-1.5 py-0.5 rounded text-xs">ollama serve</code>
          </div>
        )}

        <div className="p-6">
          {view === "notifications" && (
            <NotificationPanel onAllRead={handleNotificationsRead} />
          )}
          {view === "upload" && <UploadPanel onNavigate={setView} />}
          {view === "chat" && <ChatInterface ollamaOk={ollamaOk} />}
          {view === "actions" && <ActionsTable />}
          {view === "risks" && <RisksTable />}
          {view === "deadlines" && <DeadlinesTable />}
          {view === "dependencies" && <DependenciesTable />}
          {view === "scope" && <ScopeTable />}
          {view === "settings" && <SettingsPage />}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
