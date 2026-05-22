'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChefHat, 
  Truck, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Loader2, 
  PackageCheck,
  ChevronRight,
  User
} from 'lucide-react';
import { useDeliveryStore } from '@/store/deliveryStore';
import { getVendorTodayOrders, markVendorOrdersReady } from '@/lib/queries/delivery';
import type { DeliveryOrder, DeliveryStatus } from '@/types/delivery';

interface TodayOrdersListProps {
  /** The unique identifier of the vendor kitchen */
  vendorId: string;
}

export function TodayOrdersList({ vendorId }: TodayOrdersListProps) {
  const vendorOrders = useDeliveryStore((s) => s.vendorOrders);
  const setVendorOrders = useDeliveryStore((s) => s.setVendorOrders);
  const isLoading = useDeliveryStore((s) => s.isLoading);
  const setLoading = useDeliveryStore((s) => s.setLoading);
  const error = useDeliveryStore((s) => s.error);
  const setError = useDeliveryStore((s) => s.setError);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Get current date string in YYYY-MM-DD format
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getTodayDateString();

  // Load orders on mount
  useEffect(() => {
    fetchOrders();
  }, [vendorId]);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const orders = await getVendorTodayOrders(vendorId, today);
      setVendorOrders(orders);
    } catch (err: any) {
      setError(err.message || 'Failed to load today\'s orders');
    } finally {
      setLoading(false);
    }
  }

  // Calculate metrics
  const stats = {
    total: vendorOrders.length,
    preparing: vendorOrders.filter(o => o.status === 'preparing').length,
    pickedUp: vendorOrders.filter(o => o.status === 'picked_up' || o.status === 'out_for_delivery').length,
    delivered: vendorOrders.filter(o => o.status === 'delivered').length,
  };

  // Determine button state
  const hasPreparingOrders = stats.preparing > 0;
  const isAllOrdersReady = stats.total > 0 && stats.preparing === 0;

  async function handleMarkAllReady() {
    setIsUpdating(true);
    setIsConfirmOpen(false);
    try {
      await markVendorOrdersReady(vendorId, today);
      // Refresh the orders from Firestore after updates
      await fetchOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to update orders status');
    } finally {
      setIsUpdating(false);
    }
  }

  // Status Badge Helper
  const getStatusBadge = (status: DeliveryStatus) => {
    const config: Record<DeliveryStatus, { text: string; classes: string; dot: string }> = {
      pending: {
        text: 'Pending',
        classes: 'bg-slate-50 text-slate-700 border-slate-200',
        dot: 'bg-slate-400'
      },
      preparing: {
        text: 'Preparing',
        classes: 'bg-amber-50 text-amber-700 border-amber-100',
        dot: 'bg-amber-500'
      },
      picked_up: {
        text: 'Picked Up',
        classes: 'bg-blue-50 text-blue-700 border-blue-100',
        dot: 'bg-blue-500'
      },
      out_for_delivery: {
        text: 'Out for Delivery',
        classes: 'bg-orange-50 text-orange-700 border-orange-100',
        dot: 'bg-orange-500'
      },
      delivered: {
        text: 'Delivered',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        dot: 'bg-emerald-500'
      },
      failed: {
        text: 'Failed',
        classes: 'bg-rose-50 text-rose-700 border-rose-100',
        dot: 'bg-rose-500'
      },
      failed_attempt: {
        text: 'Failed Attempt',
        classes: 'bg-rose-100 text-rose-800 border-rose-200',
        dot: 'bg-rose-600'
      }
    };

    const item = config[status] || config.preparing;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${item.classes}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${item.dot} animate-pulse`} />
        {item.text}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 w-full max-w-md mx-auto p-4">
        {/* Metric Cards Skeleton */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl p-3 border border-slate-100 flex flex-col items-center justify-center h-20 animate-pulse">
              <div className="w-4 h-4 bg-slate-100 rounded mb-2" />
              <div className="w-8 h-6 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        {/* List Skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-3xl p-5 border border-slate-100 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-lg mx-auto p-4 pb-24">
      {/* Errors Notification */}
      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-start gap-3 text-rose-700 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Database Sync Error</p>
            <p className="text-xs text-rose-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Metrics Summary Row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-2xl p-3 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <Clock className="w-4 h-4 text-slate-400 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
          <span className="text-xl font-black text-slate-900 mt-0.5">{stats.total}</span>
        </div>
        
        <div className="bg-white rounded-2xl p-3 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <ChefHat className="w-4 h-4 text-amber-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prep</span>
          <span className="text-xl font-black text-amber-600 mt-0.5">{stats.preparing}</span>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <Truck className="w-4 h-4 text-blue-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Picked</span>
          <span className="text-xl font-black text-blue-600 mt-0.5">{stats.pickedUp}</span>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <CheckCircle className="w-4 h-4 text-emerald-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deliv</span>
          <span className="text-xl font-black text-emerald-600 mt-0.5">{stats.delivered}</span>
        </div>
      </div>

      {/* Orders Scrollable List */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 ml-1">Today's Delivery Batches</h2>
        
        {vendorOrders.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center text-center border border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <ChefHat className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-bold text-slate-900">No Orders Prepared Yet</p>
            <p className="text-xs text-slate-400 mt-1">Daily subscriptions will populate here once active.</p>
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1 scrollbar-thin">
            <AnimatePresence initial={false}>
              {vendorOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:border-brand/20 transition-all group"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-2">
                    <div className="w-11 h-11 bg-slate-50 group-hover:bg-brand/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-brand transition-all shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900 group-hover:text-brand transition-colors truncate">
                        Meal Batch ID: #{order.id.slice(-4).toUpperCase()}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[120px]">
                          {order.meal.name}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${
                          order.meal.type === 'lunch' ? 'text-orange-500' : 'text-indigo-500'
                        }`}>
                          {order.meal.type}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {getStatusBadge(order.status)}
                    <span className="text-[9px] text-slate-400 font-medium truncate max-w-[80px]">
                      {order.address.line1}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bulk Action Mark Ready Trigger */}
      {vendorOrders.length > 0 && (
        <button
          onClick={() => setIsConfirmOpen(true)}
          disabled={!hasPreparingOrders || isUpdating}
          className={`w-full rounded-2xl py-4 text-xs font-black uppercase tracking-widest transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg ${
            isAllOrdersReady
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
              : 'bg-brand text-white shadow-brand/20'
          }`}
        >
          {isUpdating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isAllOrdersReady ? (
            <>
              <PackageCheck className="w-4 h-4 text-slate-400" />
              Awaiting driver pickup
            </>
          ) : (
            <>
              <PackageCheck className="w-4 h-4" />
              Mark all ready for pickup
            </>
          )}
        </button>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm p-6 shadow-2xl relative border border-slate-100 overflow-hidden"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-4">
                  <PackageCheck className="w-7 h-7 animate-bounce" />
                </div>
                
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Confirm Ready Handover</h3>
                <p className="text-xs text-slate-400 font-medium mt-2 leading-relaxed px-2">
                  This will batch-update all {stats.preparing} currently preparing meals as ready and notify the delivery partners. Are you ready to dispatch?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  onClick={() => setIsConfirmOpen(false)}
                  className="py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-xs font-black uppercase text-slate-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkAllReady}
                  className="py-3 bg-brand text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-brand/20 transition-all hover:brightness-105"
                >
                  Confirm dispatch
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
