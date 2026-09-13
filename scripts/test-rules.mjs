#!/usr/bin/env node
/**
 * Runs the Firestore rules tests inside the emulator.
 *
 * Wraps `firebase emulators:exec` so the emulator is started and torn down
 * automatically. The emulator needs a JDK; Android Studio bundles one, so this
 * finds it rather than requiring java on PATH (it is not, on this machine).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function findJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = isWin
    ? [
        path.join(process.env.ProgramFiles || 'C:\Program Files', 'Android', 'Android Studio', 'jbr'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'),
      ]
    : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/usr/lib/jvm/default-java'];
  return candidates.find((c) => c && fs.existsSync(path.join(c, 'bin', isWin ? 'java.exe' : 'java')));
}

const javaHome = findJavaHome();
if (!javaHome) {
  console.error('No JDK found. The Firestore emulator needs one. Install Android Studio or set JAVA_HOME.');
  process.exit(1);
}
process.env.JAVA_HOME = javaHome;
process.env.PATH = path.join(javaHome, 'bin') + (isWin ? ';' : ':') + process.env.PATH;
console.log(`JAVA_HOME: ${javaHome}\n`);

try {
  execSync(
    'npx firebase emulators:exec --only firestore --project dabzofb-rules-test "npm test --workspace=@dabzzo/firestore-rules"',
    { cwd: root, stdio: 'inherit' }
  );
} catch {
  process.exitCode = 1;
}
