// ── API response types matching the FastAPI backend ──────────────────────────

export interface Document {
  id: number;
  filename: string;
  doc_type: string;
  upload_date: string | null;
  has_content: boolean;
}

export interface Action {
  id: number;
  description: string;
  owner: string | null;
  due_date: string | null;
  status: "open" | "in_progress" | "done" | "blocked";
  priority: "high" | "medium" | "low";
  created_from_doc_id: number | null;
  created_at: string | null;
}

export interface Risk {
  id: number;
  description: string;
  impact: "high" | "medium" | "low";
  likelihood: "high" | "medium" | "low";
  mitigation: string | null;
  status: "open" | "mitigated" | "accepted" | "closed";
  created_at: string | null;
}

export interface Deadline {
  id: number;
  description: string;
  deadline_date: string;
  met: boolean;
  source_doc_id: number | null;
  created_at: string | null;
}

export interface Dependency {
  id: number;
  task_a: string;
  task_b: string;
  dependency_type: "blocks" | "enables" | "relates_to";
  notes: string | null;
  created_at: string | null;
}

export interface ScopeItem {
  id: number;
  description: string;
  source: "original_plan" | "change_request" | "meeting";
  approved: boolean;
  impact_assessment: string | null;
  added_date: string | null;
}

export interface Notification {
  id: number;
  type: "deadline" | "action" | "scope_change" | "risk";
  message: string;
  severity: "urgent" | "warning" | "info";
  read: boolean;
  created_at: string | null;
  related_id: number | null;
  related_type: "action" | "risk" | "deadline" | "scope_item" | null;
}

export interface NotificationsResponse {
  total: number;
  unread: number;
  notifications: Notification[];
}

export interface UploadResult {
  doc_id: number;
  filename: string;
  doc_type: string;
  counts: {
    actions: number;
    deadlines: number;
    risks: number;
    dependencies: number;
    scope_items: number;
  };
  summary: string;
  warning?: string;
}

export interface Citation {
  type: string;
  id: number;
  summary: string;
}

export interface QueryResponse {
  question: string;
  answer: string;
  model_used: string;
  citations: Citation[];
  answered_directly: boolean;
}

export interface BatchUploadResult {
  filename: string;
  success: boolean;
  doc_id?: number;
  extracted?: {
    actions: number;
    risks: number;
    deadlines: number;
    dependencies: number;
    scope_items: number;
  };
  warning?: string;
  error?: string;
}

export interface DocumentType {
  id: number;
  name: string;
  extraction_prompt: string;
  target_model: string;
  is_system: boolean;
}

export interface OllamaTestResult {
  connected: boolean;
  ollama_url: string;
  model_count?: number;
  models?: string[];
  error?: string;
}

export interface LlmStatus {
  ollama_running: boolean;
  ollama_url: string;
  models_available: string[];
  configured_models: {
    extraction: string;
    qa: string;
    reasoning: string;
  };
  models_ready: {
    extraction: boolean;
    qa: boolean;
    reasoning: boolean;
  };
  missing_models?: string[];
  pull_commands?: string[];
  warning?: string;
}
