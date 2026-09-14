#!/usr/bin/env node
/**
 * sync-env.mjs
 *
 * Next.js loads .env/.env.local from process.cwd(), not the monorepo root.
 * Since `next dev`/`next build` run with cwd set to each app's own directory
 * (apps/<name>), a root-level .env is invisible to every app unless it's
 * copied down first. This script does that copy.
 *
 * Copied files are gitignored (see .gitignore: .env*) — this never commits
 * secrets, it only makes local/CI builds actually see the root config.
 *
 * Usage:
 *   node scripts/sync-env.mjs              # sync into all apps/*
 *   node scripts/sync-env.mjs web-main      # sync into a single app
 *
 * Also invoked automatically via each app's `predev`/`prebuild` script
 * (cwd = apps/<name>, so it resolves the root two levels up).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve monorepo root: if invoked as `node scripts/sync-env.mjs` from repo
// root, __dirname is <root>/scripts. If invoked as `node ../../scripts/sync-env.mjs`
// from apps/<name> (predev/prebuild hook), __dirname is still <root>/scripts
// because Node resolves the script path, not the cwd. Either way root = ../.
const root = path.resolve(__dirname, '..');
const appsDir = path.join(root, 'apps');

const ENV_FILES = ['.env', '.env.local'];

function syncOne(appName) {
  const appPath = path.join(appsDir, appName);
  if (!fs.existsSync(appPath)) {
    console.error(`sync-env: app "${appName}" not found at ${appPath}`);
    return false;
  }
  let copied = 0;
  for (const file of ENV_FILES) {
    const src = path.join(root, file);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(appPath, file);
    fs.copyFileSync(src, dest);
    copied++;
  }
  if (copied > 0) {
    console.log(`sync-env: ${appName} ← ${copied} file(s)`);
  }
  return true;
}

const arg = process.argv[2];
if (arg) {
  syncOne(arg);
} else {
  const allApps = fs.readdirSync(appsDir).filter((d) =>
    fs.statSync(path.join(appsDir, d)).isDirectory()
  );
  for (const appName of allApps) syncOne(appName);
}
