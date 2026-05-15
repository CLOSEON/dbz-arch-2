// ─── Core Types ──────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'vendor' | 'delivery' | 'admin';

export interface AppUser {
  id: string;          // Firebase Auth UID
  name: string;
  phone: string;       // PRIMARY — 10-digit, always set
  role: UserRole;
  email?: string;      // Optional — admins only
  image?: string;
  is_approved?: boolean;
  is_rejected?: boolean;
  push_tokens?: string[];
  // Vendor-specific
  kitchen_name?: string;
  bio?: string;
  cuisine_type?: string;
  rate_lunch?: number;
  rate_dinner?: number;
  rate_both?: number;
  rating?: number;
  review_count?: number;
  rating_avg?: number;
  subscriberCount?: number;
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

export interface Subscription {
  id: string;
  user_id: string;
  vendor_id: string;
  plan_id: string;
  meal_type: MealType;
  status: SubscriptionStatus;
  created_at: FirestoreTimestamp;
  cancelled_at?: FirestoreTimestamp;
  cancelled_by?: string;
}

export interface SubscriptionPlan {
  id: string;
  title: string;
  price: number;
  frequency: string;
  meal_type: MealType;
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

// ─── Deliveries ──────────────────────────────────────────────────────────────
export type DeliveryStatus = 'pending' | 'picked_up' | 'delivered' | 'cancelled';

export interface Delivery {
  id: string;
  user_id: string;
  vendor_id: string;
  assigned_to: string;
  status: DeliveryStatus;
  customer_name: string;
  address: string;
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
