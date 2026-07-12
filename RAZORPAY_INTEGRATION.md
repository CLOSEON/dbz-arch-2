# Razorpay Payment Gateway Integration Guide

This document describes the complete Razorpay integration for subscription and one-time payments in the Dabzzo application.

## Overview

The Razorpay integration provides:
- ✅ One-time payments for single meal orders
- ✅ Recurring subscriptions for weekly/monthly plans
- ✅ Webhook support for automatic payment status updates
- ✅ Payment history tracking
- ✅ Full audit trail for all transactions
- ✅ Signature verification for security
- ✅ Error handling and retry logic

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User Frontend (Next.js)                                 │
│  - SubscriptionOnboardingModal                           │
│  - Payment components                                    │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼─────────┐      ┌───────────▼──────────┐
│ Razorpay SDK    │      │ Backend API Routes   │
│ (checkout.js)   │      │ - /api/razorpay/*    │
└─────────────────┘      └───────────┬──────────┘
                                     │
        ┌────────────────────────────┴─────────────────┐
        │                                              │
┌───────▼────────────┐                  ┌──────────────▼──────────┐
│ Razorpay Service   │                  │ Firestore Database      │
│ - Create Order     │                  │ - subscriptions         │
│ - Create Sub       │◄────Webhook─────►│ - payment_subscriptions │
│ - Verify Payment   │                  │ - payment_history       │
└────────────────────┘                  └────────────────────────┘
```

## API Endpoints

### 1. Create Order (One-time Payment)
**Endpoint:** `POST /api/razorpay/create-order`

Creates a Razorpay order for one-time payment.

```json
{
  "amount": 5000,  // in paise (₹50)
  "currency": "INR",
  "receipt": "rcpt_user123_meal_123",
  "notes": {
    "user_id": "user123",
    "meal_id": "meal456",
    "type": "one_time"
  }
}
```

**Response:**
```json
{
  "order_id": "order_2024...",
  "amount": 5000,
  "currency": "INR"
}
```

### 2. Verify Payment
**Endpoint:** `POST /api/razorpay/verify-payment`

Verifies the payment signature and stores payment in history.

```json
{
  "razorpay_order_id": "order_2024...",
  "razorpay_payment_id": "pay_2024...",
  "razorpay_signature": "abcd1234..."
}
```

**Response:**
```json
{
  "success": true,
  "payment_id": "pay_2024...",
  "order_id": "order_2024...",
  "amount": 50,
  "currency": "INR"
}
```

### 3. Create Subscription (Recurring Payment)
**Endpoint:** `POST /api/razorpay/create-subscription`

Creates a Razorpay subscription for recurring meals.

```json
{
  "user_id": "user123",
  "vendor_id": "vendor456",
  "plan_id": "lunch",
  "meal_type": "lunch",
  "frequency": "weekly",  // or "monthly"
  "amount": 35000,  // in paise (₹350)
  "currency": "INR",
  "customer_email": "user@example.com",
  "customer_phone": "+91999999999",
  "customer_name": "John Doe"
}
```

**Response:**
```json
{
  "subscription_id": "sub_2024...",
  "status": "created",
  "amount": 35000,
  "currency": "INR",
  "period": "weekly",
  "interval": 1
}
```

### 4. Webhook Handler
**Endpoint:** `POST /api/razorpay/webhook`

Receives Razorpay webhook events and updates subscription/payment status.

**Supported Events:**
- `payment.authorized` - Payment successful
- `payment.failed` - Payment failed
- `subscription.authenticated` - User authenticated mandate
- `subscription.active` - Subscription active
- `subscription.paused` - Subscription paused
- `subscription.cancelled` - Subscription cancelled
- `subscription.resumed` - Subscription resumed

## Setting up Razorpay Webhooks

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings → Webhooks**
3. Add a new webhook with:
   - **URL:** `https://yourdomain.com/api/razorpay/webhook`
   - **Events:** Select all payment and subscription events
4. Copy the webhook secret and keep it safe

## Environment Variables

```env
# Razorpay Keys
RAZORPAY_KEY_ID=rzp_test_xxxxx          # Public key (safe to expose)
RAZORPAY_KEY_SECRET=xxxxxx              # Secret key (DO NOT expose)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxx  # For frontend

# Webhook Secret (if using webhooks)
RAZORPAY_WEBHOOK_SECRET=xxxxxx          # For signature verification
```

## Database Schema

### Collections

#### `subscriptions` (Main subscriptions)
```
{
  id: "sub_user123_vendor456_lunch",
  user_id: "user123",
  vendor_id: "vendor456",
  plan_id: "lunch",
  meal_type: "lunch",
  frequency: "weekly",
  status: "active",
  razorpay_subscription_id: "sub_2024...",  // Linked to Razorpay
  payment_id: "pay_2024...",  // Last payment ID
  paid_amount: 350,  // in ₹
  created_at: Timestamp,
  updated_at: Timestamp,
  cancelled_at?: Timestamp
}
```

#### `payment_subscriptions` (Razorpay subscription tracking)
```
{
  id: "rzp_sub_sub_2024...",
  razorpay_subscription_id: "sub_2024...",
  user_id: "user123",
  vendor_id: "vendor456",
  plan_id: "lunch",
  meal_type: "lunch",
  frequency: "weekly",
  amount: 350,  // in ₹
  currency: "INR",
  status: "active",  // created, authenticated, active, paused, cancelled
  customer_id?: "cust_2024...",
  customer_email?: "user@example.com",
  customer_phone?: "+91999999999",
  customer_name?: "John Doe",
  activated_at?: Timestamp,
  paused_at?: Timestamp,
  cancelled_at?: Timestamp,
  created_at: Timestamp,
  updated_at: Timestamp
}
```

#### `payment_history` (Payment records)
```
{
  id: "payment_pay_2024...",
  payment_id: "pay_2024...",
  order_id: "order_2024...",
  amount: 350,  // in ₹
  currency: "INR",
  status: "captured",  // authorized, captured, failed
  method: "upi",  // upi, card, netbanking, wallet
  vpa?: "user@okhdfcbank",
  email?: "user@example.com",
  contact?: "+91999999999",
  notes: { ... },
  created_at: Timestamp,
  updated_at: Timestamp
}
```

## Usage Examples

### 1. One-Time Payment Flow

```typescript
// Frontend
import { createRazorpayOrder, openRazorpayCheckout, verifyPaymentSignature } from '@/lib/razorpay';

async function handleOneTimePayment(amount: number) {
  try {
    // Step 1: Create order
    const { order_id } = await createRazorpayOrder(
      amount,
      `receipt_${Date.now()}`,
      { meal_id: 'meal123' }
    );

    // Step 2: Open checkout
    await openRazorpayCheckout({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      order_id,
      amount: amount * 100, // in paise
      customer_name: user.name,
      customer_email: user.email,
      callback: {
        onSuccess: async (response) => {
          // Step 3: Verify payment
          const verified = await verifyPaymentSignature(
            response.razorpay_payment_id,
            response.razorpay_order_id,
            response.razorpay_signature
          );
          
          if (verified) {
            // Payment successful
            addToast('Payment successful!', 'success');
          }
        },
        onFailure: (error) => {
          addToast(`Payment failed: ${error.description}`, 'error');
        }
      }
    });
  } catch (err) {
    addToast(err.message, 'error');
  }
}
```

### 2. Subscription Flow (with Modal)

```typescript
// Frontend
import { SubscriptionOnboardingModal } from '@/components/subscription/SubscriptionOnboardingModal';

const [isModalOpen, setIsModalOpen] = useState(false);

<SubscriptionOnboardingModal
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  vendor={vendor}
  initialPlanId="lunch"
  selectedFrequency="weekly"
  appliedDiscount={{ code: 'SAVE10', discount_pct: 10 }}
  onSuccess={() => {
    addToast('Subscription activated!', 'success');
    // Refresh user subscriptions
    loadSubscriptions();
  }}
/>
```

### 3. Query Payment History

```typescript
import { getUserPaymentHistory, getUserPaymentSummary } from '@/lib/queries/payments';

const paymentHistory = await getUserPaymentHistory(userId, 10);
const summary = await getUserPaymentSummary(userId);

console.log('Total spent:', summary.total_spent);
console.log('Active subscriptions:', summary.active_subscriptions);
```

### 4. Handle Webhook Event

```typescript
// Server-side (automatic)
// When Razorpay sends a webhook:
// 1. Signature is verified
// 2. Subscription status is updated in Firestore
// 3. Corresponding main subscription is synced
// 4. User is notified

// Example: payment.authorized
// - Creates record in payment_history
// - Updates payment_subscriptions status
// - Triggers next renewal calculation
```

## Testing

### Test Credentials
```
Key ID: rzp_test_TCHLigZ964kIK9
Key Secret: Mx3G4aX54LdlzNzysDNpoePu
```

### Test Payment Methods

#### Success Cases
- **Card:** 4111 1111 1111 1111
- **Expiry:** Any future date
- **CVV:** Any 3 digits
- **UPI:** success@razorpay

#### Failure Cases
- **Card:** 4000 0000 0000 0002
- **UPI:** failed@razorpay

### Testing Webhooks Locally

1. Install ngrok:
   ```bash
   brew install ngrok
   ```

2. Expose local server:
   ```bash
   ngrok http 3000
   ```

3. Configure webhook in Razorpay dashboard using ngrok URL:
   ```
   https://xxxxxx.ngrok.io/api/razorpay/webhook
   ```

4. Trigger test events from Razorpay dashboard

## Security Best Practices

✅ **DO:**
- Keep `RAZORPAY_KEY_SECRET` in server-side `.env` only
- Verify signatures on every webhook
- Use constant-time comparison for signatures
- Store payment history for audit trail
- Implement rate limiting on payment endpoints
- Validate all input data

❌ **DON'T:**
- Expose `RAZORPAY_KEY_SECRET` to frontend
- Skip signature verification
- Store sensitive data in notes
- Trust client-side payment status
- Process webhooks without verification

## Error Handling

```typescript
// Common Razorpay Errors

// Invalid amount (< ₹1)
if (amount < 100) { // paise
  throw new Error('Minimum amount is ₹1');
}

// Network error
catch (err) {
  if (err.message.includes('Failed to load')) {
    addToast('Network error. Please check internet connection.', 'error');
  }
}

// Payment failed
// Razorpay handles this automatically via webhook
```

## Monitoring & Debugging

### Check Payment Status
```bash
# In Razorpay Dashboard:
1. Go to Payments section
2. Search by payment ID or order ID
3. View transaction details
```

### Check Subscription Status
```bash
# In Razorpay Dashboard:
1. Go to Subscriptions section
2. Search by subscription ID
3. View billing history
```

### Monitor Firestore
```typescript
// Check payment_history collection
db.collection('payment_history')
  .orderBy('created_at', 'desc')
  .limit(10)
  .get()
  
// Check payment_subscriptions
db.collection('payment_subscriptions')
  .where('status', 'in', ['active', 'paused'])
  .get()
```

## Migration Guide (For Existing Payments)

If migrating from another payment gateway:

1. **Backup existing data:**
   ```bash
   firebase firestore export gs://backup-bucket
   ```

2. **Create payment_history records:**
   ```typescript
   // Import old payment records to payment_history collection
   // Ensure payment_id is unique
   ```

3. **Link subscriptions to Razorpay:**
   ```typescript
   // Update subscriptions with razorpay_subscription_id
   // Create corresponding payment_subscriptions docs
   ```

4. **Test thoroughly** before going live

## Support & Troubleshooting

### Issue: Payment not captured

**Solution:**
- Check Razorpay dashboard for payment status
- Verify webhook is configured and receiving events
- Check Firestore for payment_history records
- Check browser console for errors

### Issue: Signature verification failed

**Solution:**
- Ensure KEY_SECRET is correct
- Verify webhook signature in Razorpay dashboard
- Check timestamp skew
- Use time synchronization

### Issue: Subscription not activating

**Solution:**
- Check customer_id in Razorpay dashboard
- Verify amount is >= ₹1
- Check mandate authentication status
- Review webhook logs

## Resources

- [Razorpay Documentation](https://razorpay.com/docs)
- [Razorpay API Reference](https://razorpay.com/docs/api/)
- [Razorpay Webhooks](https://razorpay.com/docs/webhooks/)
- [Razorpay Subscriptions](https://razorpay.com/docs/subscriptions/)

## Contact

For payment-related issues, contact:
- Razorpay Support: support@razorpay.com
- Our Team: [your-email@dabzzo.com]
