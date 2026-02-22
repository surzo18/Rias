export type Tier = 'safe' | 'notice' | 'dangerous' | 'forbidden';

export type ApprovalState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'timed_out'
  | 'executing'
  | 'success'
  | 'failed';

export interface ToolRequest {
  request_id: string;
  action: string;
  params: Record<string, unknown>;
  timeout_ms?: number;
}

export interface ToolResponse {
  request_id: string;
  status: 'success' | 'error' | 'approval_required' | 'blocked';
  result: Record<string, unknown>;
  metadata: {
    duration_ms: number;
    action: string;
    tier: Tier;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  source: 'user' | 'cron' | 'heartbeat' | 'system';
  action: string;
  tool: string | null;
  tier: Tier;
  params: Record<string, unknown>;
  state: 'success' | 'failed' | 'blocked' | 'pending' | 'timeout';
  result_summary: string;
  error: string | null;
  duration_ms: number;
  llm_provider: string | null;
  tokens_used: number;
  estimated_cost_usd: number;
  approval_id: string | null;
}

export interface ApprovalRecord {
  id: string;
  action: string;
  tier: Tier;
  params: string;
  reason: string | null;
  state: ApprovalState;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  execution_result: string | null;
  error: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  uptime_s: number;
}
