// Shared utilities for sortable, exportable data tables.

// ── Sort ──────────────────────────────────────────────────────────────────────

export type SortDir = "asc" | "desc" | null;

/** Cycle: null → asc → desc → null */
export function nextDir(current: SortDir): SortDir {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

interface SortThProps {
  label: string;
  field: string;
  sortField: string | null;
  sortDir: SortDir;
  onSort: (field: string) => void;
  className?: string;
}

export function SortTh({ label, field, sortField, sortDir, onSort, className = "" }: SortThProps) {
  const active = sortField === field;
  const indicator = active && sortDir === "asc" ? "↑" : active && sortDir === "desc" ? "↓" : "↕";
  return (
    <th
      onClick={() => onSort(field)}
      className={`pb-2 pr-4 font-medium cursor-pointer select-none transition-colors hover:text-zinc-300 ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? "text-zinc-400" : "text-zinc-700"}`}>
          {indicator}
        </span>
      </span>
    </th>
  );
}

/** Sort a copy of data. getValue returns a comparable value for a given field. */
export function applySort<T>(
  data: T[],
  field: string | null,
  dir: SortDir,
  getValue: (item: T, field: string) => string | number | boolean | null | undefined,
): T[] {
  if (!field || !dir) return data;
  return [...data].sort((a, b) => {
    const av = getValue(a, field) ?? "";
    const bv = getValue(b, field) ?? "";
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else if (typeof av === "boolean" && typeof bv === "boolean") {
      cmp = Number(av) - Number(bv);
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvEscape(val: unknown): string {
  const s = val == null ? "" : String(val);
  // Quote if contains comma, quote, or newline
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv(
  rows: Record<string, unknown>[],
  cols: { key: string; label: string }[],
  filename: string,
): void {
  const header = cols.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((row) =>
    cols.map((c) => csvEscape(row[c.key])).join(",")
  );
  const csv = [header, ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generate a datestamp string for CSV filenames: 20260406 */
export function csvDate(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// ── File download ─────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/**
 * Fetch a document file from the backend and trigger a browser download.
 * Works inside Tauri webview without any additional capabilities.
 */
export async function downloadDocumentFile(docId: number, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${docId}/file`);
  if (!res.ok) throw new Error("File not available");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
