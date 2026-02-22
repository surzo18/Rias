import express from 'express';
import { execSync } from 'node:child_process';
import { verifyInternalToken } from '../shared/auth.js';
import { createTierGate } from '../shared/tier-gate.js';
import { createAuditMiddleware } from '../shared/audit-middleware.js';
import { ALLOWLIST, isAllowed, getDef } from './allowlist.js';
import { validateArgs, validatePath } from './validator.js';

const PORT = parseInt(process.env.PORT ?? '9001', 10);
const SECRET = process.env.INTERNAL_SECRET ?? '';
const startTime = Date.now();

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_s: Math.floor((Date.now() - startTime) / 1000) });
});

app.use(verifyInternalToken(SECRET));

app.get('/actions', (_req, res) => {
  res.json({
    actions: Object.entries(ALLOWLIST).map(([command, def]) => ({
      name: 'run_command',
      command,
      tier: def.tier,
      allow_args: def.allowArgs,
      allowed_paths: def.allowedPaths ?? null,
    })),
  });
});

app.use('/execute', createTierGate({
  tool: 'shell-sandbox',
  secret: SECRET,
  getRequestTier: (action, params) => {
    if (action !== 'run_command') return 'forbidden';
    const def = ALLOWLIST[String(params.command)];
    return def ? def.tier : 'forbidden';
  },
}));
app.use('/execute', createAuditMiddleware({ tool: 'shell-sandbox', secret: SECRET }));

app.post('/execute', (req, res) => {
  const { request_id, action, params } = req.body;
  const start = Date.now();

  if (action !== 'run_command') {
    const cmds = Object.keys(ALLOWLIST).join(', ');
    res.json({ request_id, status: 'error', result: { error: `Unknown action: ${action}. Only action is "run_command" with params {command, args}. Available commands: ${cmds}` },
      metadata: { duration_ms: Date.now() - start, action, tier: 'forbidden' } });
    return;
  }

  const { command, args = [] } = params as { command: string; args?: string[] };

  if (!isAllowed(command)) {
    res.json({ request_id, status: 'error', result: { error: `Command not in allowlist: ${command}` },
      metadata: { duration_ms: Date.now() - start, action, tier: 'forbidden' } });
    return;
  }

  const def = getDef(command)!;

  try {
    if (def.allowArgs && args.length > 0) {
      validateArgs(args);
      if (def.allowedPaths) {
        for (const arg of args) {
          if (arg.startsWith('/') && !validatePath(arg, def.allowedPaths)) {
            throw new Error(`Path not allowed: ${arg}`);
          }
        }
      }
    }

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const stdout = execSync(fullCommand, {
      timeout: def.timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
    });

    res.json({
      request_id,
      status: 'success',
      result: { stdout: stdout.trim() },
      metadata: { duration_ms: Date.now() - start, action: `shell:${command}`, tier: def.tier },
    });
  } catch (err) {
    res.json({
      request_id,
      status: 'error',
      result: { error: (err as Error).message },
      metadata: { duration_ms: Date.now() - start, action: `shell:${command}`, tier: def.tier },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`shell-sandbox listening on port ${PORT}`);
});
