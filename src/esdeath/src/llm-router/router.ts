interface RoutingRule {
  match: Record<string, unknown>;
  model: string;
  fallback: string | null;
}

export interface RoutingConfig {
  rules: RoutingRule[];
  default_model: string;
}

export interface RoutingDecision {
  model: string;
  fallback: string | null;
  reason: string;
}

export function loadRoutingConfig(raw: {
  rules: RoutingRule[];
  default_model: string;
}): RoutingConfig {
  return raw;
}

function matchesRule(request: Record<string, unknown>, rule: RoutingRule): boolean {
  for (const [key, value] of Object.entries(rule.match)) {
    if (request[key] !== value) return false;
  }
  return true;
}

export function route(
  request: Record<string, unknown>,
  config: RoutingConfig,
): RoutingDecision {
  for (const rule of config.rules) {
    if (matchesRule(request, rule)) {
      return {
        model: rule.model,
        fallback: rule.fallback,
        reason: `Matched rule: ${JSON.stringify(rule.match)}`,
      };
    }
  }

  return {
    model: config.default_model,
    fallback: null,
    reason: 'No rule matched, using default',
  };
}
