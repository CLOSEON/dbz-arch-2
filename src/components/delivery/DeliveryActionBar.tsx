'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { DeliveryStatus } from '@/types/delivery';
import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';
import { pushToQueue } from '@/lib/offline/actionQueue';

interface Props {
  orderId: string;
  status: DeliveryStatus;
}

export function DeliveryActionBar({ orderId, status }: Props) {
  const [loading, setLoading] = useState(false);
  const [isFailedSheetOpen, setIsFailedSheetOpen] = useState(false);
  const [reason, setReason] = useState('');
  const user = useAuthStore((s) => s.user);
  const isOnline = useNetworkStore((s) => s.isOnline);

  const handleUpdate = async (nextStatus: DeliveryStatus, failedReason?: string) => {
    setLoading(true);
    
    const payload = { orderId, status: nextStatus, reason: failedReason };

    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseCrashlytics.setCustomKey({ key: 'agentId', value: user?.id || 'unknown', type: 'string' });
        await FirebaseCrashlytics.setCustomKey({ key: 'deliveryId', value: orderId, type: 'string' });
      }

      if (!isOnline) {
        throw new Error('network-offline');
      }

      const updateFn = httpsCallable(functions, 'updateDeliveryStatus');
      await updateFn(payload);
      
      toast.success(`Status updated to ${nextStatus.replace('_', ' ')}`);
      
      if (nextStatus === 'failed_attempt') {
        setIsFailedSheetOpen(false);
        setReason('');
      }
    } catch (err: any) {
      const errorMsg = err.message || '';
      
      // Handle known offline or network error by queuing
      if (errorMsg === 'network-offline' || errorMsg.includes('network') || errorMsg.includes('internal')) {
        pushToQueue(payload);
        toast('Saved offline. Will sync when connected.', { icon: '🔄' });
        
        if (nextStatus === 'failed_attempt') {
          setIsFailedSheetOpen(false);
          setReason('');
        }
      } else {
        toast.error(errorMsg || 'Failed to update status');
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === 'delivered' || status === 'failed_attempt') {
    return null;
  }

  return (
    <>
      {status === 'pending' && (
        <button
          onClick={() => handleUpdate('picked_up')}
          disabled={loading}
          className="flex-1 bg-brand text-white shadow-lg shadow-brand/20 rounded-2xl py-3.5 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mark Picked Up'}
        </button>
      )}

      {(status === 'picked_up' || status === 'out_for_delivery') && (
        <>
          <button
            onClick={() => handleUpdate('delivered')}
            disabled={loading}
            className="flex-1 bg-emerald-500 text-white shadow-lg shadow-emerald-200 rounded-2xl py-3.5 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mark Delivered'}
          </button>
          <button
            onClick={() => setIsFailedSheetOpen(true)}
            disabled={loading}
            className="w-14 h-14 shrink-0 bg-rose-50 text-rose-500 border border-rose-100 rounded-2xl flex items-center justify-center transition-all hover:bg-rose-100 active:scale-[0.98] disabled:opacity-50"
            title="Report Failed Attempt"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
          </button>
        </>
      )}

      {/* Bottom Sheet for Failed Attempt */}
      <AnimatePresence>
        {isFailedSheetOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center p-4">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setIsFailedSheetOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Report Failed Attempt</h3>
                  <p className="text-xs text-slate-500 font-medium">Please provide a reason for the failure.</p>
                </div>
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Customer not reachable, incorrect address..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 min-h-[120px] resize-none mb-4 placeholder:text-slate-400"
              />

              <button
                onClick={() => handleUpdate('failed_attempt', reason)}
                disabled={loading || reason.trim() === ''}
                className="w-full bg-rose-500 text-white shadow-lg shadow-rose-200 rounded-2xl py-4 text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Report'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
