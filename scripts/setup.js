import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';

const PROJECT_DIR = process.cwd();

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const name = await rl.question('Project name: ');
    if (!name || !name.trim()) {
      console.error('Project name is required.');
      process.exit(1);
    }

    const projectName = name.trim().toLowerCase().replace(/\s+/g, '-');

    // 1. Update package.json
    const pkgPath = join(PROJECT_DIR, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.name = projectName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated package.json name to "${projectName}"`);

    // 2. Update README.md title
    const readmePath = join(PROJECT_DIR, 'README.md');
    if (existsSync(readmePath)) {
      let readme = readFileSync(readmePath, 'utf8');
      readme = readme.replace(/^# Rias\b/m, `# ${projectName}`);
      readme = readme.replace(
        /Starter template pre Claude Code infrastrukturu\./,
        `Claude Code infrastruktura pre ${projectName}.`
      );
      writeFileSync(readmePath, readme);
      console.log('Updated README.md');
    }

    // 3. Reset learnings templates
    const learningsDir = join(PROJECT_DIR, '.claude', 'learnings');
    const templates = ['mistakes.md', 'patterns.md', 'decisions.md', 'token-usage.md'];
    for (const file of templates) {
      const filePath = join(learningsDir, file);
      if (existsSync(filePath)) {
        const title = file.replace('.md', '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
        writeFileSync(filePath, `# ${title}\n`);
      }
    }
    console.log('Reset learnings templates');

    // 4. Reset session counter
    const counterPath = join(PROJECT_DIR, '.claude', 'agent-memory', 'session-counter.json');
    if (existsSync(counterPath)) {
      writeFileSync(counterPath, JSON.stringify({ sessionCount: 0, lastAuditAt: 0, auditInterval: 100 }, null, 2) + '\n');
    }
    console.log('Reset session counter');

    // 5. Reset audit state
    const auditPath = join(PROJECT_DIR, '.claude', 'audits', 'latest.json');
    if (existsSync(auditPath)) {
      writeFileSync(auditPath, JSON.stringify({
        id: `audit-baseline-${projectName}`,
        date: new Date().toISOString().slice(0, 10),
        actions: []
      }, null, 2) + '\n');
    }
    console.log('Reset audit state');

    // 6. Fresh git
    const gitDir = join(PROJECT_DIR, '.git');
    if (existsSync(gitDir)) {
      rmSync(gitDir, { recursive: true, force: true });
    }
    try {
      execSync('git init', { cwd: PROJECT_DIR, stdio: 'pipe' });
      console.log('Initialized fresh git repository');
    } catch {
      console.log('Skipped git init (git not available)');
    }

    console.log(`\nDone! Run \`npm test\` to verify everything works.`);
  } finally {
    rl.close();
  }
}

main();
