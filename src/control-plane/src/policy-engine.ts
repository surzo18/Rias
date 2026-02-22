import type { PolicyDecision, RiskTier } from './types.js';

interface TierRule {
  tier: RiskTier;
  requires_human_approval: boolean;
  reason: string;
}

const TIER_C_PREFIXES = [
  'infra.',
  'schema.',
  'delete.',
  'deploy.',
  'security.',
  'secret.',
  'kill.',
  'policy.',
];

const TIER_A_PREFIXES = [
  'query.',
  'read.',
  'list.',
  'get.',
  'health.',
  'status.',
];

function matchesPrefix(intent: string, prefixes: string[]): boolean {
  const lower = intent.toLowerCase();
  return prefixes.some((p) => lower.startsWith(p));
}

function resolveRule(intent: string): TierRule {
  if (matchesPrefix(intent, TIER_C_PREFIXES)) {
    return {
      tier: 'C',
      requires_human_approval: true,
      reason: `intent '${intent}' matches high-risk prefix — mandatory human approval`,
    };
  }

  if (matchesPrefix(intent, TIER_A_PREFIXES)) {
    return {
      tier: 'A',
      requires_human_approval: false,
      reason: `intent '${intent}' matches low-risk prefix — auto-run`,
    };
  }

  return {
    tier: 'B',
    requires_human_approval: false,
    reason: `intent '${intent}' is unclassified — defaulting to Tier B with guardrails`,
  };
}

export function classifyIntent(intent: string): PolicyDecision {
  const rule = resolveRule(intent);
  return {
    risk_tier: rule.tier,
    requires_human_approval: rule.requires_human_approval,
    reason: rule.reason,
  };
}
