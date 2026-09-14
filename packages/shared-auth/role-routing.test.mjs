/**
 * Role-based routing regression test.
 *
 * A redirect loop is a graph property, not a page property: each role gets an
 * edge `role -> paths[role]` from a login page, and the destination sits behind
 * one or more AuthGuards. The loop exists exactly when a destination's guard
 * rejects the role that was just sent there. So this test checks edges against
 * guards, and deliberately models the fact that a route can sit behind MORE
 * THAN ONE guard (web-main wraps every non-public page in UserAppShell from the
 * ROOT layout, and /dashboard again in the (user) group layout) -- missing the
 * outer one is what let the original loop survive a fix to the inner one.
 *
 * computeIsAllowed is imported from the real auth-guard.tsx (sliced out and
 * type-stripped by Node) rather than reimplemented, so drift cannot hide here.
 *
 * Run: node packages/shared-auth/role-routing.test.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// -- Load the real computeIsAllowed -------------------------------------------
// auth-guard.tsx is JSX, which Node cannot type-strip; but every routing
// decision lives in the pure-TS region above the component. Slice exactly that.
const guardSrc = read('packages/shared-auth/src/auth-guard.tsx');
const start = guardSrc.indexOf('const SUPERADMIN_EMAIL');
const end = guardSrc.indexOf('export function AuthGuard');
if (start < 0 || end < 0) throw new Error('auth-guard.tsx shape changed: cannot slice pure region');

const slice = [
  'interface AuthGuardUser { email?: string | null; role?: string | null;',
  '  is_superadmin?: boolean; roles?: Record<string, unknown> | null; }',
  guardSrc.slice(start, end),
].join('\n');
const tmp = join(mkdtempSync(join(tmpdir(), 'dabzzo-guard-')), 'guard.ts');
writeFileSync(tmp, slice);
const { computeIsAllowed } = await import(pathToFileURL(tmp).href);

// -- Scrape the guards actually present in the source --------------------------
// Scraped, not hardcoded: if someone widens or narrows a guard, this test picks
// up the new value and the matrix below fails loudly instead of going stale.
const toRoles = (csv) =>
  csv.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

function scrapeGuard(file) {
  const src = read(file);
  // Inline form: allowedRoles={['a', 'b']}
  const inline = src.match(/allowedRoles=\{\[([^\]]*)\]\}/);
  if (inline) return toRoles(inline[1]);
  // Indirect form: allowedRoles={SOME_CONST}, with SOME_CONST declared above.
  const ref = src.match(/allowedRoles=\{(\w+)\}/);
  if (ref) {
    const decl = src.match(new RegExp(`const\\s+${ref[1]}[^=]*=\\s*\\[([^\\]]*)\\]`));
    if (decl) return toRoles(decl[1]);
    // Declared as undefined => authenticated-only (AuthGuard still requires a user).
    if (new RegExp(`const\\s+${ref[1]}[^=]*=\\s*undefined`).test(src)) return [];
    throw new Error(`allowedRoles={${ref[1]}} in ${file} but could not resolve ${ref[1]}`);
  }
  throw new Error(`no AuthGuard allowedRoles found in ${file}`);
}

const G = {
  webRootShell: scrapeGuard('apps/web-main/src/components/UserAppShell.tsx'),
  webUserGroup: scrapeGuard('apps/web-main/src/app/(user)/layout.tsx'),
  adminPanel:   scrapeGuard('apps/admin-panel/src/components/AdminAppShell.tsx'),
  vendorPanel:  scrapeGuard('apps/vendor-panel/src/components/VendorAppShell.tsx'),
  riderPanel:   scrapeGuard('apps/rider-panel/src/components/RiderAppShell.tsx'),
};

// web-main's ROOT layout wraps every non-public page in UserAppShell, so a page
// in the (user) group must satisfy BOTH guards. Model that as a guard stack.
//
// The (admin) group is the important asymmetry: it has NO layout.tsx of its own
// and its pages contain no role check, so web-main's /admin/* routes are gated
// by the root shell ALONE. Whatever roles that one list names is exactly who can
// open the admin screens. Assert that here rather than assuming a second guard.
const adminGroupGuards = [G.webRootShell];
const adminGroupLayout = join(ROOT, 'apps/web-main/src/app/(admin)/layout.tsx');
if (existsSync(adminGroupLayout)) adminGroupGuards.push(scrapeGuard('apps/web-main/src/app/(admin)/layout.tsx'));

const ROUTES = {
  '/dashboard (web-main)':  [G.webRootShell, G.webUserGroup],
  '/admin/* (web-main)':    adminGroupGuards,
  'admin-panel/*':          [G.adminPanel],
  'vendor-panel/*':         [G.vendorPanel],
  'rider-panel/*':          [G.riderPanel],
};
const admits = (route, user) => ROUTES[route].every((roles) => computeIsAllowed(user, roles));

// -- Role fixtures (shapes the app actually writes to Firestore) ---------------
const USERS = {
  'user':                   { role: 'user',     email: 'u@example.com' },
  // functions/src/authTriggers.ts onUserCreate seeds users/{uid}.role with the
  // literal 'customer' -- a string outside the declared UserRole union, absent
  // from the login `paths` map and from every guard list. Real accounts carry
  // it, so it is a first-class fixture, not a hypothetical.
  'customer':               { role: 'customer', email: 'c@example.com' },
  'vendor':                 { role: 'vendor',   email: 'v@example.com', roles: { vendor: { status: 'verified' } } },
  'vendor (no roles map)':  { role: 'vendor',   email: 'v2@example.com' },
  'delivery':               { role: 'delivery', email: 'd@example.com', roles: { rider: { status: 'verified' } } },
  'delivery_agent':         { role: 'delivery_agent', email: 'd2@example.com' },
  'admin':                  { role: 'admin',    email: 'a@example.com' },
  'superadmin':             { role: 'superadmin', email: 'closeon.st@gmail.com', is_superadmin: true },
  'superadmin (role only)': { role: 'superadmin', email: 'sa2@example.com' },
};

// -- Login redirect edges, scraped from web-main's login page ------------------
const loginSrc = read('apps/web-main/src/app/(auth)/login/page.tsx');
const pathsBlock = loginSrc.slice(loginSrc.indexOf('const paths'), loginSrc.indexOf('router.replace(paths'));
const EDGES = Object.fromEntries(
  [...pathsBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
);

const results = [];
const check = (name, actual, expected) =>
  results.push({ name, ok: actual === expected, got: actual, want: expected });

// -- 1. Guard matrix: who may enter what --------------------------------------
const MATRIX = [
  // [role,                   route,                    allowed?]
  ['user',                    '/dashboard (web-main)',  true],
  ['customer',                '/dashboard (web-main)',  true],
  ['vendor',                  '/dashboard (web-main)',  true],
  ['vendor (no roles map)',   '/dashboard (web-main)',  true],
  ['delivery',                '/dashboard (web-main)',  true],
  ['delivery_agent',          '/dashboard (web-main)',  true],
  ['admin',                   '/dashboard (web-main)',  true],
  ['superadmin',              '/dashboard (web-main)',  true],
  ['superadmin (role only)',  '/dashboard (web-main)',  true],

  // Least privilege: only admin/superadmin reach web-main's own /admin/* pages.
  ['user',                    '/admin/* (web-main)',    false],
  ['customer',                '/admin/* (web-main)',    false],
  ['vendor',                  '/admin/* (web-main)',    false],
  ['delivery',                '/admin/* (web-main)',    false],
  ['delivery_agent',          '/admin/* (web-main)',    false],
  ['admin',                   '/admin/* (web-main)',    true],
  ['superadmin',              '/admin/* (web-main)',    true],
  ['superadmin (role only)',  '/admin/* (web-main)',    true],

  // Least privilege: only admin/superadmin reach the standalone admin panel.
  ['user',                    'admin-panel/*',          false],
  ['customer',                'admin-panel/*',          false],
  ['customer',                'vendor-panel/*',         false],
  ['customer',                'rider-panel/*',          false],
  ['vendor',                  'admin-panel/*',          false],
  ['vendor (no roles map)',   'admin-panel/*',          false],
  ['delivery',                'admin-panel/*',          false],
  ['delivery_agent',          'admin-panel/*',          false],
  ['admin',                   'admin-panel/*',          true],
  ['superadmin',              'admin-panel/*',          true],
  ['superadmin (role only)',  'admin-panel/*',          true],

  ['user',                    'vendor-panel/*',         false],
  ['delivery',                'vendor-panel/*',         false],
  ['vendor',                  'vendor-panel/*',         true],
  ['admin',                   'vendor-panel/*',         true],

  ['user',                    'rider-panel/*',          false],
  ['vendor',                  'rider-panel/*',          false],
  ['delivery',                'rider-panel/*',          true],
  ['delivery_agent',          'rider-panel/*',          true],
  ['admin',                   'rider-panel/*',          true],
];
for (const [role, route, want] of MATRIX) {
  check(`${role.padEnd(23)} -> ${route.padEnd(27)}`, admits(route, USERS[role]), want);
}

// -- 2. No redirect loop: every login edge lands somewhere that admits it ------
const DEST_ROUTE = {
  '/dashboard': '/dashboard (web-main)',
  '/admin/dashboard': '/admin/* (web-main)',
};
for (const [role, dest] of Object.entries(EDGES)) {
  const route = DEST_ROUTE[dest];
  if (!route) { check(`no-loop: ${role} -> ${dest} (destination not modelled)`, false, true); continue; }
  check(`no-loop: login sends ${role.padEnd(9)} -> ${dest.padEnd(17)} which admits them`,
    admits(route, USERS[role]), true);
}
// Roles with no explicit edge fall through to `|| '/dashboard'`.
for (const role of ['customer', 'delivery_agent', 'superadmin', 'superadmin (role only)']) {
  check(`no-loop: ${role.padEnd(23)} falls through -> /dashboard  which admits them`,
    admits('/dashboard (web-main)', USERS[role]), true);
}

// -- 3. Unauthenticated / role-less must never be admitted --------------------
check('null user is denied /dashboard', admits('/dashboard (web-main)', null), false);
check('user with no role is denied admin-panel', admits('admin-panel/*', { email: 'x@y.com' }), false);

// -- Report -------------------------------------------------------------------
console.log('\nGuards as scraped from source:');
for (const [k, v] of Object.entries(G)) console.log(`  ${k.padEnd(13)} [${v.join(', ')}]`);
console.log(`\nLogin edges: ${Object.entries(EDGES).map((e) => `${e[0]}->${e[1]}`).join('  ')}\n`);

for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `   got ${r.got}, want ${r.want}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
