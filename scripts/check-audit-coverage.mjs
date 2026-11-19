import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = path.resolve(process.cwd(), 'src', 'app', 'api');
const MUTATING_EXPORT_REGEX = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/;

// Routes that intentionally do not record application audit logs
const ALLOWLIST = new Set([
  'src/app/api/auth/[...nextauth]/route.ts',
  'src/app/api/auth/logout/route.ts',
]);

function walkRouteFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(fullPath, out);
    } else if (entry.isFile() && entry.name === 'route.ts') {
      out.push(fullPath);
    }
  }
  return out;
}

const routeFiles = walkRouteFiles(API_ROOT);
const missing = [];

for (const file of routeFiles) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  if (ALLOWLIST.has(rel)) continue;

  const content = fs.readFileSync(file, 'utf8');
  if (MUTATING_EXPORT_REGEX.test(content) && !content.includes('recordAuditLog')) {
    missing.push(rel);
  }
}

if (missing.length > 0) {
  console.error('❌ Mutating API routes missing recordAuditLog():');
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  process.exit(1);
}

console.log(`✅ Audit coverage check passed (${routeFiles.length} route files scanned).`);
