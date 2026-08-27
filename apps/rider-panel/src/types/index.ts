// ─── Core Types ──────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'vendor' | 'delivery' | 'admin';

export type DietaryCategory = 'veg' | 'non_veg';

export interface VendorAddon {
  id: string;
  name: string;
  monthly_price: number;
  weekly_price?: number;
  onetime_price?: number;
  active: boolean;
  description?: string;
}

export interface SelectedAddon {
  id: string;
  name: string;
  monthly_price: number;
  weekly_price?: number;
  onetime_price?: number;
  price_paid: number;
}

export interface AppUser {
  id: string;          // Firebase Auth UID
  name: string;
  phone: string;       // 10-digit, required for on-ground operations (set during onboarding)
  role: UserRole;
  email?: string;      // Provided from social auth (Google, Apple, Facebook)
  image?: string;      // Profile photo from social provider
  is_superadmin?: boolean; // Only closeon.st@gmail.com
  is_approved?: boolean;
  is_rejected?: boolean;
  push_tokens?: string[];
  location?: { lat: number; lng: number; updated_at: number };
  address?: string;
  deliveryPreference?: '8am' | '11am';
  // Vendor-specific
  kitchen_name?: string;
  bio?: string;
  cuisine_type?: string;
  // Dietary categories supported: ['veg'] | ['non_veg'] | ['veg', 'non_veg']
  dietary_categories?: DietaryCategory[];
  // One-time: flat price per meal (no lunch/dinner distinction)
  rate_onetime?: number;
  // Weekly subscription rates per meal type
  rate_lunch_weekly?: number;
  rate_dinner_weekly?: number;
  rate_both_weekly?: number;
  // Monthly subscription rates per meal type
  rate_lunch_monthly?: number;
  rate_dinner_monthly?: number;
  rate_both_monthly?: number;

  // 🌿 Pure Veg Specific Rates
  rate_veg_onetime?: number;
  rate_veg_lunch_weekly?: number;
  rate_veg_dinner_weekly?: number;
  rate_veg_both_weekly?: number;
  rate_veg_lunch_monthly?: number;
  rate_veg_dinner_monthly?: number;
  rate_veg_both_monthly?: number;

  // 🍗 Non-Veg Specific Rates
  rate_nonveg_onetime?: number;
  rate_nonveg_lunch_weekly?: number;
  rate_nonveg_dinner_weekly?: number;
  rate_nonveg_both_weekly?: number;
  rate_nonveg_lunch_monthly?: number;
  rate_nonveg_dinner_monthly?: number;
  rate_nonveg_both_monthly?: number;

  // Vendor Add-Ons (Sweets, sides, extras)
  addons?: VendorAddon[];

  // Legacy fields kept for backward compat
  rate_lunch?: number;
  rate_dinner?: number;
  rate_both?: number;
  rating?: number;
  review_count?: number;
  rating_avg?: number;
  subscriberCount?: number;
  capacity?: number;
  capacityUnlimited?: boolean;
  // Razorpay Route (Settlements)
  rzp_account_id?: string;
  bank_details?: {
    account_number: string;
    ifsc: string;
    beneficiary_name: string;
  };
  platform_fee_pct?: number;
  // Partner Verification
  verification_status?: 'pending' | 'details_requested' | 'verified' | 'rejected';
  admin_note?: string;
  requested_fields?: string[];
  fssai_license?: string;
  vehicle_type?: string;
  vehicle_number?: string;
  license_number?: string;
  created_at?: FirestoreTimestamp;
  updated_at?: FirestoreTimestamp;
}

export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export interface Vendor extends AppUser {
  subscriberCount?: number;
  startingPrice?: number | null;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'cancelled';
export type MealType = 'lunch' | 'dinner' | 'both';

export type SubscriptionFrequency = 'one-time' | 'weekly' | 'monthly';

export interface Subscription {
  id: string;
  user_id: string;
  vendor_id: string;
  plan_id: string;
  meal_type: MealType;
  category?: DietaryCategory;
  frequency?: SubscriptionFrequency;
  status: SubscriptionStatus;
  price?: number; // current rate in ₹ — set when vendor updates meal rates
  selected_addons?: SelectedAddon[];
  base_price?: number;
  addons_price?: number;
  total_price?: number;
  paid_amount?: number;
  payment_id?: string;
  razorpay_order_id?: string;
  discount_pct?: number;
  promo_code?: string;
  created_at: FirestoreTimestamp;
  next_billing_date?: FirestoreTimestamp;
  cancelled_at?: FirestoreTimestamp;
  cancelled_by?: string;
}

export interface SubscriptionPlan {
  id: string;
  title: string;
  price: number;
  frequency: string;
  meal_type: MealType;
  category?: DietaryCategory;
  vendor_id?: string;
}

export interface EnrichedSubscription extends Subscription {
  userName?: string;
  userPhone?: string;
  vendorName?: string;
  vendorImage?: string;
  planTitle?: string;
  planPrice?: number;
  planFrequency?: string;
  createdMs?: number;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  vendor_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  review_text?: string;
  created_at: FirestoreTimestamp;
}

// ─── Support Tickets ─────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface TicketReply {
  from_role: UserRole | 'admin';
  from_name: string;
  message: string;
  timestamp: FirestoreTimestamp;
}

