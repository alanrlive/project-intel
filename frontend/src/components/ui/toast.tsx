import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let _addToast: ((msg: string, type: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = "info") {
  _addToast?.(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;

  useEffect(() => {
    _addToast = (message, type) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    return () => { _addToast = null; };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "px-4 py-2.5 rounded shadow-lg text-sm text-white max-w-sm animate-in slide-in-from-right",
            t.type === "success" && "bg-emerald-700",
            t.type === "error" && "bg-red-700",
            t.type === "info" && "bg-zinc-700"
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
