import { execSync } from 'node:child_process';

export default function teardown() {
  console.log('Stopping integration test containers...');
  for (const name of ['test-audit-db', 'test-shell-sandbox']) {
    try { execSync(`docker stop ${name}`, { stdio: 'pipe', timeout: 10000 }); } catch { /* ignore */ }
    try { execSync(`docker rm ${name}`, { stdio: 'pipe', timeout: 10000 }); } catch { /* ignore */ }
  }
  try { execSync('docker network rm esdeath-test', { stdio: 'pipe', timeout: 10000 }); } catch { /* ignore */ }
}
