import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimit } from '@/lib/server/rate-limit';

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, {
    keyPrefix: 'razorpay:create-vendor-account',
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const { vendor_id } = await req.json();

    if (!vendor_id) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay keys not configured' }, { status: 400 });
    }

    // 1. Fetch vendor from Firestore
    const vendorRef = adminDb.collection('users').doc(vendor_id);
    const vendorSnap = await vendorRef.get();
    
    if (!vendorSnap.exists) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }
    
    const vendorData = vendorSnap.data();

    if (vendorData?.rzp_account_id) {
      return NextResponse.json({ error: 'Vendor already has a Razorpay account linked' }, { status: 400 });
    }

    const bankDetails = vendorData?.bank_details;
    if (!bankDetails || !bankDetails.account_number || !bankDetails.ifsc || !bankDetails.beneficiary_name) {
      return NextResponse.json({ error: 'Vendor bank details are incomplete. Please update their profile.' }, { status: 400 });
    }

    // 2. Create Linked Account using Razorpay Route (Accounts V2 API via fetch)
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

    const payload = {
      email: vendorData.email || 'vendor@example.com',
      phone: (vendorData.phone || '').replace('+', ''),
      type: 'route',
      reference_id: vendor_id,
      legal_business_name: vendorData.kitchen_name || vendorData.name || 'Vendor Kitchen',
      contact_name: vendorData.name || 'Vendor Contact',
      profile: {
        category: 'food',
        subcategory: 'catering',
        addresses: {
          registered: {
            street1: vendorData.address || 'Vendor Address',
            city: 'City',
            state: 'State',
            postal_code: '110001',
            country: 'IN'
          }
        }
      },
      legal_info: {
        pan: 'ABCDE1234F' // In production, this should be collected from the vendor. 
      }
    };

    const response = await fetch('https://api.razorpay.com/v2/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Razorpay Route] Failed to create account:', data);
      return NextResponse.json({ error: data.error?.description || data.error?.message || 'Failed to create Razorpay account' }, { status: 400 });
    }

    const rzpAccountId = data.id;

    // 3. Add Bank Account to the newly created Razorpay Account
    const bankPayload = {
      beneficiary_name: bankDetails.beneficiary_name,
      ifsc_code: bankDetails.ifsc,
      account_number: bankDetails.account_number
    };

    const bankResponse = await fetch(`https://api.razorpay.com/v2/accounts/${rzpAccountId}/bank_account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(bankPayload)
    });

    const bankData = await bankResponse.json();
    
    if (!bankResponse.ok) {
      console.error('[Razorpay Route] Failed to add bank account:', bankData);
      // We still update the rzp_account_id so we don't lose the created account, but throw a warning
      await vendorRef.update({
        rzp_account_id: rzpAccountId,
        rzp_bank_status: 'failed',
        updated_at: new Date()
      });
      return NextResponse.json({ error: 'Account created, but failed to link bank details. Check IFSC/Account number.', partial_success: true }, { status: 400 });
    }

    // 4. Update vendor profile with new rzp_account_id
    await vendorRef.update({
      rzp_account_id: rzpAccountId,
      rzp_bank_status: 'active',
      platform_fee_pct: 10, // Default 10% platform fee
      updated_at: new Date()
    });

    return NextResponse.json({ success: true, account_id: rzpAccountId });

  } catch (err: any) {
    console.error('[Razorpay Route] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
