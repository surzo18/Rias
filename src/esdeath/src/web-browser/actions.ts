import type { Tier } from '../shared/types.js';
import { validateUrl } from './url-validator.js';

export type BrowserAction = 'search' | 'fetch_url' | 'screenshot' | 'extract';

interface ActionDef {
  tier: Tier;
  requiredParams: string[];
}

export const ACTIONS: Record<BrowserAction, ActionDef> = {
  search:     { tier: 'notice', requiredParams: ['query'] },
  fetch_url:  { tier: 'notice', requiredParams: ['url'] },
  screenshot: { tier: 'notice', requiredParams: ['url'] },
  extract:    { tier: 'notice', requiredParams: ['url'] },
};

// Common aliases that LLM agents try
const ACTION_ALIASES: Record<string, BrowserAction> = {
  fetch: 'fetch_url',
  get: 'fetch_url',
  open: 'fetch_url',
  visit: 'fetch_url',
  navigate: 'fetch_url',
  browse: 'fetch_url',
  web_search: 'search',
  google: 'search',
};

export function resolveAction(action: string): string {
  return ACTION_ALIASES[action] ?? action;
}

export function getActionTier(action: string): Tier {
  const resolved = resolveAction(action);
  const def = ACTIONS[resolved as BrowserAction];
  return def ? def.tier : 'forbidden';
}

export interface ActionParams {
  url: string;
  selector?: string;
}

export function buildActionParams(
  action: string,
  params: Record<string, unknown>,
): ActionParams {
  const resolved = resolveAction(action);
  const def = ACTIONS[resolved as BrowserAction];
  if (!def) {
    const available = Object.keys(ACTIONS).join(', ');
    throw new Error(`Unknown action: ${action}. Available actions: ${available}`);
  }
  // Use resolved action name from here
  action = resolved;

  for (const req of def.requiredParams) {
    if (params[req] === undefined || params[req] === null || params[req] === '') {
      throw new Error(`Missing required parameter: ${req}`);
    }
  }

  // Search is handled via SearXNG JSON API in server.ts, not via browser navigation.
  // buildActionParams is only called for URL validation; search doesn't need a URL.
  if (action === 'search') {
    return { url: '' };
  }

  const url = String(params.url);
  validateUrl(url);

  const result: ActionParams = { url };
  if (action === 'extract' && params.selector) {
    result.selector = String(params.selector);
  }

  return result;
}
