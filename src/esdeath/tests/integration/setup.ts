import { execSync } from 'node:child_process';

const PROJECT_DIR = 'D:/REPOS/tools/esdeath';
const NETWORK = 'esdeath-test';
const CONTAINERS = ['test-audit-db', 'test-shell-sandbox'];

function cleanup() {
  for (const name of CONTAINERS) {
    try { execSync(`docker stop ${name}`, { stdio: 'pipe', timeout: 10000 }); } catch { /* ignore */ }
    try { execSync(`docker rm ${name}`, { stdio: 'pipe', timeout: 10000 }); } catch { /* ignore */ }
  }
  try { execSync(`docker network rm ${NETWORK}`, { stdio: 'pipe', timeout: 10000 }); } catch { /* ignore */ }
}

export default function setup() {
  console.log('Building TypeScript...');
  execSync('npm run build', { cwd: PROJECT_DIR, stdio: 'inherit', timeout: 30000 });

  // Clean up any leftover containers from previous runs
  cleanup();

  // Create an isolated test network
  execSync(`docker network create ${NETWORK}`, { stdio: 'pipe' });

  console.log('Starting audit-db container...');
  execSync([
    'docker run -d',
    '--name test-audit-db',
    `--network ${NETWORK}`,
    '-p 127.0.0.1:9000:9000',
    '-e PORT=9000',
    '-e DB_PATH=/data/audit.db',
    '-e INTERNAL_SECRET=test-integration-secret',
    '--tmpfs /data:rw,noexec,nosuid,size=16m,uid=1000,gid=1000',
    '--read-only',
    'esdeath-audit-db',
  ].join(' '), { cwd: PROJECT_DIR, stdio: 'inherit', timeout: 30000 });

  console.log('Starting shell-sandbox container...');
  execSync([
    'docker run -d',
    '--name test-shell-sandbox',
    `--network ${NETWORK}`,
    '-p 127.0.0.1:9001:9001',
    '-e PORT=9001',
    '-e INTERNAL_SECRET=test-integration-secret',
    '--tmpfs /tmp:noexec,nosuid,size=16m',
    '--read-only',
    'esdeath-shell-sandbox',
  ].join(' '), { cwd: PROJECT_DIR, stdio: 'inherit', timeout: 30000 });

  console.log('Waiting for containers to start...');
  execSync('sleep 3', { stdio: 'inherit' });

  // Wait for health endpoints
  for (const port of [9000, 9001]) {
    let healthy = false;
    for (let i = 0; i < 15; i++) {
      try {
        execSync(`curl -sf http://127.0.0.1:${port}/health`, { stdio: 'pipe', timeout: 3000 });
        healthy = true;
        break;
      } catch {
        execSync('sleep 1', { stdio: 'pipe' });
      }
    }
    if (!healthy) {
      throw new Error(`Container on port ${port} failed to become healthy`);
    }
  }

  console.log('Integration test containers ready.');

  // Return teardown function
  return () => {
    console.log('Stopping integration test containers...');
    cleanup();
  };
}
