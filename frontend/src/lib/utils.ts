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

export function dueDateLabel(dateStr: string | null): { label: string; urgent: boolean } {
  const days = daysUntil(dateStr);
  if (days === null) return { label: "No date", urgent: false };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, urgent: true };
  if (days === 0) return { label: "Due today", urgent: true };
  if (days === 1) return { label: "Due tomorrow", urgent: true };
  if (days <= 7) return { label: `Due in ${days}d`, urgent: false };
  return { label: formatDate(dateStr), urgent: false };
}
