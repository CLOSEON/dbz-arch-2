'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Star, CheckCircle2, Ticket } from 'lucide-react';

interface RewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalCredits: number;
  creditHistory: any[];
  activeSubscriptions: any[];
  onRedeem: () => Promise<void>;
  redeemingCredits: boolean;
}

export function RewardsModal({
  isOpen,
  onClose,
  totalCredits,
  creditHistory,
  activeSubscriptions,
  onRedeem,
  redeemingCredits
}: RewardsModalProps) {
  if (!isOpen) return null;

  const progressPercentage = Math.min((totalCredits / 1.0) * 100, 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-[101] flex items-end justify-center sm:items-center p-0 sm:p-4 pointer-events-none">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                    <Gift className="w-4 h-4 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">My Rewards</h3>
                </div>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 p-5 space-y-6">
                
                {/* Balance & Progress Card */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100/50 rounded-3xl p-5 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Star className="w-24 h-24 text-amber-500 fill-amber-500" />
                  </div>
                  
                  <div className="relative z-10 flex justify-between items-end mb-4">
                    <div>
                      <p className="text-xs font-bold text-amber-700/70 uppercase tracking-widest mb-1">Available Credits</p>
                      <p className="text-4xl font-black text-amber-900">{totalCredits.toFixed(1)} <span className="text-lg text-amber-700/50 font-bold">cr</span></p>
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex justify-between text-xs font-semibold text-amber-800/70 mb-2">
                      <span>Progress to Free Meal</span>
                      <span>{Math.floor((totalCredits / 1.0) * 100)}%</span>
                    </div>
                    <div className="h-3 w-full bg-amber-200/50 rounded-full overflow-hidden mb-3">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercentage}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                      />
                    </div>
                    <p className="text-[11px] font-medium text-amber-800/80">
                      {totalCredits >= 1.0 
                        ? "🎉 You have enough credits for a free meal!" 
                        : `Earn ${(1.0 - totalCredits).toFixed(1)} more credits for a free meal.`}
                    </p>
                  </div>
                </div>

                {/* Redeem Action */}
                {totalCredits >= 1 && activeSubscriptions.length > 0 && (
                  <button
                    onClick={onRedeem}
                    disabled={redeemingCredits}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-200 bg-amber-500 text-white shadow-lg shadow-amber-500/25 hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                  >
                    {redeemingCredits ? 'Redeeming...' : `Redeem ${Math.floor(totalCredits)} Credits for ${Math.floor(totalCredits)} Days`}
                  </button>
                )}
                {totalCredits >= 1 && activeSubscriptions.length === 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                    <p className="text-sm font-bold text-slate-700">Subscribe to redeem credits!</p>
                    <p className="text-xs text-slate-500 mt-1">You have enough credits, but need an active subscription to apply them.</p>
                  </div>
                )}

                {/* How it works banner */}
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
                  <div className="text-xl shrink-0 mt-0.5">💡</div>
                  <div>
                    <p className="text-sm font-bold text-blue-900 mb-0.5">How to earn credits?</p>
                    <p className="text-[11px] text-blue-800/80 leading-relaxed">
                      Earn <strong className="text-blue-900">0.5 credits</strong> every time you skip a scheduled delivery. 
                      Collect 2 credits to earn a <strong className="text-blue-900">1-day free meal extension</strong> on your active plan!
                    </p>
                  </div>
                </div>

                {/* Transaction History */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    Recent Activity <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px]">{creditHistory.length}</span>
                  </h4>
                  
                  {creditHistory.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                      <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-medium">No activity yet.<br/>Skip a meal to get started!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {creditHistory.map((c) => (
                        <div key={c.id} className="flex items-center justify-between bg-white border border-slate-100 p-3 rounded-2xl shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              c.credit_amount > 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
                            }`}>
                              {c.credit_amount > 0 ? <CheckCircle2 className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800 capitalize truncate max-w-[150px]">
                                {c.source?.replace(/_/g, ' ') || 'Credit Update'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                {c.created_at?.toDate ? c.created_at.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <span className={`text-sm font-black ${
                              c.redeemed
                                ? 'text-slate-400 line-through'
                                : c.credit_amount < 0
                                  ? 'text-rose-500'
                                  : 'text-emerald-600'
                            }`}>
                              {c.credit_amount > 0 ? `+${c.credit_amount}` : c.credit_amount} cr
                            </span>
                            {c.redeemed && (
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Redeemed</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
