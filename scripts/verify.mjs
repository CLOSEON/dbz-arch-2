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

// `typecheck:apps` / `lint:apps` run `--workspaces`, which covers BOTH apps/*
// and packages/* — the package scripts were added on 2026-09-12 after the
// shared packages turned out never to have been typechecked or linted at all.
// That gap was hiding real runtime bugs (e.g. `await import('@/lib/firebase')`
// left behind in the query layer, which resolves in an app but not in a
// package). Keep every workspace covered here.
const steps = [
  { name: 'typecheck (apps + packages)', cmd: 'npm', args: ['run', 'typecheck:apps'] },
  { name: 'typecheck:functions', cmd: 'npm', args: ['run', 'typecheck:functions'] },
  { name: 'lint (apps + packages)', cmd: 'npm', args: ['run', 'lint:apps'] },
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
