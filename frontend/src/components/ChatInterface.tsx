import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { Citation, QueryResponse } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
  response?: QueryResponse;
  error?: string;
}

const EXAMPLE_QUESTIONS = [
  "What tasks are due this week?",
  "What are the top risks right now?",
  "What is blocking the project?",
  "Has the scope changed?",
  "What deadlines are coming up?",
];

export function ChatInterface({ ollamaOk }: { ollamaOk: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [deepReason, setDeepReason] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (question = input) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);

    try {
      const response = await api.query(q, deepReason);
      setMessages((prev) => [...prev, { role: "assistant", text: response.answer, response }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setMessages((prev) => [...prev, { role: "assistant", text: "", error: msg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">Ask AI</h2>
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deepReason}
            onChange={(e) => setDeepReason(e.target.checked)}
            className="accent-blue-500"
          />
          <Zap size={12} className="text-purple-400" />
          Deep reasoning (DeepSeek-R1)
        </label>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">Try asking:</p>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="block w-full text-left text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-3 py-2 transition-colors cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
            {/* Avatar */}
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              msg.role === "user" ? "bg-blue-700" : "bg-zinc-700"
            )}>
              {msg.role === "user"
                ? <User size={14} className="text-white" />
                : <Bot size={14} className="text-zinc-300" />}
            </div>

            <div className={cn(
              "max-w-[85%] space-y-2",
              msg.role === "user" && "items-end"
            )}>
              <div className={cn(
                "rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-blue-700 text-white"
                  : "bg-zinc-800 text-zinc-200 border border-zinc-700"
              )}>
                {msg.error
                  ? <span className="text-red-400">{msg.error}</span>
                  : <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                }
              </div>

              {/* Metadata for assistant */}
              {msg.response && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {msg.response.answered_directly ? "DB" : msg.response.model_used}
                  </Badge>
                  {msg.response.citations.length > 0 && (
                    <CitationList citations={msg.response.citations} />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
              <Bot size={14} className="text-zinc-300" />
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!ollamaOk && (
        <p className="text-xs text-amber-400 mb-2">
          Ollama is offline — structured queries still work, LLM reasoning unavailable.
        </p>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your project…"
          className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button type="submit" loading={loading} disabled={!input.trim()}>
          <Send size={14} />
        </Button>
      </form>
    </div>
  );
}

function CitationList({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 underline cursor-pointer"
      >
        {citations.length} citation{citations.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs space-y-1 w-64 z-10 shadow-xl">
          {citations.map((c, i) => (
            <div key={i} className="flex gap-1.5 text-zinc-300">
              <Badge variant="outline" className="text-[9px] shrink-0">{c.type} #{c.id}</Badge>
              <span className="truncate">{c.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
