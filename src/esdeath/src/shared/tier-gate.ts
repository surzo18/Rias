import type { Request, Response, NextFunction } from 'express';
import { generateInternalToken } from './auth.js';
import type { Tier } from './types.js';

export interface TierGateConfig {
  tool: string;
  secret: string;
  auditDbUrl?: string;
  getRequestTier: (action: string, params: Record<string, unknown>) => Tier;
  timeoutMinutes?: number;
}

interface ApprovalResponse {
  id: string;
  state: string;
}

export function createTierGate(config: TierGateConfig) {
  const auditDbUrl = config.auditDbUrl ?? 'http://audit-db:9000';
  const timeoutMinutes = config.timeoutMinutes ?? 30;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { action, params = {}, approval_id } = req.body as {
      action: string;
      params?: Record<string, unknown>;
      approval_id?: string;
    };

    const tier = config.getRequestTier(action, params);

    if (tier === 'safe' || tier === 'notice') {
      next();
      return;
    }

    if (tier === 'forbidden') {
      res.status(403).json({
        request_id: (req.body as Record<string, unknown>).request_id ?? null,
        status: 'blocked',
        result: { error: `Action "${action}" is forbidden on ${config.tool}` },
        metadata: { duration_ms: 0, action, tier: 'forbidden' },
      });
      return;
    }

    // tier === 'dangerous'
    if (!approval_id) {
      // Create approval request
      try {
        const token = generateInternalToken(config.secret);
        const resp = await fetch(`${auditDbUrl}/approvals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: `${config.tool}:${action}`,
            tier: 'dangerous',
            params: JSON.stringify(params),
            reason: `${config.tool} requires approval for "${action}"`,
            timeout_minutes: timeoutMinutes,
          }),
        });

        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`audit-db returned ${resp.status}: ${body}`);
        }

        const approval = await resp.json() as ApprovalResponse;

        res.json({
          request_id: (req.body as Record<string, unknown>).request_id ?? null,
          status: 'approval_required',
          result: {
            approval_id: approval.id,
            message: `Action "${action}" requires approval. Approval ID: ${approval.id}`,
          },
          metadata: { duration_ms: 0, action, tier: 'dangerous' },
        });
      } catch (err) {
        res.status(500).json({
          request_id: (req.body as Record<string, unknown>).request_id ?? null,
          status: 'error',
          result: { error: `Failed to create approval: ${(err as Error).message}` },
          metadata: { duration_ms: 0, action, tier: 'dangerous' },
        });
      }
      return;
    }

    // Has approval_id — check its state
    try {
      const token = generateInternalToken(config.secret);
      const resp = await fetch(`${auditDbUrl}/approvals/${approval_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        throw new Error(`audit-db returned ${resp.status}`);
      }

      const approval = await resp.json() as ApprovalResponse;

      if (approval.state === 'approved') {
        // Transition to executing
        await fetch(`${auditDbUrl}/approvals/${approval_id}/resolve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ state: 'executing', resolved_by: config.tool }),
        });
        next();
        return;
      }

      // Any other state — block
      res.json({
        request_id: (req.body as Record<string, unknown>).request_id ?? null,
        status: 'blocked',
        result: {
          approval_id,
          state: approval.state,
          message: `Approval ${approval_id} is "${approval.state}", cannot proceed`,
        },
        metadata: { duration_ms: 0, action, tier: 'dangerous' },
      });
    } catch (err) {
      res.status(500).json({
        request_id: (req.body as Record<string, unknown>).request_id ?? null,
        status: 'error',
        result: { error: `Failed to check approval: ${(err as Error).message}` },
        metadata: { duration_ms: 0, action, tier: 'dangerous' },
      });
    }
  };
}
