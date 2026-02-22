import type { AuditLogRow } from './schema.js';

export interface TelegramConfig {
  botToken: string;
  channelId: string;
  enabled: boolean;
}

const TIER_EMOJI: Record<string, string> = {
  safe: '\u{1F7E2}',       // 🟢
  notice: '\u{1F7E1}',     // 🟡
  dangerous: '\u{1F534}',  // 🔴
  forbidden: '\u26D4',     // ⛔
};

const STATE_INDICATOR: Record<string, string> = {
  success: '\u2705',   // ✅
  failed: '\u274C',    // ❌
  blocked: '\u{1F6AB}', // 🚫
  timeout: '\u23F0',   // ⏰
};

export function formatAuditEntry(entry: AuditLogRow): string {
  const tierEmoji = TIER_EMOJI[entry.tier] ?? '\u2753'; // ❓
  const tierLabel = entry.tier.toUpperCase();
  const tool = entry.tool ?? 'system';

  const lines: string[] = [];

  // Line 1: tier + action + tool
  lines.push(`${tierEmoji} ${tierLabel} | ${entry.action} | ${tool}`);

  // Line 2: result summary (truncated)
  if (entry.result_summary) {
    const summary = entry.result_summary.length > 120
      ? entry.result_summary.slice(0, 117) + '...'
      : entry.result_summary;
    lines.push(`\u{1F4CB} Result: ${summary}`);
  }

  // Line 3: metadata
  const meta: string[] = [];
  meta.push(`\u23F1 ${entry.duration_ms}ms`);
  meta.push(`\u{1F464} ${entry.source}`);

  if (entry.llm_provider) {
    meta.push(`\u{1F916} ${entry.llm_provider}`);
  }

  if (entry.tokens_used > 0) {
    const cost = entry.estimated_cost_usd > 0
      ? ` (~$${entry.estimated_cost_usd.toFixed(4)})`
      : '';
    meta.push(`\u{1FA99} ${entry.tokens_used} tokens${cost}`);
  }

  // State indicator
  const stateIcon = STATE_INDICATOR[entry.state] ?? entry.state;
  if (entry.approval_id) {
    meta.push(`${stateIcon} approved (${entry.approval_id})`);
  } else if (entry.state !== 'success') {
    meta.push(stateIcon);
  }

  lines.push(meta.join(' | '));

  return lines.join('\n');
}

export async function sendToChannel(
  config: TelegramConfig,
  text: string,
): Promise<number | null> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.channelId,
      text,
      disable_notification: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API ${response.status}: ${body}`);
  }

  const data = await response.json() as { result?: { message_id?: number } };
  return data.result?.message_id ?? null;
}

export interface TelegramSender {
  enabled: boolean;
  send: (entry: AuditLogRow) => Promise<number | null>;
}

export function createTelegramSender(config: TelegramConfig): TelegramSender {
  if (!config.enabled || !config.botToken || !config.channelId) {
    return { enabled: false, send: async () => null };
  }

  return {
    enabled: true,
    send: async (entry: AuditLogRow): Promise<number | null> => {
      const text = formatAuditEntry(entry);
      return sendToChannel(config, text);
    },
  };
}
