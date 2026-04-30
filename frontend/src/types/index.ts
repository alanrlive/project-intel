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
  reference_id: string | null;
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
  reference_id: string | null;
  created_at: string | null;
}

export interface Deadline {
  id: number;
  description: string;
  deadline_date: string;
  met: boolean;
  reference_id: string | null;
  source_doc_id: number | null;
  created_at: string | null;
}

export interface Dependency {
  id: number;
  task_a: string;
  task_b: string;
  dependency_type: "blocks" | "enables" | "relates_to";
  notes: string | null;
  reference_id: string | null;
  created_at: string | null;
}

export interface ScopeItem {
  id: number;
  description: string;
  source: "original_plan" | "original" | "change_request" | "meeting" | "deferred";
  approved: boolean;
  impact_assessment: string | null;
  reference_id: string | null;
  added_date: string | null;
}

export interface RaidItemHistory {
  id: number;
  item_type: "action" | "risk" | "deadline" | "dependency" | "scope_item";
  item_id: number;
  reference_id: string | null;
  description: string;
  status: string | null;
  source_document_id: number | null;
  changed_at: string | null;
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

export interface IntakeFile {
  filename: string;
  size_bytes: number;
  path: string;
}

export interface IntakeScanResult {
  configured: boolean;
  path: string | null;
  files: IntakeFile[];
  error?: string;
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

export interface RoleAssignment {
  model: string;
  context: number;
  system_prompt: string;
  timeout: number;
}

export interface ModelAssignments {
  extraction: RoleAssignment;
  general:    RoleAssignment;
  reasoning:  RoleAssignment;
}

export interface VectorStatus {
  status: 'connected' | 'disconnected';
  total_docs: number;
}

export interface RebuildResult {
  status: 'complete';
  embedded: number;
  failed: number;
  total: number;
}

export interface BackupDestination {
  label: string;
  path: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  hour: number;
  minute: number;
}

export interface BackupConfig {
  enabled: boolean;
  destinations: BackupDestination[];
  schedule: BackupScheduleConfig;
}

export interface BackupEntry {
  filename: string;
  path: string;
  size_bytes: number;
  size_mb: number;
  timestamp: string;
  destination: string;
}

export interface BackupCreateResult {
  filename: string;
  size_bytes: number;
  size_mb: number;
  destinations_written: string[];
  destinations_skipped: string[];
  timestamp: string;
}

export interface BackupRestoreResult {
  restored: boolean;
  filename: string;
  message: string;
}

export interface LlmStatus {
  ollama_running: boolean;
  ollama_url: string;
  models_available: string[];
  configured_models: ModelAssignments;
  models_ready: {
    extraction: boolean;
    general: boolean;
    reasoning: boolean;
  };
  missing_models?: string[];
  pull_commands?: string[];
  warning?: string;
}
