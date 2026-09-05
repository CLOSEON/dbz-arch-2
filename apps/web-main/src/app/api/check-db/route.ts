import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json({
    success: true,
    status: 'ok',
    message: 'Check DB endpoint'
  });
}

