'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, HelpCircle, X } from 'lucide-react';
import { triggerHapticImpact, triggerHapticNotification, ImpactStyle, NotificationType } from '@/lib/haptics';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  
  useEffect(() => {
    if (isOpen) {
      if (variant === 'danger') {
        triggerHapticNotification(NotificationType.Warning);
      } else if (variant === 'warning') {
        triggerHapticNotification(NotificationType.Warning);
      } else {
        triggerHapticImpact(ImpactStyle.Light);
      }
    }
  }, [isOpen, variant]);

  const iconColor = {
    primary: 'text-brand bg-brand/5 border-brand/10',
    danger: 'text-rose-500 bg-rose-50 border-rose-100',
    warning: 'text-amber-500 bg-amber-50 border-amber-100',
  }[variant];

  const buttonStyle = {
    primary: 'bg-brand text-white hover:bg-brand/90 shadow-brand/20',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/20',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20',
  }[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-[110] bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-[111] p-4"
          >
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-6 overflow-hidden flex flex-col items-center text-center relative">
              
              <button 
                onClick={onCancel}
                className="absolute top-4 right-4 w-8 h-8 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>

              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 ${iconColor}`}>
                {variant === 'danger' ? (
                  <AlertCircle className="w-6 h-6" />
                ) : (
                  <HelpCircle className="w-6 h-6" />
                )}
              </div>

              <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight mb-2">
                {title}
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
                {message}
              </p>

              <div className="w-full flex gap-3">
                <button
                  onClick={() => {
                    triggerHapticImpact(ImpactStyle.Light);
                    onCancel();
                  }}
                  className="flex-1 rounded-2xl py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all active:scale-[0.98]"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={() => {
                    triggerHapticNotification(NotificationType.Success);
                    onConfirm();
                  }}
                  className={`flex-1 rounded-2xl py-3.5 text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg ${buttonStyle}`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
