export type RiskTier = 'A' | 'B' | 'C';

export type RBACRole =
  | 'owner'
  | 'admin'
  | 'project-maintainer'
  | 'infra-approver'
  | 'viewer';

export type JobStatus =
  | 'queued'
  | 'waiting_human_decision'
  | 'running'
  | 'done'
  | 'failed'
  | 'dead_letter';

export type DataClassification = 'public' | 'internal' | 'sensitive';

export interface JobConstraints {
  data_classification: DataClassification;
  cost_limit_usd?: number;
  prefer_local?: boolean;
}

export interface JobRecord {
  job_id: string;
  idempotency_key: string;
  request_id: string;
  trace_id: string;
  actor_id: string;
  project_id: string;
  intent: string;
  risk_tier: RiskTier;
  requires_human_approval: boolean;
  constraints: JobConstraints;
  payload: Record<string, unknown>;
  status: JobStatus;
  created_at: string;
}

export interface PolicyDecision {
  risk_tier: RiskTier;
  requires_human_approval: boolean;
  reason: string;
}

export interface CapabilityProfile {
  agent_id: string;
  allowed_resources: string[];
  allowed_tools: string[];
  allowed_actions: string[];
  risk_limit: RiskTier;
}

export interface RoleBinding {
  actor_id: string;
  role: RBACRole;
  project_ids?: string[];
}

export interface HealthResponse {
  status: 'ok';
  uptime_s: number;
}
