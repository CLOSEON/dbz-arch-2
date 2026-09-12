#!/usr/bin/env node
/**
 * verify.mjs
 *
 * Runs every check (typecheck × 5 apps + functions, lint × 5 apps, functions
 * tests) and reports a combined pass/fail summary — unlike chaining with
 * `&&`, a failing step here does NOT stop the rest from running. The point
 * of this script is "tell me everything that's broken," not "tell me about
 * the first thing that's broken."
 *
 * Usage: node scripts/verify.mjs
 * Exit code: 0 if every step passed, 1 if any step failed.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const steps = [
  { name: 'typecheck:apps', cmd: 'npm', args: ['run', 'typecheck:apps'] },
  { name: 'typecheck:functions', cmd: 'npm', args: ['run', 'typecheck:functions'] },
  { name: 'lint:apps', cmd: 'npm', args: ['run', 'lint:apps'] },
  { name: 'test:functions', cmd: 'npm', args: ['run', 'test:functions'] },
];

const results = [];

for (const step of steps) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${step.name}`);
  console.log('─'.repeat(60));
  const res = spawnSync(step.cmd, step.args, { cwd: root, stdio: 'inherit', shell: true });
  results.push({ name: step.name, ok: res.status === 0 });
}

console.log(`\n${'═'.repeat(60)}`);
console.log('VERIFY SUMMARY');
console.log('═'.repeat(60));
let allOk = true;
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}`);
  if (!r.ok) allOk = false;
}
console.log('═'.repeat(60));

process.exit(allOk ? 0 : 1);
