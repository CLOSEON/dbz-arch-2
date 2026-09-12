'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { acceptSwap, declineSwap } from '@/lib/queries/swaps';
import { useUiStore } from '@/store/uiStore';
import { Utensils, Zap, X } from 'lucide-react';
import type { SwapBroadcastRecipient } from '@/types';

export function SwapListener() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);
  const [broadcast, setBroadcast] = useState<SwapBroadcastRecipient | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'swap_broadcasts'),
      where('recipient_user_id', '==', user.id),
      where('response', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        // Just take the first one if there are multiple
        setBroadcast({ id: snap.docs[0].id, ...snap.docs[0].data() } as SwapBroadcastRecipient);
      } else {
        setBroadcast(null);
      }
    });

    return () => unsub();
  }, [user]);

  if (!broadcast) return null;

  async function handleAccept() {
    if (!user || !broadcast) return;
    setLoading(true);
    try {
      const success = await acceptSwap(broadcast.id, user.id);
      if (success) {
        addToast('Swap successful! You earned 0.3 credits.', 'success');
      } else {
        addToast('Swap is no longer available.', 'error');
      }
      setBroadcast(null);
    } catch (e) {
      addToast('Failed to accept swap', 'error');
    }
    setLoading(false);
  }

  async function handleDecline() {
    if (!broadcast) return;
    try {
      await declineSwap(broadcast.id);
      setBroadcast(null);
    } catch (e) {
      console.error(e);
    }
  }

  const meal = broadcast.meal_snapshot || { name: 'A surprise meal' };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl scale-in overflow-hidden relative">
        <button 
          onClick={handleDecline}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-8 h-8 text-brand" />
        </div>
        
        <h3 className="text-xl font-black text-slate-900 text-center mb-1">Swap Request!</h3>
        <p className="text-xs font-bold text-slate-400 text-center uppercase tracking-widest mb-5">Someone nearby wants to swap</p>
        
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-slate-200 flex flex-col items-center justify-center shadow-inner shrink-0">
              <span className="text-lg leading-none">🍱</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">{meal.name}</p>
              {meal.description && <p className="text-xs text-slate-500 mt-0.5">{meal.description}</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-sm flex items-center gap-2">
            <span className="text-lg">🎁</span>
            <p className="text-xs font-bold text-emerald-600 leading-tight">
              Accept this swap and earn 0.3 credits toward a free meal
            </p>
          </div>
        </div>

        <p className="text-[11px] font-medium text-slate-400 text-center mb-5 italic">
          "3 accepted swaps = 1 free meal, on us — don't say no just yet"
        </p>

        <div className="flex gap-3">
          <button 
            onClick={handleDecline}
            disabled={loading}
            className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
          >
            Pass
          </button>
          <button 
            onClick={handleAccept}
            disabled={loading}
            className="flex-[2] py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Accepting...' : 'Accept & Earn'}
          </button>
        </div>
      </div>
    </div>
  );
}
