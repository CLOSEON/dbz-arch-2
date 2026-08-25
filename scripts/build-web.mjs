#!/usr/bin/env node
/**
 * build-web.mjs
 *
 * Builds static exports (output: 'export') for workspace apps in apps/*
 * If an app name argument is passed (e.g. `node scripts/build-web.mjs admin-panel`),
 * it builds ONLY that specific app. Otherwise, it builds all apps.
 *
 * Usage: 
 *   node scripts/build-web.mjs                # Builds all apps
 *   node scripts/build-web.mjs admin-panel    # Builds only admin-panel
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const appsDir = path.join(root, 'apps');

const targetApp = process.argv[2];
const allApps = ['web-main', 'admin-panel', 'vendor-panel', 'rider-panel', 'gig'];

const apps = targetApp ? [targetApp] : allApps;

console.log(`🚀 Starting static export builds for ${targetApp ? `app: ${targetApp}` : 'all workspace apps'}...\n`);

for (const appName of apps) {
  const appPath = path.join(appsDir, appName);
  if (!fs.existsSync(appPath)) {
    console.error(`❌ App "${appName}" does not exist in ${appsDir}`);
    continue;
  }

  console.log(`--------------------------------------------------`);
  console.log(`📦 Building static export for app: ${appName}...`);
  console.log(`--------------------------------------------------`);

  const apiDir = path.join(appPath, 'src', 'app', 'api');
  const apiBackup = path.join(appPath, 'src', 'app', '_api_backup');

  if (fs.existsSync(apiDir)) {
    console.log(`📁 Temporarily moving API routes out of the way for ${appName}...`);
    fs.renameSync(apiDir, apiBackup);
  }

  try {
    execSync('npm run build', { cwd: appPath, stdio: 'inherit' });
    console.log(`✅ ${appName} build complete! Output generated in apps/${appName}/out\n`);
  } catch (err) {
    console.error(`❌ Build failed for ${appName}:`, err.message);
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(apiBackup)) {
      console.log(`📁 Restoring API routes for ${appName}...`);
      if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true });
      fs.renameSync(apiBackup, apiDir);
    }
  }
}

console.log('\n🎉 Static export build completed successfully!');
