'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, CheckCircle2, LockKeyhole } from 'lucide-react';
import type { DeliveryStatus } from '@/types/delivery';

interface DeliveryOTPCardProps {
  /** The 4-digit verification code string */
  otp: string;
  /** Current active delivery status state */
  status: DeliveryStatus;
}

export function DeliveryOTPCard({ otp, status }: DeliveryOTPCardProps) {
  const isDelivered = status === 'delivered';
  const digits = otp.slice(0, 4).split('');

  // Animate pulse variants for out-of-delivery attention
  const pulseVariant = {
    animate: {
      boxShadow: [
        '0 0 0 0px rgba(255, 107, 0, 0.2)',
        '0 0 0 12px rgba(255, 107, 0, 0)',
      ],
      transition: {
        repeat: Infinity,
        duration: 2,
        ease: 'easeInOut' as const,
      },
    },
  };

  return (
    <motion.div
      layout
      variants={!isDelivered ? pulseVariant : undefined}
      animate={!isDelivered ? 'animate' : undefined}
      className={`rounded-[2rem] p-6 border transition-all duration-500 max-w-sm mx-auto shadow-lg relative overflow-hidden ${
        isDelivered
          ? 'bg-emerald-50/70 border-emerald-100/80 shadow-emerald-50/20'
          : 'bg-white border-brand/20 shadow-brand/5'
      }`}
    >
      {/* Decorative Boarding Pass Punch Cuts */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-slate-50 rounded-r-full border-y border-r border-slate-100/50" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-slate-50 rounded-l-full border-y border-l border-slate-100/50" />

      <div className="flex flex-col items-center text-center space-y-5">
        <motion.div layout className="flex items-center gap-2">
          {isDelivered ? (
            <motion.div
              initial={{ scale: 0.8, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200"
            >
              <CheckCircle2 className="w-4.5 h-4.5" />
            </motion.div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 animate-pulse" />
            </div>
          )}
          
          <span className={`text-[10px] font-black uppercase tracking-widest ${
            isDelivered ? 'text-emerald-700' : 'text-slate-400'
          }`}>
            {isDelivered ? 'Delivery Securely Handed Over' : 'Security Verification PIN'}
          </span>
        </motion.div>

        {/* Dynamic Display State */}
        <AnimatePresence mode="wait">
          {isDelivered ? (
            <motion.div
              key="delivered-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-4 space-y-1.5"
            >
              <h2 className="text-2xl font-black text-emerald-800 tracking-tight leading-none">
                Delivered!
              </h2>
              <p className="text-xs font-semibold text-emerald-600/80">
                Your hot meal box is successfully at your door.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="otp-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full space-y-4"
            >
              {/* Digit Box Grid */}
              <div className="flex justify-center gap-3">
                {digits.map((digit, index) => (
                  <motion.div
                    key={index}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: index * 0.08 }}
                    className="w-14 h-16 bg-slate-50/50 border border-slate-100 rounded-2xl flex items-center justify-center text-2xl font-black text-slate-800 shadow-sm"
                  >
                    {digit}
                  </motion.div>
                ))}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-black text-slate-900 leading-none">
                  Show this to your delivery person
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  Rider will verify this PIN to complete the run
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Warning block */}
        {!isDelivered && (
          <div className="border-t border-dashed border-slate-100 w-full pt-4 flex items-center justify-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
            <LockKeyhole className="w-3.5 h-3.5 text-slate-300" />
            Refreshes daily • Do not share with others
          </div>
        )}
      </div>
    </motion.div>
  );
}
