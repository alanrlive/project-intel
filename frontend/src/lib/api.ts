import type {
  Action,
  Deadline,
  Dependency,
  Document,
  LlmStatus,
  NotificationsResponse,
  QueryResponse,
  Risk,
  ScopeItem,
  UploadResult,
} from "@/types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── System ────────────────────────────────────────────────────────────────────

export const api = {
  health: () => request<{ status: string; project: string }>("/health"),

  // ── LLM ──────────────────────────────────────────────────────────────────
  llmStatus: () => request<LlmStatus>("/llm/status"),

  // ── Documents ────────────────────────────────────────────────────────────
  listDocuments: () => request<Document[]>("/documents"),

  uploadDocument: (file: File, docType: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    return request<UploadResult>("/documents/upload", { method: "POST", body: form });
  },

  deleteDocument: (id: number) =>
    request<{ deleted: number }>(`/documents/${id}`, { method: "DELETE" }),

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications: (unreadOnly = false) =>
    request<NotificationsResponse>(`/notifications${unreadOnly ? "?unread_only=true" : ""}`),

  refreshBriefing: () =>
    request<{ total_notifications: number; counts: Record<string, number> }>(
      "/notifications/refresh",
      { method: "POST" }
    ),

  markRead: (id: number) =>
    request<{ id: number; read: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),

  markAllRead: () =>
    request<{ marked_read: number }>("/notifications/read-all", { method: "POST" }),

  deleteNotification: (id: number) =>
    request<{ deleted: number }>(`/notifications/${id}`, { method: "DELETE" }),

  // ── Query ─────────────────────────────────────────────────────────────────
  query: (question: string, useDeepReasoning = false) =>
    request<QueryResponse>("/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, use_deep_reasoning: useDeepReasoning }),
    }),

  // ── Actions ───────────────────────────────────────────────────────────────
  listActions: (params?: { status?: string; priority?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Action[]>(`/actions${qs ? `?${qs}` : ""}`);
  },

  createAction: (data: Partial<Action>) =>
    request<Action>("/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  updateAction: (id: number, data: Partial<Action>) =>
    request<Action>(`/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteAction: (id: number) =>
    request<{ deleted: number }>(`/actions/${id}`, { method: "DELETE" }),

  // ── Risks ─────────────────────────────────────────────────────────────────
  listRisks: (status?: string) =>
    request<Risk[]>(`/risks${status ? `?status=${status}` : ""}`),

  createRisk: (data: Partial<Risk>) =>
    request<Risk>("/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  updateRisk: (id: number, data: Partial<Risk>) =>
    request<Risk>(`/risks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteRisk: (id: number) =>
    request<{ deleted: number }>(`/risks/${id}`, { method: "DELETE" }),

  // ── Deadlines ─────────────────────────────────────────────────────────────
  listDeadlines: (met?: boolean) =>
    request<Deadline[]>(`/deadlines${met !== undefined ? `?met=${met}` : ""}`),

  createDeadline: (data: Partial<Deadline>) =>
    request<Deadline>("/deadlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  updateDeadline: (id: number, data: Partial<Deadline>) =>
    request<Deadline>(`/deadlines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteDeadline: (id: number) =>
    request<{ deleted: number }>(`/deadlines/${id}`, { method: "DELETE" }),

  // ── Dependencies ──────────────────────────────────────────────────────────
  listDependencies: () => request<Dependency[]>("/dependencies"),

  createDependency: (data: Partial<Dependency>) =>
    request<Dependency>("/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteDependency: (id: number) =>
    request<{ deleted: number }>(`/dependencies/${id}`, { method: "DELETE" }),

  // ── Scope Items ───────────────────────────────────────────────────────────
  listScopeItems: (approved?: boolean) =>
    request<ScopeItem[]>(`/scope-items${approved !== undefined ? `?approved=${approved}` : ""}`),

  createScopeItem: (data: Partial<ScopeItem>) =>
    request<ScopeItem>("/scope-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  updateScopeItem: (id: number, data: Partial<ScopeItem>) =>
    request<ScopeItem>(`/scope-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteScopeItem: (id: number) =>
    request<{ deleted: number }>(`/scope-items/${id}`, { method: "DELETE" }),
};
