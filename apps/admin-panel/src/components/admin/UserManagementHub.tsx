'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Phone,
  Mail,
  Shield,
  CreditCard,
  Utensils,
  Calendar,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  XCircle,
  Plus,
  Minus,
  Coins,
  ArrowRight,
  Sparkles,
  Building2,
  Copy,
  ExternalLink,
  ChevronRight,
  Check,
  RotateCcw,
  IndianRupee,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllUsers, getApprovedVendors } from '@/lib/queries/users';
import {
  getUserSubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  activateExternalSubscription,
  type ExternalSubscriptionParams
} from '@/lib/queries/subscriptions';
import { useAuthStore } from '@/store/authStore';
import { formatDate, cn } from '@/lib/utils';
import type { AppUser, Vendor, Subscription } from '@/types';

const WEEKDAYS = [
  { full: 'monday', short: 'Mon' },
  { full: 'tuesday', short: 'Tue' },
  { full: 'wednesday', short: 'Wed' },
  { full: 'thursday', short: 'Thu' },
  { full: 'friday', short: 'Fri' },
  { full: 'saturday', short: 'Sat' },
  { full: 'sunday', short: 'Sun' },
];

export function UserManagementHub() {
  const adminUser = useAuthStore((s) => s.user);

  // ── States ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'vendor' | 'delivery' | 'admin'>('all');
  const [subscriberFilter, setSubscriberFilter] = useState<'all' | 'subscribers'>('all');

  // Selected User Cockpit
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [userSubs, setUserSubs] = useState<Subscription[]>([]);
  const [userCredits, setUserCredits] = useState<any[]>([]);
  const [userAllowances, setUserAllowances] = useState<any[]>([]);
  const [loadingUserDetails, setLoadingUserDetails] = useState<boolean>(false);

  // Adjust Credits & Swaps
  const [creditAdjustment, setCreditAdjustment] = useState<number>(1);

  // External Subscription Activation Modal
  const [showExternalModal, setShowExternalModal] = useState<boolean>(false);
  const [submittingExternal, setSubmittingExternal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedUid, setCopiedUid] = useState<boolean>(false);

  // External Plan Form State
  const [extPlanType, setExtPlanType] = useState<'custom_weekly' | 'custom_monthly' | 'standard'>('custom_weekly');
  const [extBillingCycle, setExtBillingCycle] = useState<'weekly' | 'monthly'>('weekly');
  const [extMealType, setExtMealType] = useState<'lunch' | 'dinner' | 'both'>('both');
  const [extDietary, setExtDietary] = useState<'veg' | 'non_veg'>('veg');
  const [extWeeklyPattern, setExtWeeklyPattern] = useState<Record<string, number>>({
    monday: 1,
    tuesday: 1,
    wednesday: 1,
    thursday: 1,
    friday: 1,
    saturday: 2,
    sunday: 2,
  });
  const [extMonthlyMealCount, setExtMonthlyMealCount] = useState<number>(24);
  const [extPricePerMeal, setExtPricePerMeal] = useState<number>(50);
  const [extCustomTotalPrice, setExtCustomTotalPrice] = useState<string>('');
  const [extPaymentMethod, setExtPaymentMethod] = useState<
    'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'card_pos' | 'other'
  >('upi');
  const [extTransactionId, setExtTransactionId] = useState<string>('');
  const [extPaymentNotes, setExtPaymentNotes] = useState<string>('');
  const [extVendorId, setExtVendorId] = useState<string>('');
  const [extVendorCostPerMeal, setExtVendorCostPerMeal] = useState<number>(35);
  const [extStartDate, setExtStartDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] // tomorrow
  );
  const [extDeliverySlot, setExtDeliverySlot] = useState<string>('lunch');

  // ── 1. Initial Load: Users & Vendors ─────────────────────────────────────────
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [allUsers, allVendors] = await Promise.all([
        getAllUsers(),
        getApprovedVendors(),
      ]);
      setUsers(allUsers);
      setVendors(allVendors);
      if (allVendors.length > 0 && !extVendorId) {
        setExtVendorId(allVendors[0].id);
      }
    } catch (err) {
      console.error('[UserManagementHub] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── 2. Select User & Fetch Subscriptions / Credits ───────────────────────────
  const selectUser = async (user: AppUser) => {
    setSelectedUser(user);
    setLoadingUserDetails(true);
    try {
      const [subs, creditsSnap, allowancesSnap] = await Promise.all([
        getUserSubscriptions(user.id),
        getDocs(query(collection(db, 'user_credits'), where('user_id', '==', user.id))),
        getDocs(query(collection(db, 'subscription_swap_allowances'), where('user_id', '==', user.id))),
      ]);
      setUserSubs(subs);
      setUserCredits(creditsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUserAllowances(allowancesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('[UserManagementHub] selectUser error:', err);
    } finally {
      setLoadingUserDetails(false);
    }
  };

  // ── 3. Filtered Users ────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;

      // Subscriber filter
      if (subscriberFilter === 'subscribers') {
        if (!u.is_active_subscriber && u.membership_status !== 'active') return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (u.name || '').toLowerCase().includes(q);
        const matchesPhone = (u.phone || '').includes(q);
        const matchesEmail = (u.email || '').toLowerCase().includes(q);
        const matchesId = (u.id || '').toLowerCase().includes(q);
        return matchesName || matchesPhone || matchesEmail || matchesId;
      }
      return true;
    });
  }, [users, roleFilter, subscriberFilter, search]);

  // ── 4. Calculations for External Modal ───────────────────────────────────────
  const computedMealsCount = useMemo(() => {
    if (extPlanType === 'custom_weekly') {
      return Object.values(extWeeklyPattern).reduce((a, b) => a + (Number(b) || 0), 0);
    }
    if (extPlanType === 'custom_monthly') {
      return extMonthlyMealCount;
    }
    // Standard: 1 meal/day = 7 weekly / 30 monthly, or 2 meals/day for 'both'
    const multiplier = extMealType === 'both' ? 2 : 1;
    return (extBillingCycle === 'monthly' ? 30 : 7) * multiplier;
  }, [extPlanType, extWeeklyPattern, extMonthlyMealCount, extBillingCycle, extMealType]);

  const computedTotalCustomerPrice = useMemo(() => {
    if (extCustomTotalPrice.trim() !== '') {
      const parsed = Number(extCustomTotalPrice);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return computedMealsCount * extPricePerMeal;
  }, [computedMealsCount, extPricePerMeal, extCustomTotalPrice]);

  const computedTotalVendorPayable = useMemo(() => {
    return computedMealsCount * extVendorCostPerMeal;
  }, [computedMealsCount, extVendorCostPerMeal]);

  // ── 5. Actions on Subscriptions ──────────────────────────────────────────────
  const handlePauseSubscription = async (sub: Subscription) => {
    try {
      await pauseSubscription(sub.id, selectedUser?.id);
      setNotification({ text: `Subscription paused successfully.`, type: 'success' });
      if (selectedUser) selectUser(selectedUser);
    } catch (err) {
      setNotification({ text: `Could not pause subscription.`, type: 'error' });
    }
  };

  const handleResumeSubscription = async (sub: Subscription) => {
    try {
      await resumeSubscription(sub.id, selectedUser?.id);
      setNotification({ text: `Subscription resumed successfully!`, type: 'success' });
      if (selectedUser) selectUser(selectedUser);
    } catch (err) {
      setNotification({ text: `Could not resume subscription.`, type: 'error' });
    }
  };

  const handleCancelSubscription = async (sub: Subscription) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;
    try {
      await cancelSubscription(sub.id, 'admin', selectedUser?.id);
      setNotification({ text: `Subscription cancelled.`, type: 'success' });
      if (selectedUser) selectUser(selectedUser);
    } catch (err) {
      setNotification({ text: `Could not cancel subscription.`, type: 'error' });
    }
  };

  // ── 6. Adjust Credits & Swaps ────────────────────────────────────────────────
  const handleAdjustCredits = async (amount: number) => {
    if (!selectedUser) return;
    try {
      const creditRef = doc(collection(db, 'user_credits'));
      await setDoc(creditRef, {
        id: creditRef.id,
        user_id: selectedUser.id,
        credit_amount: amount,
        source: 'admin_manual_adjustment',
        source_reference_id: adminUser?.id || 'admin',
        redeemed: false,
        created_at: serverTimestamp(),
      });
      setNotification({
        text: `Adjusted user credits by ${amount > 0 ? `+${amount}` : amount}!`,
        type: 'success',
      });
      selectUser(selectedUser);
    } catch (err) {
      setNotification({ text: 'Failed to adjust credits.', type: 'error' });
    }
  };

  const handleAdjustSwaps = async (subId: string, count: number) => {
    if (!selectedUser) return;
    try {
      const allowanceRef = doc(db, 'subscription_swap_allowances', subId);
      const snap = await getDoc(allowanceRef);
      if (snap.exists()) {
        const data = snap.data();
        const current = data.free_swaps_total || 0;
        await updateDoc(allowanceRef, {
          free_swaps_total: Math.max(0, current + count),
          updated_at: serverTimestamp(),
        });
      } else {
        await setDoc(allowanceRef, {
          subscription_id: subId,
          user_id: selectedUser.id,
          free_swaps_total: Math.max(0, count),
          free_swaps_used: 0,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }
      setNotification({ text: `Adjusted free swaps by ${count}!`, type: 'success' });
      selectUser(selectedUser);
    } catch (err) {
      setNotification({ text: 'Failed to adjust swap allowance.', type: 'error' });
    }
  };

  // ── 7. Submit External Subscription Activation ──────────────────────────────
  const handleActivateExternalSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (computedMealsCount < 1) {
      alert('Please select at least 1 meal for this plan.');
      return;
    }

    setSubmittingExternal(true);
    try {
      const selectedVendor = vendors.find((v) => v.id === extVendorId);

      const params: ExternalSubscriptionParams = {
        userId: selectedUser.id,
        userName: selectedUser.name || 'Valued Customer',
        userPhone: selectedUser.phone || '',
        planType: extPlanType === 'standard' ? 'standard' : extPlanType === 'custom_weekly' ? 'weekly' : 'monthly',
        planName:
          extPlanType === 'custom_weekly'
            ? 'Weekly Custom Plan'
            : extPlanType === 'custom_monthly'
            ? 'Monthly Custom Plan'
            : `Standard ${extBillingCycle === 'weekly' ? 'Weekly' : 'Monthly'} (${extMealType})`,
        subscriptionType: extPlanType,
        billingCycle: extPlanType === 'custom_weekly' ? 'weekly' : extBillingCycle,
        mealType: extMealType,
        dietary: extDietary,
        pattern: extPlanType === 'custom_weekly' ? extWeeklyPattern : {},
        totalMeals: computedMealsCount,
        totalPrice: computedTotalCustomerPrice,
        pricePerMeal: extPricePerMeal,
        paymentMethod: extPaymentMethod,
        transactionId: extTransactionId.trim() || `EXT-${Date.now()}`,
        paymentNotes: extPaymentNotes.trim() || 'Offline transaction activated via admin panel',
        vendorId: extVendorId,
        vendorName: selectedVendor?.kitchen_name || selectedVendor?.name || 'Assigned Kitchen',
        vendorCostPerMeal: extVendorCostPerMeal,
        vendorTotalPayable: computedTotalVendorPayable,
        startDate: new Date(extStartDate),
        deliverySlot: extDeliverySlot,
        deliveryAddress: selectedUser.address || '',
        adminId: adminUser?.id || 'admin',
      };

      const result = await activateExternalSubscription(params);
      setNotification({
        text: `Active Membership Granted! Subscription #${result.subscriptionId.slice(0, 8)} created. Vendor credited ₹${computedTotalVendorPayable}.`,
        type: 'success',
      });
      setShowExternalModal(false);

      // Refresh data
      selectUser(selectedUser);
      loadAllData();
    } catch (err: any) {
      console.error('Failed to activate external subscription:', err);
      setNotification({
        text: err?.message || 'Failed to activate external subscription.',
        type: 'error',
      });
    } finally {
      setSubmittingExternal(false);
    }
  };

  const copyUserId = () => {
    if (!selectedUser) return;
    navigator.clipboard.writeText(selectedUser.id);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in text-left">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-7 rounded-3xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-md">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold tracking-wide uppercase mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            User Management & External Transactions
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Users & Subscription Operations
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Search users, inspect active meal subscriptions, record external UPI/cash payments, and credit vendor ledgers
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <RotateCcw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh Directory
          </button>
        </div>
      </div>

      {/* ── Notification Toast ────────────────────────────────────────────── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              'p-4 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between shadow-sm',
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            )}
          >
            <div className="flex items-center gap-2.5">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{notification.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="text-xs underline opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search & Filter Toolbars ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, phone (+91), email, or user UID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-900 text-xs sm:text-sm font-semibold placeholder-slate-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
              roleFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            All Roles ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('user')}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
              roleFilter === 'user'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            Customers
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('vendor')}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
              roleFilter === 'vendor'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            Kitchen Vendors
          </button>
          <button
            type="button"
            onClick={() =>
              setSubscriberFilter(subscriberFilter === 'subscribers' ? 'all' : 'subscribers')
            }
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1',
              subscriberFilter === 'subscribers'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            )}
          >
            <Sparkles className="w-3 h-3" />
            <span>Active Subscribers</span>
          </button>
        </div>
      </div>

      {/* ── Main Layout: Left User Directory List, Right User Cockpit ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left Directory List (5 cols) ────────────────────────────────── */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 shadow-md p-4 space-y-2 max-h-[750px] overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Users Matching Filter ({filteredUsers.length})</span>
            {loading && <span className="animate-pulse">Loading...</span>}
          </div>

          {filteredUsers.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-bold">No users found matching query</p>
            </div>
          )}

          {filteredUsers.map((u) => {
            const isSelected = selectedUser?.id === u.id;
            const isSubscriber = u.is_active_subscriber || u.membership_status === 'active';

            return (
              <div
                key={u.id}
                onClick={() => selectUser(u)}
                className={cn(
                  'p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2',
                  isSelected
                    ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/40 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50/60'
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0',
                      u.role === 'vendor'
                        ? 'bg-orange-100 text-orange-700'
                        : u.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : u.role === 'delivery'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    )}
                  >
                    {u.role === 'vendor' ? '🏪' : u.role === 'admin' ? '🛡️' : u.role === 'delivery' ? '🛵' : '👤'}
                  </div>

                  <div className="overflow-hidden text-left">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                        {u.name || 'Anonymous User'}
                      </h4>
                      {isSubscriber && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active Subscriber" />
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 truncate">
                      {u.phone || u.email || u.id.slice(0, 14)}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={cn(
                      'text-[9px] font-black uppercase px-2 py-0.5 rounded-md border',
                      isSubscriber
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    )}
                  >
                    {isSubscriber ? 'Active Sub' : u.role}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {u.created_at ? formatDate(u.created_at) : 'N/A'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right Detailed Cockpit (7 cols) ─────────────────────────────── */}
        <div className="lg:col-span-7">
          {!selectedUser ? (
            <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 shadow-md">
              <Users className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 p-2.5 mx-auto mb-3" />
              <h3 className="text-lg font-black text-slate-900">Select a User from Directory</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Click any customer on the left to inspect their active meal plans, record an external UPI/cash transaction, or adjust wallet credits.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* User Snapshot Header Card */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white border border-amber-200/80 shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">👤</span>
                      <h3 className="text-xl font-black text-slate-900">
                        {selectedUser.name || 'Anonymous User'}
                      </h3>
                      <span
                        className={cn(
                          'text-[10px] font-black uppercase px-2 py-0.5 rounded-full border',
                          selectedUser.is_active_subscriber || selectedUser.membership_status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        )}
                      >
                        {selectedUser.is_active_subscriber || selectedUser.membership_status === 'active'
                          ? 'Active Member'
                          : 'Standard Account'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                      {selectedUser.phone && (
                        <a
                          href={`tel:${selectedUser.phone}`}
                          className="flex items-center gap-1 text-slate-700 font-bold hover:text-amber-600"
                        >
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {selectedUser.phone}
                        </a>
                      )}
                      {selectedUser.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {selectedUser.email}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={copyUserId}
                        className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-700 bg-slate-50 px-2 py-0.5 rounded border"
                        title="Copy UID"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedUid ? 'Copied!' : selectedUser.id.slice(0, 12) + '...'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Primary Trigger: Activate External Subscription */}
                  <button
                    type="button"
                    onClick={() => setShowExternalModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Activate External Subscription</span>
                  </button>
                </div>

                {/* Quick User Stats Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 text-xs">
                  <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Active Subscriptions
                    </span>
                    <span className="font-extrabold text-slate-900 text-base">
                      {userSubs.filter((s) => s.status === 'active').length} plans
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Credit Balance
                    </span>
                    <span className="font-extrabold text-emerald-700 text-base">
                      {userCredits
                        .reduce((a, b) => a + (b.redeemed ? 0 : Number(b.credit_amount) || 0), 0)
                        .toFixed(1)}{' '}
                      Credits
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Saved Address
                    </span>
                    <span className="font-bold text-slate-800 text-xs truncate block">
                      {selectedUser.address || 'No address set'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Active & Past Subscriptions Section ───────────────────── */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-md space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-amber-600" />
                    Subscriptions ({userSubs.length})
                  </h4>
                  <span className="text-xs text-slate-400 font-medium">
                    {loadingUserDetails ? 'Fetching subscriptions...' : 'Real-time records'}
                  </span>
                </div>

                {userSubs.length === 0 && !loadingUserDetails && (
                  <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-100">
                    <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">No subscriptions on record for this user.</p>
                    <button
                      type="button"
                      onClick={() => setShowExternalModal(true)}
                      className="mt-3 text-xs font-extrabold text-amber-600 hover:text-amber-800 underline"
                    >
                      + Grant external membership now
                    </button>
                  </div>
                )}

                <div className="space-y-3.5">
                  {userSubs.map((sub: any) => {
                    const isActive = sub.status === 'active';
                    const isPaused = sub.status === 'paused';
                    const isCustom = sub.isCustomPlan || sub.is_custom_plan;
                    const isExternal = sub.is_external_payment;
                    const pattern = sub.customPlan?.pattern || sub.deliveryPattern || {};

                    return (
                      <div
                        key={sub.id}
                        className={cn(
                          'p-4 rounded-2xl border transition-all',
                          isActive
                            ? 'bg-white border-amber-200/90 shadow-xs'
                            : 'bg-slate-50/80 border-slate-200 opacity-90'
                        )}
                      >
                        {/* Sub Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'px-2.5 py-0.5 rounded-full font-black uppercase text-[10px]',
                                isCustom
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : 'bg-blue-100 text-blue-900 border border-blue-200'
                              )}
                            >
                              {sub.plan_name || (isCustom ? 'Custom Plan' : 'Standard Plan')}
                            </span>

                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full font-bold uppercase text-[10px]',
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : isPaused
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-200 text-slate-600'
                              )}
                            >
                              {sub.status}
                            </span>

                            {isExternal && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold uppercase text-[9px] border border-purple-200">
                                External ({sub.payment_method?.replace('external_', '')})
                              </span>
                            )}
                          </div>

                          <span className="font-mono text-[10px] text-slate-400">
                            ID: {sub.id.slice(0, 16)}...
                          </span>
                        </div>

                        {/* Sub Specs Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-3 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Meals & Price
                            </span>
                            <span className="font-bold text-slate-900">
                              {sub.totalMeals || sub.total_meals || 0} meals • ₹{sub.totalPrice || sub.total_price || sub.price || 0}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Assigned Kitchen
                            </span>
                            <span className="font-bold text-slate-800 truncate block">
                              {sub.vendor_name || sub.vendor_id || 'Auto-assigned'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Delivery Start
                            </span>
                            <span className="font-bold text-slate-800">
                              {formatDate(sub.startDate || sub.start_date || sub.created_at)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Ref / UTR
                            </span>
                            <span className="font-mono text-[11px] font-bold text-slate-600 truncate block">
                              {sub.transaction_id || 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Pattern Summary if custom */}
                        {isCustom && Object.keys(pattern).length > 0 && (
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] font-medium text-slate-600 mb-3 flex items-center gap-1.5 overflow-hidden">
                            <Utensils className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">
                              <strong>Pattern:</strong>{' '}
                              {WEEKDAYS.map((d) => `${d.short}: ${pattern[d.full] ?? pattern[d.short.toLowerCase()] ?? 0}`).join(' | ')}
                            </span>
                          </div>
                        )}

                        {/* Actions Strip */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          {isActive ? (
                            <button
                              type="button"
                              onClick={() => handlePauseSubscription(sub)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs flex items-center gap-1"
                            >
                              <Pause className="w-3 h-3" />
                              Pause
                            </button>
                          ) : isPaused ? (
                            <button
                              type="button"
                              onClick={() => handleResumeSubscription(sub)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              Resume
                            </button>
                          ) : null}

                          {isActive && (
                            <button
                              type="button"
                              onClick={() => handleCancelSubscription(sub)}
                              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Ledger & Credit Controls Card ─────────────────────────── */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-md space-y-4">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  Wallet Credits & Swaps Ledger
                </h4>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAdjustCredits(creditAdjustment)}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm"
                  >
                    + Add {creditAdjustment} Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustCredits(-creditAdjustment)}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm"
                  >
                    - Deduct {creditAdjustment} Credit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Activate External Subscription ──────────────────────────── */}
      <AnimatePresence>
        {showExternalModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 text-left my-auto max-h-[92vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
                <div>
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] uppercase mb-1">
                    <ShieldCheck className="w-3 h-3" />
                    External Transaction Processor
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Activate External Subscription
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    For customer <strong>{selectedUser.name || selectedUser.phone}</strong> (ID: {selectedUser.id.slice(0, 8)}...)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowExternalModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <form
                onSubmit={handleActivateExternalSubscription}
                className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs sm:text-sm"
              >
                {/* 1. Plan Type Selector */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                    1. Select Plan Architecture
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExtPlanType('custom_weekly');
                        setExtBillingCycle('weekly');
                      }}
                      className={cn(
                        'p-2.5 rounded-xl border text-center font-bold text-xs transition-all',
                        extPlanType === 'custom_weekly'
                          ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      Weekly Custom
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExtPlanType('custom_monthly');
                        setExtBillingCycle('monthly');
                      }}
                      className={cn(
                        'p-2.5 rounded-xl border text-center font-bold text-xs transition-all',
                        extPlanType === 'custom_monthly'
                          ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      Monthly Custom
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtPlanType('standard')}
                      className={cn(
                        'p-2.5 rounded-xl border text-center font-bold text-xs transition-all',
                        extPlanType === 'standard'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      Standard Plan
                    </button>
                  </div>
                </div>

                {/* 2. Schedule Pattern Configuration */}
                {extPlanType === 'custom_weekly' && (
                  <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-amber-900">
                        Weekly Day-by-Day Meal Pattern
                      </span>
                      <span className="text-xs font-bold text-amber-800">
                        Total: {computedMealsCount} meals/week
                      </span>
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-1">
                      {WEEKDAYS.map(({ full, short }) => {
                        const count = extWeeklyPattern[full] || 0;
                        return (
                          <div key={short} className="text-center p-1.5 rounded-xl bg-white border border-amber-200 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 block">{short}</span>
                            <div className="flex items-center justify-center gap-1 mt-1">
                              {[0, 1, 2].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    setExtWeeklyPattern({ ...extWeeklyPattern, [full]: c })
                                  }
                                  className={cn(
                                    'w-5 h-5 rounded text-[10px] font-black transition-all',
                                    count === c
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  )}
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {extPlanType === 'custom_monthly' && (
                  <div className="p-4 rounded-2xl bg-orange-50/60 border border-orange-200 space-y-2">
                    <label className="text-xs font-black uppercase text-orange-900 block">
                      Monthly Total Meals Scheduled
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="62"
                      value={extMonthlyMealCount}
                      onChange={(e) => setExtMonthlyMealCount(Math.max(1, Number(e.target.value)))}
                      className="w-full p-2.5 rounded-xl border border-orange-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                )}

                {extPlanType === 'standard' && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">Billing Cycle</label>
                        <select
                          value={extBillingCycle}
                          onChange={(e) => setExtBillingCycle(e.target.value as any)}
                          className="w-full p-2 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                        >
                          <option value="weekly">Weekly (7 Days)</option>
                          <option value="monthly">Monthly (30 Days)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">Meal Slot</label>
                        <select
                          value={extMealType}
                          onChange={(e) => setExtMealType(e.target.value as any)}
                          className="w-full p-2 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                        >
                          <option value="lunch">Lunch Only</option>
                          <option value="dinner">Dinner Only</option>
                          <option value="both">Both (Lunch & Dinner)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. External Payment Data */}
                <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-3">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-900 block">
                    2. External Payment Particulars
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">Payment Method</label>
                      <select
                        value={extPaymentMethod}
                        onChange={(e) => setExtPaymentMethod(e.target.value as any)}
                        className="w-full p-2 rounded-xl border border-purple-200 bg-white font-bold text-xs text-slate-900"
                      >
                        <option value="upi">UPI (GPay / PhonePe / Paytm / QR)</option>
                        <option value="bank_transfer">Bank Transfer (NEFT / IMPS / RTGS)</option>
                        <option value="cash">Cash In Hand</option>
                        <option value="cheque">Cheque</option>
                        <option value="card_pos">POS / Card Terminal</option>
                        <option value="other">Other External Mode</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">
                        UTR / Transaction Reference Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. UPI/5920381920 or NEFT-AXIS-9182"
                        value={extTransactionId}
                        onChange={(e) => setExtTransactionId(e.target.value)}
                        className="w-full p-2 rounded-xl border border-purple-200 bg-white font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">Rate per Meal (₹)</label>
                      <input
                        type="number"
                        value={extPricePerMeal}
                        onChange={(e) => setExtPricePerMeal(Math.max(1, Number(e.target.value)))}
                        className="w-full p-2 rounded-xl border border-purple-200 bg-white font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">
                        Total Amount Received (₹)
                      </label>
                      <input
                        type="number"
                        placeholder={`Calculated: ₹${computedMealsCount * extPricePerMeal}`}
                        value={extCustomTotalPrice}
                        onChange={(e) => setExtCustomTotalPrice(e.target.value)}
                        className="w-full p-2 rounded-xl border border-purple-200 bg-white font-bold text-xs text-purple-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Payment / Deal Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Paid offline via company UPI for monthly corporate contract"
                      value={extPaymentNotes}
                      onChange={(e) => setExtPaymentNotes(e.target.value)}
                      className="w-full p-2 rounded-xl border border-purple-200 bg-white text-xs font-medium"
                    />
                  </div>
                </div>

                {/* 4. Vendor Attribution & Ledger Credit */}
                <div className="p-4 rounded-2xl bg-orange-50/60 border border-orange-200 space-y-3">
                  <span className="text-xs font-black uppercase tracking-wider text-orange-900 block">
                    3. Vendor Attribution & Earnings Ledger
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">Assigned Kitchen Vendor</label>
                      <select
                        value={extVendorId}
                        onChange={(e) => setExtVendorId(e.target.value)}
                        className="w-full p-2 rounded-xl border border-orange-200 bg-white font-bold text-xs text-slate-900"
                      >
                        <option value="">-- Select Kitchen Partner --</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.kitchen_name || v.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">Vendor Cost/Meal (₹)</label>
                      <input
                        type="number"
                        value={extVendorCostPerMeal}
                        onChange={(e) => setExtVendorCostPerMeal(Math.max(1, Number(e.target.value)))}
                        className="w-full p-2 rounded-xl border border-orange-200 bg-white font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-orange-200 flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-600">Vendor Payout Obligation:</span>
                    <span className="text-orange-700 font-extrabold text-sm">
                      ₹{computedTotalVendorPayable} ({computedMealsCount} meals × ₹{extVendorCostPerMeal})
                    </span>
                  </div>
                </div>

                {/* 5. Schedule & Delivery Particulars */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                    4. Delivery Schedule Activation
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">Start Date</label>
                      <input
                        type="date"
                        value={extStartDate}
                        onChange={(e) => setExtStartDate(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">Delivery Slot</label>
                      <select
                        value={extDeliverySlot}
                        onChange={(e) => setExtDeliverySlot(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                      >
                        <option value="lunch">Lunch (11:30 AM - 1:30 PM)</option>
                        <option value="dinner">Dinner (7:30 PM - 9:30 PM)</option>
                        <option value="both">Both Slots</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExternalModal(false)}
                    className="px-5 py-3 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submittingExternal}
                    className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submittingExternal ? (
                      'Activating Membership & Crediting Vendor...'
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Confirm & Activate Subscription (₹{computedTotalCustomerPrice})</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default UserManagementHub;
