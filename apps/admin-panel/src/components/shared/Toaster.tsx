'use client';

import { useUiStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

const COLORS = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-orange-50 border-orange-200 text-orange-800',
};

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const remove = useUiStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[90vw] max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg',
            'animate-fade-up pointer-events-auto cursor-pointer',
            COLORS[toast.type]
          )}
          onClick={() => remove(toast.id)}
        >
          <span className="text-base">{ICONS[toast.type]}</span>
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
