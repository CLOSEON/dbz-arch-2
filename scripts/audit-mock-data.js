const fs = require('fs');
const path = require('path');

const TARGET_DIRS = ['src/app', 'src/components'];
// We look specifically for exact variables that denote hardcoded mocked objects
const MOCK_PATTERNS = [
  /(?:const|let|var)\s+mock[A-Z][a-zA-Z0-9]*\s*=/g,
  /(?:const|let|var)\s+sample[A-Z][a-zA-Z0-9]*\s*=/g,
  /(?:const|let|var)\s+dummy[A-Z][a-zA-Z0-9]*\s*=/g,
  /require\(['"]\.\/.*\.json['"]\)/g,
  /import\s+.*from\s+['"].*\.json['"]/g
];

const EXCLUDED_FILES = ['.test.', '.spec.', 'audit-mock-data.js'];

let findings = [];

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      if (EXCLUDED_FILES.some(exclude => fullPath.includes(exclude))) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      let fileFindings = [];
      for (const pattern of MOCK_PATTERNS) {
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          fileFindings.push(...matches.map(m => m[0]));
        }
      }
      
      if (fileFindings.length > 0) {
        findings.push({ file: fullPath, issues: [...new Set(fileFindings)] });
      }
    }
  }
}

TARGET_DIRS.forEach(scanDir);

if (findings.length > 0) {
  console.log('DATA INTEGRITY AUDIT: FAILED ❌');
  console.log('The following files contain potential hardcoded mock data or static JSON:\n');
  findings.forEach(f => {
    console.log(`- ${f.file}`);
    f.issues.forEach(i => console.log(`    MATCH: ${i}`));
  });
  process.exit(1);
} else {
  console.log('DATA INTEGRITY AUDIT: PASSED ✅');
  console.log('No hardcoded mock variables (mock*, sample*, dummy*) or static JSON imports detected in UI components.');
}
