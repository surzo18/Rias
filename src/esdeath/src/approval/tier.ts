import type { Tier } from '../shared/types.js';

export interface TierConfig {
  actionMap: Map<string, Tier>;
  defaultTier: Tier;
}

interface RawTierConfig {
  tiers: Record<string, { actions: string[] }>;
  defaults: { unknown_action: string };
}

export function loadTierConfig(raw: RawTierConfig): TierConfig {
  const actionMap = new Map<string, Tier>();
  for (const [tier, def] of Object.entries(raw.tiers)) {
    for (const action of def.actions) {
      actionMap.set(action.toLowerCase(), tier as Tier);
    }
  }
  return {
    actionMap,
    defaultTier: (raw.defaults.unknown_action as Tier) ?? 'dangerous',
  };
}

export function classifyTier(action: string, config: TierConfig): Tier {
  return config.actionMap.get(action.toLowerCase()) ?? config.defaultTier;
}
