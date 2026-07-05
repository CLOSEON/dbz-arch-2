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
import { getVendorTodayOrders } from '@/lib/queries/delivery';
import { getVendorSubscriptions } from '@/lib/queries/subscriptions';
import type { DeliveryOrder, DeliveryStatus } from '@/types/delivery';
import { getFunctions, httpsCallable } from 'firebase/functions';

function NextBatchTimer({ etaMs, count }: { etaMs: number; count: number }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateTimer = () => {
      // Prep deadline is 1 hour before delivery ETA
      const prepDeadline = etaMs - (3600 * 1000);
      const now = Date.now();
      const diff = prepDeadline - now;
      
      if (diff <= 0) {
        setTimeLeft('OVERDUE / PREP NOW');
        return;
      }
      
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };

    updateTimer();
    const int = setInterval(updateTimer, 1000);
    return () => clearInterval(int);
  }, [etaMs]);

  return (
    <div className="bg-gradient-to-r from-brand to-brand/80 rounded-[20px] p-5 shadow-lg shadow-brand/20 text-white flex items-center justify-between">
      <div>
        <p className="text-xs font-bold text-white/80 uppercase tracking-widest">Next Batch Prep</p>
        <p className="text-3xl font-black mt-0.5">{count} <span className="text-lg font-medium">Meals</span></p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-white/80 uppercase tracking-widest mb-1">Time Left</p>
        <div className="bg-white/20 px-3 py-1.5 rounded-xl backdrop-blur-sm inline-block">
          <p className="text-xl font-black font-mono tracking-wider">{timeLeft}</p>
        </div>
      </div>
    </div>
  );
}

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
      const [orders, subscriptions] = await Promise.all([
        getVendorTodayOrders(vendorId, today),
        getVendorSubscriptions(vendorId)
      ]);
      
      const activeSubs = subscriptions.filter(s => s.status === 'active');
      
      // Map out real orders to avoid duplicating them with projections
      const slotMap = new Set();
      orders.forEach(o => {
        let d: Date;
        if (o.createdAt instanceof Date) { d = o.createdAt; }
        else if (typeof o.createdAt === 'string') { d = new Date(o.createdAt); }
        else if (o.createdAt?.toDate && typeof o.createdAt.toDate === 'function') { d = o.createdAt.toDate(); }
        else if (o.createdAt?.seconds) { d = new Date(o.createdAt.seconds * 1000); }
        else if ((o.createdAt as any)?._seconds) { d = new Date((o.createdAt as any)._seconds * 1000); }
        else { d = new Date(); }
        
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        slotMap.add(`${dateKey}_${o.customerId}_${o.meal?.type}`);
      });
      
      const projectedOrders: any[] = [];
      const [ty, tm, td] = today.split('-');
      const now = new Date(Number(ty), Number(tm) - 1, Number(td));
      
      for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
        const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        
        activeSubs.forEach((sub) => {
          const mealTypes = sub.meal_type === 'both' ? ['lunch', 'dinner'] : [sub.meal_type];
          mealTypes.forEach((mealType) => {
            if (slotMap.has(`${dateKey}_${sub.user_id}_${mealType}`)) return; // already exists
            
            const scheduledSlot = mealType === 'lunch' ? '11am' : '8pm';
            
            projectedOrders.push({
              id: `projected_${dateKey}_${mealType}_${sub.id}`,
              subscriptionId: sub.id,
              customerId: sub.user_id,
              vendorId: sub.vendor_id,
              status: 'pending',
              meal: { type: mealType, name: mealType === 'lunch' ? 'Lunch' : 'Dinner' },
              scheduledSlot,
              address: { line1: 'From active subscription' },
              createdAt: {
                toDate: () => targetDate,
                seconds: Math.floor(targetDate.getTime() / 1000)
              },
              isProjected: true
            });
          });
        });
      }
      
      const combined = [...orders, ...projectedOrders];
      
      const sortedOrders = combined.sort((a, b) => {
        const getEta = (o: any) => {
          let baseMs = 0;
          if (o.createdAt instanceof Date) { baseMs = o.createdAt.getTime(); }
          else if (typeof o.createdAt === 'string') { baseMs = new Date(o.createdAt).getTime(); }
          else if (o.createdAt?.toDate && typeof o.createdAt.toDate === 'function') { baseMs = o.createdAt.toDate().getTime(); }
          else if (o.createdAt?.seconds) { baseMs = o.createdAt.seconds * 1000; }
          else if (o.createdAt?._seconds) { baseMs = o.createdAt._seconds * 1000; }
          
          let hourOff = o.scheduledSlot === '8am' ? 8 : (o.scheduledSlot === '11am' ? 11 : 20);
          return baseMs + (hourOff * 3600 * 1000);
        };
        return getEta(b) - getEta(a); // descending
      });
      setVendorOrders(sortedOrders);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  // Split orders into Today vs Upcoming
  const todayOrders = vendorOrders.filter(o => {
    if (!o.createdAt?.toDate) return false;
    const d = o.createdAt.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}` === today;
  });

  const upcomingOrders = vendorOrders.filter(o => {
    if (!o.createdAt?.toDate) return true;
    const d = o.createdAt.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}` !== today;
  }).reverse();

  // Calculate metrics ONLY for today
  const stats = {
    total: todayOrders.length,
    preparing: todayOrders.filter(o => o.status === 'preparing').length,
    pickedUp: todayOrders.filter(o => o.status === 'picked_up' || o.status === 'out_for_delivery').length,
    delivered: todayOrders.filter(o => o.status === 'delivered').length,
  };

  // Find Next Batch
  const getEtaMs = (o: any) => {
    let baseMs = o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0;
    let hourOff = o.scheduledSlot === '8am' ? 8 : (o.scheduledSlot === '11am' ? 11 : 20);
    return baseMs + (hourOff * 3600 * 1000);
  };
  
  const getBatchKey = (o: any) => {
    let d: Date;
    if (o.createdAt instanceof Date) {
      d = o.createdAt;
    } else if (typeof o.createdAt === 'string') {
      d = new Date(o.createdAt);
    } else if (o.createdAt?.toDate && typeof o.createdAt.toDate === 'function') {
      d = o.createdAt.toDate();
    } else if (o.createdAt?.seconds) {
      d = new Date(o.createdAt.seconds * 1000);
    } else if (o.createdAt?._seconds) {
      d = new Date(o.createdAt._seconds * 1000);
    } else {
      // Fallback: group by just the slot if we can't parse the date at all
      return `unknown-date_${o.scheduledSlot || 'none'}`;
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}_${o.scheduledSlot || 'none'}`;
  };

  const pendingOrders = vendorOrders
    .filter(o => o.status === 'pending' || o.status === 'preparing')
    .sort((a, b) => getEtaMs(a) - getEtaMs(b));

  const nextBatchEta = pendingOrders.length > 0 ? getEtaMs(pendingOrders[0]) : null;
  const nextBatchKey = pendingOrders.length > 0 ? getBatchKey(pendingOrders[0]) : null;
  const nextBatchCount = nextBatchKey
    ? pendingOrders.filter(o => getBatchKey(o) === nextBatchKey).length
    : 0;

  // Determine button state
  const handleMarkAllReady = async () => {
    setIsUpdating(true);
    try {
      const slot = todayOrders.length > 0 ? (todayOrders[0].scheduledSlot || '11am') : '11am';
      const functions = getFunctions();
      const markReady = httpsCallable(functions, 'markBatchReady');
      await markReady({ dateStr: today, slot });
      
      setIsConfirmOpen(false);
      // Wait for local onSnapshot to catch up, or trigger a local fetch if you don't have realtime
      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update orders. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const hasPreparingOrders = todayOrders.some(o => o.status === 'preparing' || o.status === 'pending');
  const isAllOrdersReady = todayOrders.length > 0 && todayOrders.every(o => o.status === 'picked_up' || o.status === 'ready' || o.status === 'delivered');

  // Status Badge Helper
  const getStatusBadge = (status: DeliveryStatus) => {
    const config: Record<DeliveryStatus, { text: string; classes: string; dot: string }> = {
      pending: {
        text: 'Waiting',
        classes: 'bg-amber-50 text-amber-600 border-amber-100',
        dot: 'bg-amber-500'
      },
      preparing: {
        text: 'Preparing',
        classes: 'bg-orange-50 text-orange-600 border-orange-100',
        dot: 'bg-orange-500'
      },
      ready: {
        text: 'Ready for Pickup',
        classes: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        dot: 'bg-emerald-500'
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
    <div className="space-y-6 w-full pb-24">
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

      {/* Next Batch Timer */}
      {nextBatchEta && nextBatchCount > 0 && (
        <NextBatchTimer etaMs={nextBatchEta} count={nextBatchCount} />
      )}

      {/* Metrics Summary Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-[20px] p-4 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <Clock className="w-4 h-4 text-slate-400 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
          <span className="text-xl font-black text-slate-900 mt-0.5">{stats.total}</span>
        </div>
        
        <div className="bg-white rounded-[20px] p-4 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <ChefHat className="w-4 h-4 text-amber-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prep</span>
          <span className="text-xl font-black text-amber-600 mt-0.5">{stats.preparing}</span>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <Truck className="w-4 h-4 text-blue-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Picked</span>
          <span className="text-xl font-black text-blue-600 mt-0.5">{stats.pickedUp}</span>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-slate-100 flex flex-col items-center text-center shadow-sm">
          <CheckCircle className="w-4 h-4 text-emerald-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deliv</span>
          <span className="text-xl font-black text-emerald-600 mt-0.5">{stats.delivered}</span>
        </div>
      </div>

      {/* Orders Scrollable List - TODAY */}
      <div className="space-y-4">
        <div className="ml-1 mb-2">
          <h2 className="text-sm font-bold text-slate-900">Today's Delivery Batches</h2>
          <p className="text-xs text-rose-600 font-medium mt-1 tracking-wide">⚠️ Please get your meals prepared before 1 hour of the delivery ETA.</p>
        </div>
        
        {todayOrders.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center text-center border border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <ChefHat className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-bold text-slate-900">No Orders For Today</p>
            <p className="text-xs text-slate-400 mt-1">Daily subscriptions will populate here once active.</p>
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto space-y-4 pr-1 scrollbar-thin pb-4">
            <AnimatePresence initial={false}>
              {todayOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="bg-white rounded-[24px] p-5 lg:p-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between hover:border-brand/20 transition-all group gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-2">
                    <div className="w-11 h-11 bg-slate-50 group-hover:bg-brand/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-brand transition-all shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900 group-hover:text-brand transition-colors truncate">
                        Meal Batch ID: #{order.id.slice(-4).toUpperCase()}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[120px]">
                          {order.meal.name}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${
                          order.meal.type === 'lunch' ? 'text-orange-500' : 'text-indigo-500'
                        }`}>
                          {order.meal.type}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-600 shrink-0 bg-slate-100 px-2 py-0.5 rounded-full">
                          Today • {order.scheduledSlot || 'ETA Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {getStatusBadge(order.status)}
                    <span className="text-[9px] text-slate-400 font-medium truncate max-w-[80px]">
                      {order.address?.line1 || 'No address'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Orders Scrollable List - UPCOMING */}
      <div className="space-y-4 pt-6 border-t border-slate-100">
        <div className="ml-1 mb-2">
          <h2 className="text-sm font-bold text-slate-900">Upcoming Deliveries (Next 5 Days)</h2>
        </div>
        
        {upcomingOrders.length === 0 ? (
          <div className="bg-slate-50/50 rounded-3xl p-6 flex flex-col items-center text-center border border-dashed border-slate-200">
            <p className="font-bold text-slate-400 text-sm">No Upcoming Orders</p>
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto space-y-4 pr-1 scrollbar-thin pb-4 opacity-80 hover:opacity-100 transition-opacity">
            <AnimatePresence initial={false}>
              {upcomingOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="bg-white/80 rounded-[24px] p-4 lg:p-5 border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-2">
                    <div className="w-9 h-9 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-700 truncate">
                        Meal Batch ID: #{order.id.slice(-4).toUpperCase()}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[120px]">
                          {order.meal.name}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${
                          order.meal.type === 'lunch' ? 'text-orange-500' : 'text-indigo-500'
                        }`}>
                          {order.meal.type}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-600 shrink-0 bg-slate-100 px-2 py-0.5 rounded-full">
                          {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown Date'} • {order.scheduledSlot || 'ETA Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-500 border-slate-200">
                      Scheduled
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bulk Action Mark Ready Trigger */}
      {todayOrders.length > 0 && (
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
              <CheckCircle className="w-4 h-4" /> All Meals Ready
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" /> Mark Batch Ready
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
