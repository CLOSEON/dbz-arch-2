'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, Send, X, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { sendDelayNotification } from '@/lib/queries/delivery';
import toast from 'react-hot-toast';

interface DelayBroadcastProps {
  /** The unique identifier of the vendor kitchen */
  vendorId: string;
}

type DelayReason = 'Traffic delay' | 'Preparation delay' | 'Weather' | 'Other';

export function DelayBroadcast({ vendorId }: DelayBroadcastProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<DelayReason>('Preparation delay');
  const [message, setMessage] = useState('');
  const [newETA, setNewETA] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newETA) {
      toast.error('Please select an estimated arrival time');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendDelayNotification(vendorId, {
        reason,
        message: message.trim() || undefined,
        newETA,
      });

      toast.success('Delay notification broadcasted! 📢');
      setIsOpen(false);
      // Reset form
      setMessage('');
      setNewETA('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to send broadcast');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 border border-amber-100 rounded-3xl transition-all group text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center text-amber-500 group-hover:animate-pulse">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900 leading-tight">Broadcast Delay</h4>
            <p className="text-[10px] text-amber-600/80 font-medium mt-0.5">Alert active orders with a quick notice</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-amber-500 group-hover:translate-x-0.5 transition-transform">
          <Send className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* Slide-Up Bottom Sheet Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            />

            {/* Bottom Sheet wrapper */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[2.5rem] shadow-2xl border-t border-slate-100 safe-area-pb max-w-lg mx-auto overflow-hidden"
            >
              {/* Handle bar for visual sheet affordance */}
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-3" />

              <div className="px-6 pb-6 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight leading-tight">
                      Broadcast Live Delay
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      Subscribers Broadcast Node
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Reason Select */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Delay Reason
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value as DelayReason)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand transition-colors appearance-none"
                  >
                    <option value="Preparation delay">👨‍🍳 Preparation delay</option>
                    <option value="Traffic delay">🚗 Traffic delay</option>
                    <option value="Weather">🌧 Weather delay</option>
                    <option value="Other">⚠️ Other</option>
                  </select>
                </div>

                {/* New ETA Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    New Estimated Delivery Time (ETA)
                  </label>
                  <input
                    type="time"
                    required
                    value={newETA}
                    onChange={(e) => setNewETA(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-4 text-xs font-black text-slate-900 focus:outline-none focus:border-brand transition-colors"
                  />
                </div>

                {/* Custom Message Textarea */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Additional Message (Optional)
                    </label>
                    <span className={`text-[10px] font-bold ${
                      message.length > 90 ? 'text-rose-500' : 'text-slate-400'
                    }`}>
                      {message.length}/100
                    </span>
                  </div>
                  <textarea
                    maxLength={100}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. Preparing fresh batches. Extra 10 minutes required."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand transition-colors resize-none"
                  />
                </div>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl py-4 bg-brand text-white text-xs font-black uppercase tracking-widest transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    >
                      <X className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Live Alert
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
