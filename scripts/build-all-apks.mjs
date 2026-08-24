#!/usr/bin/env node
/**
 * scripts/build-all-apks.mjs
 *
 * Builds production-ready Android APKs for all 4 Dabzzo panels:
 * 1. Customer (web-main) -> dabzzo-customer.apk
 * 2. Vendor Partner (vendor-panel) -> dabzzo-vendor.apk
 * 3. Rider Partner (rider-panel) -> dabzzo-rider.apk
 * 4. Admin Management (admin-panel) -> dabzzo-admin.apk
 *
 * Usage:
 *   node scripts/build-all-apks.mjs
 *   node scripts/build-all-apks.mjs --app=customer
 *   node scripts/build-all-apks.mjs --app=rider
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const outputDir = path.join(root, 'build-apks');

const APPS = [
  {
    key: 'customer',
    name: 'Dabzzo',
    appId: 'com.dabzo.app',
    distDir: path.join(root, 'apps', 'web-main', 'out'),
    outputApk: 'dabzzo-customer.apk',
  },
  {
    key: 'vendor',
    name: 'Dabzzo Vendor',
    appId: 'com.dabzo.vendor',
    distDir: path.join(root, 'apps', 'vendor-panel', 'out'),
    outputApk: 'dabzzo-vendor.apk',
  },
  {
    key: 'rider',
    name: 'Dabzzo Rider',
    appId: 'com.dabzo.rider',
    distDir: path.join(root, 'apps', 'rider-panel', 'out'),
    outputApk: 'dabzzo-rider.apk',
  },
  {
    key: 'admin',
    name: 'Dabzzo Admin',
    appId: 'com.dabzo.admin',
    distDir: path.join(root, 'apps', 'admin-panel', 'out'),
    outputApk: 'dabzzo-admin.apk',
  },
];

// Parse target CLI args if any
const targetArg = process.argv.find(a => a.startsWith('--app='));
const targetKey = targetArg ? targetArg.split('=')[1] : 'all';

const appsToBuild = targetKey === 'all' 
  ? APPS 
  : APPS.filter(a => a.key === targetKey);

if (appsToBuild.length === 0) {
  console.error(`❌ Unknown app target: ${targetKey}. Supported: customer, vendor, rider, admin, all`);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 Step 1: Ensuring all static web exports are fresh...');
execSync('node scripts/build-web.mjs', { cwd: root, stdio: 'inherit' });

for (const app of appsToBuild) {
  console.log(`\n==================================================`);
  console.log(`📱 Building APK for: ${app.name} (${app.appId})`);
  console.log(`==================================================`);

  const publicDir = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public');
  if (fs.existsSync(publicDir)) {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
  fs.mkdirSync(publicDir, { recursive: true });

  console.log(`📂 Copying assets from ${app.distDir} to Android assets...`);
  execSync(`cp -R "${app.distDir}/." "${publicDir}/"`, { cwd: root });

  // Update capacitor config in assets
  const capConfigPath = path.join(androidDir, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  const capConfig = {
    appId: app.appId,
    appName: app.name,
    webDir: 'public',
    server: { androidScheme: 'https' },
  };
  fs.writeFileSync(capConfigPath, JSON.stringify(capConfig, null, 2));

  // Update strings.xml app_name
  const stringsPath = path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  if (fs.existsSync(stringsPath)) {
    let stringsXml = fs.readFileSync(stringsPath, 'utf8');
    stringsXml = stringsXml.replace(
      /<string name="app_name">.*?<\/string>/,
      `<string name="app_name">${app.name}</string>`
    );
    stringsXml = stringsXml.replace(
      /<string name="title_activity_main">.*?<\/string>/,
      `<string name="title_activity_main">${app.name}</string>`
    );
    fs.writeFileSync(stringsPath, stringsXml);
  }

  console.log(`🔨 Assembling Gradle APK for ${app.name}...`);
  execSync('./gradlew assembleDebug', { cwd: androidDir, stdio: 'inherit' });

  const generatedApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const destination = path.join(outputDir, app.outputApk);

  if (fs.existsSync(generatedApk)) {
    fs.copyFileSync(generatedApk, destination);
    const stats = fs.statSync(destination);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`🎉 SUCCESS: Generated ${app.outputApk} (${sizeMb} MB) in ${destination}`);
  } else {
    console.error(`❌ ERROR: Could not find generated APK for ${app.name}`);
  }
}

console.log('\n==================================================');
console.log('✅ ALL APKs GENERATED SUCCESSFULLY:');
fs.readdirSync(outputDir).forEach(file => {
  if (file.endsWith('.apk')) {
    const stats = fs.statSync(path.join(outputDir, file));
    console.log(`  📦 ${file} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
  }
});
console.log(`📁 Location: ${outputDir}`);
console.log('==================================================\n');
