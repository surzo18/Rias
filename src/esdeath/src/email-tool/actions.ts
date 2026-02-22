import { execSync } from 'node:child_process';
import type { Tier } from '../shared/types.js';

export type EmailAction =
  | 'list_unread'
  | 'search'
  | 'read_email'
  | 'send_email'
  | 'calendar_today'
  | 'calendar_week'
  | 'calendar_create';

interface ActionDef {
  tier: Tier;
  requiredParams: string[];
}

export const ACTIONS: Record<EmailAction, ActionDef> = {
  list_unread:     { tier: 'notice',    requiredParams: [] },
  search:          { tier: 'notice',    requiredParams: ['query'] },
  read_email:      { tier: 'notice',    requiredParams: ['message_id'] },
  send_email:      { tier: 'dangerous', requiredParams: ['to', 'subject', 'body'] },
  calendar_today:  { tier: 'notice',    requiredParams: [] },
  calendar_week:   { tier: 'notice',    requiredParams: [] },
  calendar_create: { tier: 'dangerous', requiredParams: ['title', 'start', 'end'] },
};

const VALID_ACCOUNTS = new Set(['primary', 'work', 'spam']);

export function getActionTier(action: string): Tier {
  const def = ACTIONS[action as EmailAction];
  return def ? def.tier : 'forbidden';
}

export function resolveAccount(account: string | undefined): string {
  if (!account || account === '') return 'primary';
  if (!VALID_ACCOUNTS.has(account)) {
    throw new Error(`Unknown account: ${account}`);
  }
  return account;
}

export function buildGogArgs(action: string, params: Record<string, unknown>): string[] {
  const account = resolveAccount(params.account as string | undefined);

  switch (action) {
    case 'list_unread':
      return ['mail', 'list', '--account', account, '--unread', '--max', String(params.max_results ?? 20)];

    case 'search':
      return ['mail', 'search', '--account', account, '--query', String(params.query)];

    case 'read_email':
      return ['mail', 'read', '--account', account, '--id', String(params.message_id)];

    case 'send_email':
      return [
        'mail', 'send', '--account', account,
        '--to', String(params.to),
        '--subject', String(params.subject),
        '--body', String(params.body),
      ];

    case 'calendar_today':
      return ['calendar', 'today', '--account', account];

    case 'calendar_week':
      return ['calendar', 'week', '--account', account];

    case 'calendar_create': {
      const args = [
        'calendar', 'create', '--account', account,
        '--title', String(params.title),
        '--start', String(params.start),
        '--end', String(params.end),
      ];
      if (params.description) {
        args.push('--description', String(params.description));
      }
      return args;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export function parseGogOutput(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // fall through to plain text
    }
  }
  return { output: stdout };
}

export function executeAction(
  action: string,
  params: Record<string, unknown>,
  gogPath: string = 'gog',
): { tier: Tier; result: Record<string, unknown> } {
  const tier = getActionTier(action);
  if (tier === 'forbidden') {
    throw new Error(`Unknown action: ${action}`);
  }

  const def = ACTIONS[action as EmailAction];
  for (const req of def.requiredParams) {
    if (params[req] === undefined || params[req] === null || params[req] === '') {
      throw new Error(`Missing required parameter: ${req}`);
    }
  }

  const args = buildGogArgs(action, params);
  const stdout = execSync(`${gogPath} ${args.join(' ')}`, {
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    encoding: 'utf-8',
  });

  return { tier, result: parseGogOutput(stdout) };
}
