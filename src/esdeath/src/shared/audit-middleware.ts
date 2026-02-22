import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { generateInternalToken } from './auth.js';

interface AuditMiddlewareConfig {
  tool: string;
  auditUrl?: string;
  secret: string;
}

export function createAuditMiddleware(config: AuditMiddlewareConfig) {
  const auditUrl = config.auditUrl ?? 'http://audit-db:9000/log';

  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      const meta = (body as Record<string, unknown>)?.metadata as
        | Record<string, unknown>
        | undefined;

      if (meta) {
        const entry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          source: 'user',
          action: (meta.action as string) ?? 'unknown',
          tool: config.tool,
          tier: (meta.tier as string) ?? 'safe',
          params: JSON.stringify(
            (req.body as Record<string, unknown>)?.params ?? {},
          ),
          state:
            (body as Record<string, unknown>)?.status === 'success'
              ? 'success'
              : 'failed',
          result_summary: summarize(
            (body as Record<string, unknown>)?.result,
          ),
          error:
            (body as Record<string, unknown>)?.status === 'error'
              ? (((body as Record<string, unknown>)?.result as Record<string, unknown>)
                  ?.error as string) ?? null
              : null,
          duration_ms: (meta.duration_ms as number) ?? 0,
          llm_provider: null,
          tokens_used: 0,
          estimated_cost_usd: 0,
          approval_id: null,
        };

        const token = generateInternalToken(config.secret);
        fetch(auditUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(entry),
        }).catch((err) =>
          // eslint-disable-next-line no-console
          console.error('Audit log failed:', (err as Error).message),
        );
      }

      return originalJson(body);
    } as typeof res.json;

    next();
  };
}

function summarize(result: unknown): string | null {
  if (!result) return null;
  const str = JSON.stringify(result);
  return str.length > 200 ? str.slice(0, 197) + '...' : str;
}
