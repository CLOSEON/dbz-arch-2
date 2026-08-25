'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  AlertOctagon, 
  UserCheck, 
  XOctagon, 
  CalendarDays, 
  Loader2, 
  User, 
  MapPin, 
  UtensilsCrossed, 
  Clock 
} from 'lucide-react';
import { 
  reassignDelivery, 
  markDeliveryFailed, 
  rescheduleDelivery 
} from '@/lib/queries/delivery';
import toast from 'react-hot-toast';
import type { DeliveryOrder, DriverProfile } from '@/types/delivery';

interface MissedDeliveryModalProps {
  /** If the modal drawer is open */
  isOpen: boolean;
  /** Callback to close the modal drawer */
  onClose: () => void;
  /** The target delivery order to resolve */
  order: DeliveryOrder;
  /** List of online/active drivers available for reassignment */
  activeDrivers: DriverProfile[];
  /** Callback to refresh the parent table/dashboard on success */
  onSuccess: () => void;
}

type ResolutionType = 'reassign' | 'fail' | 'reschedule';

export function MissedDeliveryModal({
  isOpen,
  onClose,
  order,
  activeDrivers,
  onSuccess,
}: MissedDeliveryModalProps) {
  const [resolution, setResolution] = useState<ResolutionType>('reassign');
  const [newDriverId, setNewDriverId] = useState('');
  const [failReason, setFailReason] = useState('Customer unavailable at door');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Time elapsed calculation (since creation or pick-up)
  const calculateMinutesElapsed = () => {
    if (!order.createdAt) return 0;
    const startMs = order.createdAt.seconds
      ? order.createdAt.seconds * 1000
      : new Date(order.createdAt as any).getTime();
    const diffMs = Date.now() - startMs;
    return Math.floor(diffMs / 60000);
  };

  const minutesElapsed = calculateMinutesElapsed();

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (resolution === 'reassign') {
        if (!newDriverId) {
          toast.error('Please select an active driver for reassignment');
          setIsSubmitting(false);
          return;
        }
        await reassignDelivery(order.id, newDriverId);
        toast.success('Rider reassigned successfully! 🚚');
      } else if (resolution === 'fail') {
        await markDeliveryFailed(order.id, failReason);
        toast.success('Order flagged as failed & refund issued! 💸');
      } else if (resolution === 'reschedule') {
        await rescheduleDelivery(order.id);
        toast.success('Logistics task rescheduled for tomorrow! 📅');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[MissedDelivery] Resolve error:', err);
      toast.error(err.message || 'Failed to apply fleet action');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-6"
          >
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
                    <AlertOctagon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight leading-tight">
                      Logistics Rescue Action
                    </h3>
                    <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mt-0.5 animate-pulse">
                      Missed Handover Flagged
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Scrollable details and actions */}
              <form onSubmit={handleResolve} className="p-6 overflow-y-auto space-y-5">
                {/* Visual Order Details Metadata Card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50 space-y-3.5 text-xs text-slate-700">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Customer</span>
                        <p className="font-bold text-slate-900 truncate">Customer Account</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 min-w-0">
                      <UtensilsCrossed className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Meal Name</span>
                        <p className="font-bold text-slate-900 truncate">{order.meal.name}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Drop Location</span>
                      <p className="font-medium text-slate-800 leading-snug">{order.address.line1}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100/80 pt-3 flex items-center justify-between text-[10px] font-bold">
                    <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{minutesElapsed}m Idle</span>
                    </div>
                    <span className="text-slate-400 uppercase">
                      Batch #{order.id.slice(-4).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Resolution Options Title */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                    Select Resolution Action
                  </label>

                  <div className="grid grid-cols-1 gap-2.5">
                    {/* 1. Reassign */}
                    <label className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                      resolution === 'reassign' 
                        ? 'border-brand/40 bg-brand/[0.02] ring-1 ring-brand/10' 
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}>
                      <input
                        type="radio"
                        name="resolution"
                        value="reassign"
                        checked={resolution === 'reassign'}
                        onChange={() => setResolution('reassign')}
                        className="mt-1 accent-brand"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-slate-950 flex items-center gap-1">
                          <UserCheck className="w-4 h-4 text-brand" />
                          Reassign Driver
                        </span>
                        <p className="text-[10px] text-slate-500 font-medium leading-normal">
                          Allocate this tiffin order to another active driver in the online fleet.
                        </p>
                      </div>
                    </label>

                    {/* 2. Fail & Refund */}
                    <label className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                      resolution === 'fail' 
                        ? 'border-rose-200 bg-rose-50/[0.04] ring-1 ring-rose-50/50' 
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}>
                      <input
                        type="radio"
                        name="resolution"
                        value="fail"
                        checked={resolution === 'fail'}
                        onChange={() => setResolution('fail')}
                        className="mt-1 accent-rose-500"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-slate-950 flex items-center gap-1">
                          <XOctagon className="w-4 h-4 text-rose-500" />
                          Mark Failed + Refund
                        </span>
                        <p className="text-[10px] text-slate-500 font-medium leading-normal">
                          Cancel this delivery run, set status to failed, and trigger order refund logic.
                        </p>
                      </div>
                    </label>

                    {/* 3. Reschedule */}
                    <label className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                      resolution === 'reschedule' 
                        ? 'border-emerald-200 bg-emerald-50/[0.03] ring-1 ring-emerald-50/50' 
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}>
                      <input
                        type="radio"
                        name="resolution"
                        value="reschedule"
                        checked={resolution === 'reschedule'}
                        onChange={() => setResolution('reschedule')}
                        className="mt-1 accent-emerald-500"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-slate-950 flex items-center gap-1">
                          <CalendarDays className="w-4 h-4 text-emerald-500" />
                          Reschedule Tomorrow
                        </span>
                        <p className="text-[10px] text-slate-500 font-medium leading-normal">
                          Defer dispatch. Postpones the meal delivery block to tomorrow's daily run.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* DYNAMIC FIELD CONDITIONAL FOR REASSIGNMENT */}
                <AnimatePresence mode="wait">
                  {resolution === 'reassign' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 overflow-hidden"
                    >
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                        Select New Driver
                      </label>
                      <select
                        required
                        value={newDriverId}
                        onChange={(e) => setNewDriverId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand transition-colors appearance-none"
                      >
                        <option value="">-- Choose Online Driver --</option>
                        {activeDrivers.map((d) => (
                          <option key={d.uid} value={d.uid}>
                            🛵 {d.name} ({d.phone})
                          </option>
                        ))}
                      </select>
                    </motion.div>
                  )}

                  {/* DYNAMIC FIELD CONDITIONAL FOR FAILURE */}
                  {resolution === 'fail' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 overflow-hidden"
                    >
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                        Failure Log Reason
                      </label>
                      <select
                        required
                        value={failReason}
                        onChange={(e) => setFailReason(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand transition-colors"
                      >
                        <option value="Customer unavailable at door">🚪 Customer unavailable at door</option>
                        <option value="Delivery box damaged in transit">🍱 Meal tiffin damaged in transit</option>
                        <option value="Rider vehicle accident / breakdown">🛵 Rider vehicle breakdown</option>
                        <option value="Incorrect address credentials">🗺 Unreachable address location</option>
                      </select>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action Trigger Buttons */}
                <div className="border-t border-slate-50 pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-2xl py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all active:scale-[0.98] text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 rounded-2xl py-3.5 bg-brand text-white text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Apply Action'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