export interface SupportTicket {
  id: string;
  submitter_id: string;
  submitter_name: string;
  role: UserRole;
  subject: string;
  message: string;
  status: TicketStatus;
  replies: TicketReply[];
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

// ─── Daily Menu ──────────────────────────────────────────────────────────────

export interface MenuItem {
  name: string;
  description?: string;
}

export interface DailyMenu {
  id: string;
  vendor_id: string;
  date: string; // YYYY-MM-DD
  items: MenuItem[];
  note?: string;
  items_veg?: MenuItem[];
  items_non_veg?: MenuItem[];
  note_veg?: string;
  note_non_veg?: string;
}

// ─── Discount Codes ──────────────────────────────────────────────────────────

export interface DiscountCode {
  id: string;
  code: string;
  discount_pct: number;
  active: boolean;
  vendor_id?: string;
  created_at: FirestoreTimestamp;
}

// ─── Orders (Canonical DBZ V2 Schema - Prompt 1) ──────────────────────────────

export type OrderStatus = 
  | 'created' 
  | 'vendor_notified' 
  | 'vendor_preparing' 
  | 'vendor_ready' 
  | 'rider_assigned' 
  | 'rider_en_route_pickup' 
  | 'picked_up' 
  | 'out_for_delivery' 
  | 'delivered' 
  | 'skipped' 
  | 'swapped_out' 
  | 'swapped_in' 
  | 'failed' 
  | 'completed';

export interface Order {
  id: string;                  // format: ORD-{date}-{sequence}
  user_id: string;
  date: string;                // YYYY-MM-DD
  meal_type: MealType;
  delivery_slot: string;       // '8am', '11am', '8pm'
  vendor_id?: string;          // Nullable until batch assignment
  batch_id?: string;           // Nullable until batch assignment, FK to Batch
  delivery_address: string;    // Snapshot at order creation
  status: OrderStatus;
  swap_ref?: string;           // Nullable, FK to SwapRequest
  skip_ref?: string;           // Nullable, FK to SkipRecord
  rider_trip_id?: string;      // Nullable, FK once assigned
  legacy_order_id?: string;    // Traceability for migration
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

export interface OrderStatusLog {
  id: string;
  order_id: string;
  from_status?: OrderStatus;
  to_status: OrderStatus;
  actor: string;               // e.g., 'system', user_id, vendor_id, driver_id
  timestamp: FirestoreTimestamp;
}

// ─── Batches (Order Grouping) ────────────────────────────────────────────────

export type BatchStatus = 'pending' | 'notified' | 'preparing' | 'ready' | 'pickup_in_progress' | 'completed';

export interface Batch {
  id: string;                   // Format: BATCH-{vendor_id}-{date}-{slot}
  vendor_id: string;
  date: string;                 // YYYY-MM-DD
  slot: string;                 // '8am', '11am', '8pm'
  order_ids: string[];          // Array of FKs to Order
  status: BatchStatus;
  total_count: number;          // Active (non-skipped) meal count
  last_notified_count: number;  // Tracks skip updates for debounced vendor notifications
  pickup_otp?: string;          // OTP for rider pickup
  dispatch_attempts?: number;
  current_radius?: number;
  dispatch_started_at?: FirestoreTimestamp;
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

// ─── Deliveries (Legacy - Deprecated) ────────────────────────────────────────
export type DeliveryStatus = 'pending' | 'picked_up' | 'delivered' | 'cancelled';

export interface Delivery {
  id: string;
  user_id: string;
  vendor_id: string;
  assigned_to: string;
  status: DeliveryStatus;
  customer_name: string;
  address: string;
  lat?: number;
  lng?: number;
  vendor_name: string;
  meal_type: MealType;
  time_slot: string;
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// ─── Swaps & Credits ─────────────────────────────────────────────────────────

export type SwapRequestStatus = 'broadcasted' | 'matched' | 'expired' | 'company_fulfilled';

export interface SwapRequest {
  id: string;
  initiator_user_id: string;
  initiator_subscription_id: string;
  meal_id: string; // The specific day's tiffin meal ID
  status: SwapRequestStatus;
  is_paid: boolean;
  payment_amount?: number; // e.g., default 50
  created_at: FirestoreTimestamp;
  matched_with_user_id?: string;
  matched_at?: FirestoreTimestamp;
  target_vendor_id?: string; // NEW: the vendor selected for instant swap
}

export type SwapRecipientResponse = 'pending' | 'accepted' | 'declined' | 'expired';

export interface SwapBroadcastRecipient {
  id: string;
  swap_request_id: string;
  recipient_user_id: string;
  distance_km: number;
  meal_snapshot: any; // Full details of the meal being broadcasted
  response: SwapRecipientResponse;
  responded_at?: FirestoreTimestamp;
}

export type UserCreditSource = 'swap_accept' | 'cancellation';

export interface UserCredit {
  id: string;
  user_id: string;
  credit_amount: number; // Decimal (e.g., 0.3, 0.5, 1.0)
  source: UserCreditSource;
  source_reference_id: string; // swap_request_id or cancellation_id
  created_at: FirestoreTimestamp;
  redeemed: boolean;
  redeemed_at?: FirestoreTimestamp;
}

export interface SubscriptionSwapAllowance {
  id: string;
  subscription_id: string;
  plan_type: 'lunch_only' | 'lunch_dinner';
  free_swaps_total: number; // 1 for lunch_only, 2 for lunch_dinner
  free_swaps_used: number;
}

export interface FreeMealVoucher {
  id: string;
  user_id: string;
  status: 'available' | 'used';
  created_at: FirestoreTimestamp;
  used_at?: FirestoreTimestamp;
}

export type AuditLogType = 'swap_initiated' | 'swap_matched' | 'credit_earned' | 'credit_redeemed' | 'delivery_cancelled' | 'undo_skip';

export interface AuditLog {
  id: string;
  type: AuditLogType;
  user_id: string;
  target_user_id?: string;
  amount?: number;
  metadata?: any;
  created_at: FirestoreTimestamp;
}
