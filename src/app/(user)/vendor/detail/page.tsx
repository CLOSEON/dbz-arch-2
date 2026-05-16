'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getUserById } from '@/lib/queries/users';
import { getVendorReviews, addReview, editReview } from '@/lib/queries/reviews';
import { getDocs, collection, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createSubscription, getUserSubscriptions } from '@/lib/queries/subscriptions';
import { validateDiscountCode } from '@/lib/queries/discounts';
import { getImageUrl } from '@/lib/storage';
import { formatDate, toMillis, cn } from '@/lib/utils';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import type { AppUser, Review, DiscountCode } from '@/types';
import { Star, ChevronLeft, MapPin, Users, Utensils, MessageSquare, Plus, CheckCircle2, Tag, Loader2, X } from 'lucide-react';

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <Star 
            className={`w-8 h-8 ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} 
          />
        </button>
      ))}
    </div>
  );
}

export default function VendorDetailPage() {
  const searchParams = useSearchParams();
  const vendorId = searchParams.get('id') || '';
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [vendor, setVendor] = useState<AppUser | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [todayMenu, setTodayMenu] = useState<any>(null);
  const [userSubs, setUserSubs] = useState<string[]>([]); // active plan IDs (lunch, dinner, both)
  
  // Promo code state
  const [promoInput, setPromoInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  useEffect(() => { loadAll(); }, [vendorId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [v, revs] = await Promise.all([
        getUserById(vendorId),
        getVendorReviews(vendorId),
      ]);
      setVendor(v);
      setReviews(revs);
      const mine = user ? revs.find((r) => r.user_id === user.id) ?? null : null;
      setMyReview(mine);
      if (mine) { setRating(mine.rating); setReviewText(mine.review_text ?? ''); }

      // Load today's menu
      const today = new Date().toISOString().split('T')[0];
      const menuSnap = await getDocs(query(collection(db, 'daily_menus'), where('vendor_id', '==', vendorId), where('date', '==', today)));
      if (!menuSnap.empty) setTodayMenu({ id: menuSnap.docs[0].id, ...menuSnap.docs[0].data() });

      // Load user subscriptions
      if (user) {
        const subs = await getUserSubscriptions(user.id);
        const activeForThisVendor = subs
          .filter(s => s.vendor_id === vendorId && s.status === 'active')
          .map(s => s.meal_type);
        setUserSubs(activeForThisVendor);
      }
    } catch (err) {
      addToast('Failed to load vendor', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewSubmit() {
    if (rating === 0) { addToast('Select a star rating', 'warning'); return; }
    setSubmittingReview(true);
    try {
      if (myReview) {
        await editReview(myReview.id, rating, reviewText);
        addToast('Review updated', 'success');
      } else {
        await addReview(vendorId, user!.id, user!.name, rating, reviewText);
        addToast('Review posted!', 'success');
      }
      setEditingReview(false);
      loadAll();
    } catch { addToast('Failed to post review', 'error'); }
    finally { setSubmittingReview(false); }
  }

  const [subscribing, setSubscribing] = useState<string | null>(null);

  async function handleApplyPromo() {
    if (!promoInput.trim()) return;
    setValidatingPromo(true);
    try {
      const discount = await validateDiscountCode(vendorId, promoInput.trim());
      if (discount) {
        setAppliedDiscount(discount);
        addToast(`Success! ${discount.discount_pct}% off applied.`, 'success');
      } else {
        addToast('Invalid or expired promo code', 'error');
      }
    } catch (err) {
      addToast('Failed to validate promo code', 'error');
    } finally {
      setValidatingPromo(false);
    }
  }

  async function handleSubscribe(planId: string) {
    if (!user) { addToast('Please sign in to subscribe', 'warning'); router.push('/login'); return; }
    
    setSubscribing(planId);
    try {
      await createSubscription({
        user_id: user.id,
        vendor_id: vendorId,
        plan_id: planId,
        meal_type: planId as any,
        discount_pct: appliedDiscount?.discount_pct,
        promo_code: appliedDiscount?.code,
      });
      addToast('Subscription active! 🍛', 'success');
      loadAll();
    } catch { addToast('Failed to subscribe', 'error'); }
    finally { setSubscribing(null); }
  }

  const plans = [
    vendor?.rate_lunch && { id: 'lunch', label: 'Lunch Plan', price: vendor.rate_lunch, type: 'Lunch Only' },
    vendor?.rate_dinner && { id: 'dinner', label: 'Dinner Plan', price: vendor.rate_dinner, type: 'Dinner Only' },
    vendor?.rate_both && { id: 'both', label: 'Lunch + Dinner', price: vendor.rate_both, type: 'Full Day' },
  ].filter(Boolean) as { id: string; label: string; price: number; type: string }[];

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const othersReviews = reviews.filter((r) => r.user_id !== user?.id);

  if (loading) {
    return (
      <div className="page-shell pt-0">
        <div className="skeleton h-52 w-full mb-4 rounded-none" />
        <div className="px-4 space-y-3"><SkeletonCard lines={3} /><SkeletonCard lines={2} /></div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="page-shell flex items-center justify-center">
        <EmptyState icon="⚠️" title="Vendor not found" action={<button className="btn-outline" onClick={() => router.back()}>Go Back</button>} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32 animate-fade-in">
      {/* Premium Hero */}
      <div className="relative h-72 w-full bg-slate-200">
        {vendor.image ? (
          <Image 
            src={getImageUrl(vendor.image)} 
            alt={vendor.name} 
            fill 
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-100 to-slate-200">
            <span className="text-7xl">🍱</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
        
        <button
          onClick={() => router.back()}
          className="absolute top-6 left-6 w-11 h-11 rounded-2xl bg-slate-950/40 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/10 text-white hover:bg-slate-950/60 transition-all active:scale-90"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="absolute bottom-8 left-6 right-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="px-3 py-1 rounded-full bg-brand/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
              {vendor.cuisine_type ?? 'Home Style'}
            </div>
            {avgRating && (
              <div className="px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {avgRating}
              </div>
            )}
          </div>
          <h1 className="text-white text-4xl font-black tracking-tight leading-none drop-shadow-sm">
            {vendor.name}
          </h1>
          <p className="text-white/70 text-sm font-medium mt-2 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Sector 44, Gurgaon
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-5">
        {/* Today's Special Card */}
        {todayMenu && (
          <div className="card !p-0 overflow-hidden bg-white shadow-xl shadow-slate-200/50 group">
            <div className="bg-slate-950 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-brand" />
                <h3 className="text-white font-black text-[11px] uppercase tracking-[0.2em]">Special of the Day</h3>
              </div>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                {todayMenu.date}
              </span>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {todayMenu.items?.map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 group-hover:translate-x-1 transition-transform duration-300">
                    <CheckCircle2 className="w-4 h-4 text-brand mt-0.5 shrink-0" />
                    <p className="text-[15px] font-bold text-slate-700 leading-tight">
                      {item.name}
                      {item.description && (
                        <span className="block text-xs font-medium text-slate-400 mt-1">{item.description}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              {todayMenu.note && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2">
                  <div className="text-brand text-lg leading-none">“</div>
                  <p className="text-[13px] text-slate-500 italic leading-relaxed">{todayMenu.note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Promo Code Section */}
        <div className="px-1">
          {appliedDiscount ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-200">
                  <Tag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Code Applied</p>
                  <p className="text-sm font-bold text-slate-900">{appliedDiscount.code} • {appliedDiscount.discount_pct}% OFF</p>
                </div>
              </div>
              <button 
                onClick={() => { setAppliedDiscount(null); setPromoInput(''); }}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="HAVE A PROMO CODE?"
                  className="w-full bg-white border border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold uppercase tracking-widest outline-none focus:border-brand/40 transition-all placeholder:text-slate-300"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                />
              </div>
              <button
                onClick={handleApplyPromo}
                disabled={validatingPromo || !promoInput.trim()}
                className="bg-slate-950 text-white px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all flex items-center justify-center min-w-[100px]"
              >
                {validatingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
              </button>
            </div>
          )}
        </div>

        {/* Meal Plans Section */}
        <div className="px-1">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[20px] font-black text-slate-900 tracking-tight">Select Plan</h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Flexible subscriptions</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Plus className="w-6 h-6 text-slate-400" />
            </div>
          </div>

          {plans.length === 0 ? (
            <EmptyState icon="📋" title="No plans available" description="This vendor hasn't set their rates yet" />
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => {
                const discountAmount = appliedDiscount ? (plan.price * appliedDiscount.discount_pct) / 100 : 0;
                const finalPrice = plan.price - discountAmount;

                return (
                  <div key={plan.id} className="group relative bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                    <div className="flex items-center p-3 sm:p-4 gap-3 sm:gap-4">
                      <div className={cn(
                        "w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center shadow-inner shrink-0",
                        plan.id === 'lunch' ? 'bg-amber-50 text-amber-500' : 
                        plan.id === 'dinner' ? 'bg-indigo-50 text-indigo-500' : 
                        'bg-brand/10 text-brand'
                      )}>
                        <span className="text-lg sm:text-xl mb-0.5">{plan.id === 'lunch' ? '☀️' : plan.id === 'dinner' ? '🌙' : '🍱'}</span>
                        <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-tighter">{plan.id === 'lunch' ? 'Lunch' : plan.id === 'dinner' ? 'Dinner' : 'Combo'}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">{plan.label}</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 sm:mt-1 truncate">{plan.type}</p>
                        <div className="flex items-center gap-1.5 mt-1 sm:mt-2">
                          {appliedDiscount ? (
                            <>
                              <span className="text-base sm:text-lg font-black text-emerald-600">₹{finalPrice}</span>
                              <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 line-through">₹{plan.price}</span>
                            </>
                          ) : (
                            <span className="text-base sm:text-lg font-black text-slate-900">₹{plan.price}</span>
                          )}
                          <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">/ day</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        disabled={subscribing === plan.id || userSubs.includes(plan.id)}
                        className={cn(
                          "px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                          userSubs.includes(plan.id) 
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-none cursor-default" 
                            : "bg-brand text-white shadow-lg shadow-brand/20 active:scale-95"
                        )}
                      >
                        {subscribing === plan.id ? '...' : userSubs.includes(plan.id) ? 'Subscribed' : 'Subscribe'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reviews Section */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-[17px] font-black text-slate-900 tracking-tight">Reviews</h2>
            <div className="flex items-center gap-1 bg-slate-100 px-3 py-1 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <MessageSquare className="w-3 h-3" /> {reviews.length}
            </div>
          </div>

          {/* User Review Block */}
          <div className="card mb-6 border border-brand/10 bg-brand/[0.02]">
            {!user ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-500 mb-4">Wanna share your feedback?</p>
                <Link href="/login" className="btn-outline inline-flex text-xs px-6 py-2.5">Login to Review</Link>
              </div>
            ) : myReview && !editingReview ? (
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-black text-slate-900 text-sm">Your Feedback</h4>
                    <span className="px-2 py-0.5 rounded-md bg-slate-950 text-white text-[9px] font-black uppercase tracking-widest">Verified</span>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-3.5 h-3.5 ${s <= myReview.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    ))}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed italic">&ldquo;{myReview.review_text}&rdquo;</p>
                </div>
                <button 
                  className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-brand transition-colors" 
                  onClick={() => setEditingReview(true)}
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
            ) : (
              <div>
                <h4 className="font-black text-slate-900 text-sm mb-4">{myReview ? 'Update Your Review' : 'How was the food?'}</h4>
                <StarSelector value={rating} onChange={setRating} />
                <textarea
                  className="input mt-5 resize-none min-h-[100px] border-slate-200/50 bg-white"
                  placeholder="Share your experience with others…"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
                <div className="flex gap-3 mt-5">
                  <button className="btn-primary flex-1 py-4 text-xs font-black uppercase tracking-widest shadow-xl shadow-brand/20" onClick={handleReviewSubmit} disabled={submittingReview}>
                    {submittingReview ? '...' : myReview ? 'Save Update' : 'Post Review'}
                  </button>
                  {myReview && (
                    <button className="btn-outline flex-1 py-4 text-xs font-black uppercase tracking-widest" onClick={() => setEditingReview(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Community Reviews */}
          {othersReviews.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-sm font-bold text-slate-400">No community reviews yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {othersReviews.map((r, i) => (
                <div key={r.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 animate-fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase">
                        {r.user_name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900 text-sm leading-none">{r.user_name}</h5>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{formatDate(r.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={`w-3 h-3 ${s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                  </div>
                  {r.review_text && (
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {r.review_text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
