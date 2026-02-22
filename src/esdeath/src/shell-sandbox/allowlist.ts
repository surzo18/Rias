import type { Tier } from '../shared/types.js';

interface CommandDef {
  tier: Tier;
  allowArgs: boolean;
  timeout: number;
  allowedPaths?: string[];
  allowedApps?: string[];
  maxCount?: number;
}

export const ALLOWLIST: Record<string, CommandDef> = {
  hostname:   { tier: 'safe',      allowArgs: false, timeout: 2000 },
  whoami:     { tier: 'safe',      allowArgs: false, timeout: 2000 },
  systeminfo: { tier: 'notice',    allowArgs: false, timeout: 10000 },
  tasklist:   { tier: 'notice',    allowArgs: false, timeout: 5000 },
  dir:        { tier: 'notice',    allowArgs: true,  timeout: 5000,
                allowedPaths: ['/mnt/documents', '/mnt/downloads'] },
  type:       { tier: 'notice',    allowArgs: true,  timeout: 5000,
                allowedPaths: ['/mnt/documents', '/mnt/downloads'] },
  copy:       { tier: 'dangerous', allowArgs: true,  timeout: 30000,
                allowedPaths: ['/mnt/downloads'] },
  move:       { tier: 'dangerous', allowArgs: true,  timeout: 30000,
                allowedPaths: ['/mnt/downloads'] },
  del:        { tier: 'dangerous', allowArgs: true,  timeout: 10000,
                allowedPaths: ['/mnt/downloads'] },
  mkdir:      { tier: 'dangerous', allowArgs: true,  timeout: 5000,
                allowedPaths: ['/mnt/downloads'] },
  start:      { tier: 'dangerous', allowArgs: true,  timeout: 10000,
                allowedApps: ['notepad', 'calc', 'explorer'] },
  ping:       { tier: 'notice',    allowArgs: true,  timeout: 10000,
                maxCount: 4 },
};

export function isAllowed(command: string): boolean {
  return command.toLowerCase() in ALLOWLIST;
}

export function getTier(command: string): Tier | null {
  const def = ALLOWLIST[command.toLowerCase()];
  return def?.tier ?? null;
}

export function getDef(command: string): CommandDef | null {
  return ALLOWLIST[command.toLowerCase()] ?? null;
}
