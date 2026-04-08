import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function dueDateLabel(dateStr: string | null): { label: string; date: string | null; urgent: boolean } {
  const days = daysUntil(dateStr);
  const date = dateStr ? formatDate(dateStr) : null;
  if (days === null) return { label: "No date", date: null, urgent: false };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, date, urgent: true };
  if (days === 0) return { label: "Due today", date, urgent: true };
  if (days === 1) return { label: "Due tomorrow", date, urgent: true };
  if (days <= 7) return { label: `Due in ${days}d`, date, urgent: false };
  return { label: date ?? "—", date: null, urgent: false }; // date IS the label, no subtitle needed
}
