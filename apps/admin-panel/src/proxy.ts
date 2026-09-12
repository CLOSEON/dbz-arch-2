import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimit } from './lib/server/rate-limit';

// Malicious user agents blocklist
const BLOCKED_USER_AGENTS = [
  'sqlmap',
  'nikto',
  'dirbuster',
  'nmap',
  'python-requests',
  'curl',
  'wget',
  'masscan',
  'zgrab'
];

export async function proxy(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  const path = request.nextUrl.pathname;

  // 1. Block known malicious user agents (case-insensitive check)
  const isBlockedUA = BLOCKED_USER_AGENTS.some((ua) =>
    userAgent.toLowerCase().includes(ua)
  );
  if (isBlockedUA) {
    return new NextResponse('Access Denied', { status: 403 });
  }

  // 2. Body size protection for POST/PUT/PATCH requests at middleware level
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    // Hard limit of 2MB for any request body in the application
    if (contentLength > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Payload too large (Max 2MB)' }, { status: 413 });
    }
  }

  // 3. Global rate limiting on API routes
  if (path.startsWith('/api/')) {
    // Ignore webhook endpoint in general IP rate limiter since Razorpay sends bursts,
    // webhook has its own signature verification and checks.
    if (!path.startsWith('/api/razorpay/webhook')) {
      const response = rateLimit(request, {
        keyPrefix: 'global-api',
        limit: 60, // 60 requests
        windowMs: 60_000, // per minute
      });

      if (response) {
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - assets/ (public assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
  ],
};
