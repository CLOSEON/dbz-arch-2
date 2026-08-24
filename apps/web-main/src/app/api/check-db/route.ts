import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  try {
    const usersSnap = await adminDb.collection('users').get();
    const users = usersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({
      success: true,
      count: users.length,
      users: users.map((u: any) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        is_approved: u.is_approved,
        is_rejected: u.is_rejected,
        cuisine_type: u.cuisine_type,
        location: u.location
      }))
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
