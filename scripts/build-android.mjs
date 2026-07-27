#!/usr/bin/env node
/**
 * build-android.mjs
 *
 * Builds a static export (output: 'export') for Capacitor Android/iOS.
 * API routes are incompatible with static export, so this script temporarily
 * moves src/app/api → src/app/_api_backup during the build, then restores it.
 *
 * Usage: node scripts/build-android.mjs
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const nextConfigPath = path.join(root, 'next.config.ts');
const apiDir = path.join(root, 'src', 'app', 'api');
const apiBackup = path.join(root, 'src', 'app', '_api_backup');

const originalConfig = fs.readFileSync(nextConfigPath, 'utf8');

// Inject output: 'export' temporarily
const exportConfig = originalConfig.replace(
  'const nextConfig: NextConfig = {',
  "const nextConfig: NextConfig = {\n  output: 'export',"
);

console.log('🔧 Setting output: export in next.config.ts...');
fs.writeFileSync(nextConfigPath, exportConfig);

console.log('📁 Temporarily moving API routes out of the way...');
if (fs.existsSync(apiDir)) {
  fs.renameSync(apiDir, apiBackup);
}

try {
  console.log('📦 Building static export...');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });

  console.log('📱 Syncing to Android...');
  execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });

  console.log('✅ Android build complete! The out/ directory has been synced to the Android project.');
} catch (err) {
  console.error('❌ Build or sync failed:', err.message);
  process.exitCode = 1;
} finally {
  // Always restore API routes and config
  if (fs.existsSync(apiBackup)) {
    console.log('📁 Restoring API routes...');
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true });
    fs.renameSync(apiBackup, apiDir);
  }
  console.log('🔄 Restoring next.config.ts...');
  fs.writeFileSync(nextConfigPath, originalConfig);
  console.log('✅ Cleanup complete.');
}
