'use client';

import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 rounded-[1.5rem] bg-brand/10 text-brand flex items-center justify-center shadow-lg shadow-brand/5">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">
        Synchronizing...
      </p>
    </div>
  );
}
