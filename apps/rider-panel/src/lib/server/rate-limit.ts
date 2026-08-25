/**
 * Rate Limiter — Sliding window, in-memory
 *
 * Two APIs:
 *   1. rateLimit(req, options) — for use in API route handlers (returns NextResponse or null)
 *   2. checkRateLimit(key, limit, windowMs) — generic key-based check for use anywhere
 *
 * NOTE: In-memory rate limiting resets on serverless cold starts. This is acceptable
 * for Vercel/Cloud Run because:
 *   - Cold starts are rare in production (warm instances handle most traffic)
 *   - It still provides burst protection within a single instance
 *   - For true distributed rate limiting, use Redis/Upstash (future improvement)
 *
 * The buckets map is periodically pruned to prevent memory leaks.
 */

import { NextRequest, NextResponse } from 'next/server';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Prune stale buckets every 5 minutes to prevent memory leaks
const PRUNE_INTERVAL_MS = 5 * 60_000;
let lastPruneAt = Date.now();

function pruneStaleBuckets() {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';

  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Rate limit check for API route handlers.
 * Returns a 429 NextResponse if rate limit exceeded, or null if allowed.
 */
export function rateLimit(
  req: NextRequest,
  options: {
    keyPrefix: string;
    limit: number;
    windowMs: number;
  }
) {
  pruneStaleBuckets();

  const now = Date.now();
  const key = `${options.keyPrefix}:${getClientIp(req)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  bucket.count += 1;

  if (bucket.count <= options.limit) return null;

  const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  return NextResponse.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}

/**
 * Generic key-based rate limit check (no NextRequest dependency).
 * Used by individual route handlers for custom keying strategies.
 *
 * @returns { allowed: boolean, retryAfterMs: number }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  pruneStaleBuckets();

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  bucket.count += 1;

  if (bucket.count <= limit) {
    return { allowed: true, retryAfterMs: 0 };
  }

  return { allowed: false, retryAfterMs: bucket.resetAt - now };
}
